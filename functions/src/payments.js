import { hash, requireThat, verifyPayment, cents } from './domain.js'

const time = value => value?.toMillis?.() ?? Number(new Date(value))
export function paymentProcessor({ db, mp, config, now = () => new Date(), log = () => {} }) {
  async function resolved(kind, orderId) {
    const ref = db.doc('operationAlerts/' + hash([kind,orderId]))
    if ((await ref.get()).exists) await ref.update({ state:'resolved', updatedAt:now() })
  }
  async function alert(kind, orderId, code) {
    await db.doc('operationAlerts/' + hash([kind, orderId])).set({ kind, orderId, code, state: 'open', updatedAt: now() }, { merge: true })
    log(kind, { orderId, code })
  }
  async function applyPayment(payment) {
    const paymentId = String(payment.id)
    requireThat(/^\d{1,30}$/.test(paymentId) && /^[a-zA-Z0-9_-]{1,128}$/.test(payment.external_reference || ''), 'Pagamento sem referência válida.', 'failed-precondition')
    const ref = db.doc('orders/' + payment.external_reference)
    await db.runTransaction(async tx => {
      const order = { ...(await tx.get(ref)).data(), id: ref.id }
      requireThat(order.userId, 'Pedido do pagamento não encontrado.', 'not-found')
      verifyPayment(payment, order, config)
      const recordRef = db.doc('providerPayments/' + paymentId)
      const record = (await tx.get(recordRef)).data()
      const jobRef = db.doc('refundJobs/' + hash(paymentId))
      const job = (await tx.get(jobRef)).data()
      const refundRef = db.doc('refundRequests/' + ref.id)
      const refund = (await tx.get(refundRef)).data()
      const providerTime = new Date(payment.date_last_updated || payment.date_created).getTime()
      requireThat(Number.isFinite(providerTime), 'Data do pagamento inválida.', 'failed-precondition')
      if (record && record.providerTime > providerTime) return
      const refundedCents = cents(payment.transaction_amount_refunded || 0)
      tx.set(recordRef, { orderId: ref.id, status: payment.status, providerTime, refundedCents, updatedAt: now() })
      const principal = !order.pagamento.referencia || order.pagamento.referencia === paymentId
      if (payment.status === 'approved' && refundedCents === 0) {
        const approvedAt = new Date(payment.date_approved || payment.date_created || payment.date_last_updated).getTime()
        const mustRefund = !principal || order.status === 'cancelado' || (order.status === 'aguardando_pagamento' && time(order.expiresAt) < approvedAt)
        if (mustRefund) {
          if (!job) tx.create(jobRef, { orderId: ref.id, paymentId, kind: principal ? 'cancellation' : 'duplicate', state: 'pending', attempts: 0, nextAttemptAt: now(), createdAt: now() })
          if (principal && job?.state !== 'done') {
            tx.update(ref, { status: 'cancelado', 'pagamento.status': 'reembolso_pendente', 'pagamento.referencia': paymentId, updatedAt: now() })
            tx.set(refundRef, { orderId: ref.id, userId: order.userId, motivo: refund?.motivo || 'Pagamento confirmado após o prazo ou cancelamento.', resposta: refund?.resposta || 'A devolução foi solicitada ao Mercado Pago. Acompanhe a confirmação aqui.', status: 'reembolso_pendente', createdAt: refund?.createdAt || now(), updatedAt: now() }, { merge: true })
          }
        } else if (!['reembolsado','reembolso_pendente','contestado'].includes(order.pagamento.status)) {
          tx.update(ref, { status: order.status === 'aguardando_pagamento' ? 'confirmado' : order.status, 'pagamento.status': 'aprovado', 'pagamento.referencia': paymentId, 'pagamento.provedorTipo': String(payment.payment_type_id || '').slice(0,60), 'pagamento.provedorMetodo': String(payment.payment_method_id || '').slice(0,60), updatedAt: now() })
          if (order.pagamento.status !== 'aprovado') tx.create(ref.collection('events').doc(), { status: 'pagamento_aprovado', by: 'mercadopago', at: now() })
        }
      } else if (payment.status === 'refunded' && refundedCents >= order.totalCents) {
        if (job) tx.update(jobRef, { state: 'done', finishedAt: now(), lastError: '' })
        if (principal) {
          tx.update(ref, { status: 'cancelado', 'pagamento.status': 'reembolsado', 'pagamento.referencia': paymentId, updatedAt: now() })
          tx.set(refundRef, { orderId: ref.id, userId: order.userId, status: 'reembolsado', motivo: refund?.motivo || 'Devolução confirmada pelo Mercado Pago.', createdAt: refund?.createdAt || now(), updatedAt: now() }, { merge: true })
        }
      } else if (principal && payment.status === 'charged_back') {
        tx.update(ref, { status: order.status === 'entregue' ? 'entregue' : 'cancelado', 'pagamento.status': 'contestado', 'pagamento.referencia': paymentId, updatedAt: now() })
        tx.set(db.doc('operationAlerts/' + hash(['chargeback', ref.id])), { kind: 'chargeback', orderId: ref.id, state: 'open', code: 'payment-disputed', updatedAt: now() })
      } else if (refundedCents > 0 && refundedCents < order.totalCents) {
        if (principal) tx.update(ref, { 'pagamento.status': 'reembolso_parcial', 'pagamento.referencia': paymentId, updatedAt: now() })
        if (job) tx.update(jobRef, { state: 'action_required', lastError: 'partial-refund', updatedAt: now() })
        tx.set(db.doc('operationAlerts/' + hash(['partial-refund', ref.id])), { kind: 'partial-refund', orderId: ref.id, state: 'open', code: 'partial-refund', updatedAt: now() })
      } else if (principal && order.status === 'aguardando_pagamento' && ['pending','in_process','rejected','cancelled'].includes(payment.status)) {
        // A rejected attempt does not claim the order: the same preference can
        // subsequently receive another payment. Preparation remains blocked.
        tx.update(ref, { 'pagamento.status': payment.status === 'rejected' ? 'recusado' : 'pendente', updatedAt: now() })
      }
    })
  }
  async function webhookEvent(eventId) {
    const ref = db.doc('webhookEvents/' + eventId)
    const event = (await ref.get()).data()
    if (!event || event.state === 'done') return
    let payment
    try {
      payment = await mp.payment(event.paymentId)
      await applyPayment(payment)
      await ref.update({ state: 'done', finishedAt: now() })
      await resolved('webhook', payment.external_reference)
      await db.doc('operations/health').set({ lastWebhookAt: now() }, { merge: true })
    } catch (error) {
      const attempts = (event.attempts || 0) + 1
      await ref.update({ attempts, state: attempts >= 8 ? 'action_required' : 'pending', nextAttemptAt: new Date(now().getTime() + Math.min(21600000, 60000 * 2 ** attempts)), lastError: error.code || 'internal' })
      await alert('webhook', payment?.external_reference || '', error.code || 'internal')
    }
  }
  async function refundJob(jobId) {
    const ref = db.doc('refundJobs/' + jobId)
    const lease = await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data()
      if (!job || !['pending','processing'].includes(job.state) || (job.leaseUntil && time(job.leaseUntil) > now().getTime())) return null
      tx.update(ref, { state: 'processing', leaseUntil: new Date(now().getTime() + 120000), attempts: (job.attempts || 0) + 1 })
      return job
    })
    if (!lease) return
    try {
      let payment = await mp.payment(lease.paymentId)
      const order = { ...(await db.doc('orders/' + lease.orderId).get()).data(), id: lease.orderId }
      verifyPayment(payment, order, config)
      const refunded = cents(payment.transaction_amount_refunded || 0)
      if (payment.status === 'refunded' && refunded >= order.totalCents) {
        await applyPayment(payment)
      } else {
        requireThat(payment.status === 'approved' && refunded === 0, 'O provedor exige análise manual desta devolução.', 'failed-precondition')
        // The key is stable across timeouts, retries, schedules and deployments.
        await mp.refund(lease.paymentId, 'pratopronto-refund-' + hash(lease.paymentId).slice(0, 40))
        payment = await mp.payment(lease.paymentId)
        await applyPayment(payment)
        requireThat(payment.status === 'refunded' && cents(payment.transaction_amount_refunded || 0) >= order.totalCents, 'A devolução ainda aguarda confirmação do provedor.', 'unavailable')
      }
      await ref.update({ state: 'done', leaseUntil: null, finishedAt: now(), lastError: '' })
      await resolved('refund', lease.orderId)
      await db.doc('operations/health').set({ lastRefundAt: now() }, { merge: true })
    } catch (error) {
      const attempts = (lease.attempts || 0) + 1
      await ref.update({ state: attempts >= 8 || error.code === 'failed-precondition' ? 'action_required' : 'pending', leaseUntil: null, nextAttemptAt: new Date(now().getTime() + Math.min(21600000, 60000 * 2 ** attempts)), lastError: error.code || 'internal' })
      await alert('refund', lease.orderId, error.code || 'internal')
    }
  }
  async function watch(ref) {
    const task = (await ref.get()).data()
    if (!task?.active) return
    const orderRef = db.doc('orders/' + task.orderId)
    const order = { ...(await orderRef.get()).data(), id: task.orderId }
    try {
      for (const payment of await mp.search(order.id)) await applyPayment(payment)
      await db.runTransaction(async tx => {
        const current = (await tx.get(orderRef)).data()
        if (current.status === 'aguardando_pagamento' && time(current.expiresAt) < now().getTime()) {
          tx.update(orderRef, { status: 'cancelado', 'pagamento.status': 'expirado', updatedAt: now() })
          tx.create(orderRef.collection('events').doc(), { status: 'pagamento_expirado', by: 'server', at: now() })
        }
      })
      await ref.update({ active: now().getTime() - time(task.createdAt) < 7 * 86400000, nextAttemptAt: new Date(now().getTime() + 5 * 60000), lastError: '' })
      await resolved('reconciliation', order.id)
    } catch (error) {
      await ref.update({ nextAttemptAt: new Date(now().getTime() + 5 * 60000), lastError: error.code || 'internal' })
      await alert('reconciliation', order.id, error.code || 'internal')
    }
  }
  async function reconcile() {
    const [events, jobs, watches] = await Promise.all([
      db.collection('webhookEvents').where('state','==','pending').where('nextAttemptAt','<=',now()).orderBy('nextAttemptAt').limit(30).get(),
      db.collection('refundJobs').where('state','in',['pending','processing']).where('nextAttemptAt','<=',now()).orderBy('nextAttemptAt').limit(30).get(),
      db.collection('paymentWatches').where('active','==',true).where('nextAttemptAt','<=',now()).orderBy('nextAttemptAt').limit(30).get(),
    ])
    // Interleave queue types so an outage cannot starve payment reconciliation.
    // Stop before the function deadline; unprocessed records retain their due time.
    const started = Date.now()
    for (let i=0; i<Math.max(events.size,jobs.size,watches.size); i++) {
      if (Date.now()-started > 450000) break
      const tasks=[]
      if (events.docs[i]) tasks.push(webhookEvent(events.docs[i].id))
      if (jobs.docs[i]) tasks.push(refundJob(jobs.docs[i].id))
      if (watches.docs[i]) tasks.push(watch(watches.docs[i].ref))
      await Promise.all(tasks)
    }
    await db.doc('operations/health').set({ lastReconciliationAt: now(), checkedEvents: events.size, checkedRefunds: jobs.size, checkedOrders: watches.size }, { merge: true })
  }
  return { applyPayment, webhookEvent, refundJob, reconcile, watch }
}
