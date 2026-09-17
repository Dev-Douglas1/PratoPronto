import { DomainError, requireThat, text, publicText, phone, hash, normalizeItems, priceOrder, validateSettings, isOpen, NEXT } from './domain.js'
import { POLICY_VERSION, TERMS_VERSION } from './policy.js'

const millis = value => value?.toMillis?.() ?? Number(new Date(value))
const id = value => { requireThat(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value), 'Identificador inválido.'); return value }

export function createService({ db, config, mp, authAdmin, now = () => new Date(), log = () => {} }) {
  const orderRef = orderId => db.doc('orders/' + id(orderId))
  const settingsRef = db.doc('settings/restaurant')
  function user(context) {
    requireThat(context?.uid && context.email && context.email_verified === true, 'Entre na conta e confirme seu e-mail para continuar.', 'unauthenticated')
    id(context.uid)
    return context
  }
  async function admin(context, tx) {
    const actor = user(context)
    const ref = db.doc('admins/' + actor.uid)
    const snapshot = tx ? await tx.get(ref) : await ref.get()
    requireThat(snapshot.data()?.role === 'restaurant_admin', 'Esta ação é exclusiva da empresa.', 'permission-denied')
    return actor
  }
  async function rate(context, action, limit = 10) {
    const actor = user(context)
    const minute = Math.floor(now().getTime() / 60000)
    const ref = db.doc('rateLimits/' + hash([actor.uid, action, minute]))
    await db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data()
      requireThat((data?.count || 0) < limit, 'Muitas tentativas. Aguarde um minuto e tente novamente.', 'resource-exhausted')
      tx.set(ref, { count: (data?.count || 0) + 1, expiresAt: new Date(now().getTime() + 3600000) })
    })
  }
  function paymentReady(method) {
    requireThat(['test','production'].includes(config.environment), 'Os pedidos ainda não foram ativados pela empresa.', 'failed-precondition')
    if (config.environment === 'production') requireThat(config.enforceAppCheck && config.liveEnabled, 'A operação real ainda não foi liberada pela empresa.', 'failed-precondition')
    if (method !== 'maquina_entrega') requireThat(config.hasPaymentSecrets && config.collectorId && /^https:\/\//.test(config.origin || ''), 'O pagamento online ainda não foi ativado. Escolha pagamento na entrega, se disponível.', 'failed-precondition')
  }
  async function priceData(tx, inputs, delivery, settings) {
    const refs = [...new Set(inputs.map(i => i.id))].map(productId => db.doc('productSettings/' + productId))
    const snapshots = await Promise.all(refs.map(ref => tx ? tx.get(ref) : ref.get()))
    return priceOrder({ items: inputs, delivery, settings, now: now(), productSettings: Object.fromEntries(snapshots.map(snap => [snap.id, snap.data()])) })
  }
  const publicOrder = order => ({ orderId: order.id, checkoutUrl: order.checkout?.state === 'ready' && order.status === 'aguardando_pagamento' ? order.checkout.url : null, status: order.status, checkoutState: order.checkout?.state || 'none' })
  async function storefront() {
    const settings = (await settingsRef.get()).data()
    return { configured: Boolean(settings), open: Boolean(settings && isOpen(settings, now())), environment: config.environment,
      name: settings?.name || 'PratoPronto', legalName: settings?.legalName || '', privacyEmail: settings?.privacyEmail || '', retentionDays: settings?.retentionDays || null, phone: settings?.phone || '', address: settings?.address || null,
      methods: (settings?.methods || []).filter(method => { try { paymentReady(method); return true } catch { return false } }),
      hours: settings?.hours || [], timezone: settings?.timezone || 'America/Sao_Paulo', zones: settings?.zones || [], estimateMinutes: settings?.estimateMinutes || null,
    }
  }
  async function quote(context, data) {
    const actor = user(context)
    await rate(actor, 'quote', 15)
    requireThat(data.acceptTerms === true, 'Leia os termos e a política apresentados antes de confirmar o pedido.')
    const items = normalizeItems(data.items)
    const [profile, settingsSnapshot, privacy] = await Promise.all([db.doc('users/' + actor.uid).get(), settingsRef.get(), db.doc('privacyRequests/' + actor.uid).get()])
    requireThat(!privacy.exists, 'Sua conta está com exclusão solicitada. Conclua esse atendimento antes de fazer novos pedidos.', 'failed-precondition')
    const settings = settingsSnapshot.data()
    requireThat(settings, 'A empresa ainda está configurando a loja.', 'failed-precondition')
    paymentReady(data.method)
    requireThat(settings.methods.includes(data.method), 'Esta forma de pagamento está indisponível.')
    requireThat(data.method === 'pix' || ['credito','debito'].includes(data.cardType), 'Selecione crédito ou débito.')
    const profileData = profile.data()
    requireThat(profileData, 'Complete seu perfil antes de pedir.', 'failed-precondition')
    const priced = await priceData(null, items, profileData, settings)
    const ref = db.collection('quotes').doc()
    const payload = { userId: actor.uid, items, method: data.method, cardType: data.method === 'pix' ? 'pix' : data.cardType,
      note: publicText(data.note || '', 'a observação', 0, 500), priced,
      cliente: { nome: publicText(profileData.nome, 'o nome', 2, 80), email: actor.email, telefone: phone(profileData.telefone) },
      consent: { policyVersion: POLICY_VERSION, termsVersion: TERMS_VERSION, acceptedAt: now() },
      environment: config.environment, expiresAt: new Date(now().getTime() + 5 * 60000), createdAt: now() }
    await ref.set(payload)
    return { quoteId: ref.id, ...priced, expiresAt: payload.expiresAt.toISOString(), environment: config.environment }
  }
  async function checkout(context, data) {
    const actor = user(context)
    await rate(actor, 'checkout', 8)
    const requestId = text(data.requestId, 'a referência da compra', 16, 100)
    requireThat(/^[a-zA-Z0-9_-]+$/.test(requestId), 'Referência da compra inválida.')
    const ref = orderRef(hash([actor.uid, requestId]).slice(0, 40))
    const quoteRef = db.doc('quotes/' + id(data.quoteId))
    let created = false
    let order
    try { order = await db.runTransaction(async tx => {
      const existing = await tx.get(ref)
      if (existing.exists) {
        requireThat(existing.data().quoteId === data.quoteId, 'Esta tentativa já pertence a outro pedido.', 'already-exists')
        return { ...existing.data(), id: ref.id }
      }
      const q = (await tx.get(quoteRef)).data()
      requireThat(q && q.userId === actor.uid, 'Resumo de compra inválido.', 'permission-denied')
      if (q.orderId) return { ...(await tx.get(orderRef(q.orderId))).data(), id: q.orderId }
      requireThat(!(await tx.get(db.doc('privacyRequests/' + actor.uid))).exists, 'Sua conta está com exclusão solicitada.', 'failed-precondition')
      requireThat(millis(q.expiresAt) > now().getTime(), 'O resumo expirou. Confira os valores novamente.', 'failed-precondition')
      requireThat(q.environment === config.environment, 'O ambiente de pagamento mudou. Atualize o resumo.', 'failed-precondition')
      paymentReady(q.method)
      const settings = (await tx.get(settingsRef)).data()
      requireThat(settings?.methods.includes(q.method), 'Esta forma de pagamento foi pausada.', 'failed-precondition')
      const priced = await priceData(tx, q.items, q.priced.entrega, settings)
      requireThat(hash(priced) === hash(q.priced), 'O preço ou a entrega mudou. Confira o resumo atualizado antes de pagar.', 'failed-precondition')
      const payload = { ...priced, userId: actor.uid, quoteId: data.quoteId, cliente: q.cliente, observacao: q.note,
        pagamento: { metodo: q.method, modalidade: q.cardType, ambiente: config.environment === 'production' ? 'producao' : 'teste', status: q.method === 'maquina_entrega' ? 'pendente_entrega' : 'pendente', referencia: '' },
        status: q.method === 'maquina_entrega' ? 'confirmado' : 'aguardando_pagamento', createdAt: now(), updatedAt: now(),
        expiresAt: new Date(now().getTime() + 30 * 60000), checkout: { state: q.method === 'maquina_entrega' ? 'none' : 'reserved' },
        retentionDays: settings.retentionDays, consent: q.consent,
      }
      tx.create(ref, payload)
      tx.update(quoteRef, { orderId: ref.id })
      tx.create(ref.collection('events').doc(), { status: payload.status, by: actor.uid, at: now() })
      if (q.method !== 'maquina_entrega') tx.set(db.doc('paymentWatches/' + ref.id), { orderId: ref.id, active: true, nextAttemptAt: new Date(now().getTime() + 60000), createdAt: now() })
      created = true
      return { ...payload, id: ref.id }
    }) } catch (error) {
      if (error instanceof DomainError) error.restartCheckout = true
      throw error
    }
    // Only the transaction that acquires this reservation may contact the provider.
    // Unknown results are reconciled, never blindly submitted a second time.
    if (order.pagamento.metodo !== 'maquina_entrega') {
      const ownRef = orderRef(order.id)
      const claimed = await db.runTransaction(async tx => {
        const current = (await tx.get(ownRef)).data()
        if (current.checkout.state !== 'reserved' || current.status !== 'aguardando_pagamento') return false
        tx.update(ownRef, { 'checkout.state': 'creating', updatedAt: now() }); return true
      })
      if (claimed) {
        try {
          requireThat(String((await mp.account()).id) === String(config.collectorId), 'A conta recebedora precisa ser corrigida pela empresa.', 'failed-precondition')
          const preference = await mp.preference({ ...order, expiresAt: millis(order.expiresAt) })
          await ownRef.update({ checkout: { state: 'ready', preferenceId: preference.id, url: preference.url }, updatedAt: now() })
        } catch (error) {
          await ownRef.update({ 'checkout.state': 'unknown', updatedAt: now() })
          log('checkout_pending', { orderId: order.id, code: error.code || 'internal' })
        }
      }
      order = { ...(await ownRef.get()).data(), id: order.id }
    }
    return { ...publicOrder(order), created }
  }
  async function resume(context, data) {
    const actor = user(context)
    await rate(actor, 'resume', 10)
    const ref = orderRef(data.orderId)
    const order = (await ref.get()).data()
    requireThat(order?.userId === actor.uid, 'Pedido não encontrado nesta conta.', 'permission-denied')
    requireThat(order.pagamento.ambiente === (config.environment === 'production' ? 'producao' : 'teste'), 'Este pedido pertence a outro ambiente.', 'failed-precondition')
    if (millis(order.expiresAt) <= now().getTime()) return { orderId: ref.id, checkoutUrl: null, status: order.status, checkoutState: 'expired' }
    return publicOrder({ ...order, id: ref.id })
  }
  async function advance(context, data) {
    await admin(context); await rate(context, 'advance', 60)
    const ref = orderRef(data.orderId)
    return db.runTransaction(async tx => {
      await admin(context, tx)
      const order = (await tx.get(ref)).data()
      requireThat(order && NEXT[order.status] === data.next, 'O pedido mudou de etapa. Confira a atualização.', 'failed-precondition')
      requireThat(['aprovado','pendente_entrega','recebido_entrega'].includes(order.pagamento.status), 'Resolva o pagamento antes de avançar o pedido.', 'failed-precondition')
      let payment = { ...order.pagamento }
      if (data.next === 'entregue' && payment.status === 'pendente_entrega') {
        requireThat(data.received === true, 'Confirme o recebimento na maquininha antes de concluir.')
        payment.status = 'recebido_entrega'
        payment.recebidoPor = context.uid
        payment.recebidoEm = now()
      }
      tx.update(ref, { status: data.next, pagamento: payment, updatedAt: now(), updatedBy: context.uid })
      tx.create(ref.collection('events').doc(), { status: data.next, by: context.uid, at: now() })
      return { status: data.next }
    })
  }
  async function requestRefund(context, data) {
    const actor = user(context); await rate(actor, 'refund', 5)
    const ref = db.doc('refundRequests/' + id(data.orderId))
    const motivo = publicText(data.reason, 'o motivo', 5, 500)
    return db.runTransaction(async tx => {
      const order = (await tx.get(orderRef(data.orderId))).data()
      requireThat(order?.userId === actor.uid, 'Pedido não encontrado.', 'permission-denied')
      const existing = await tx.get(ref)
      if (existing.exists) return { id: ref.id, status: existing.data().status }
      requireThat(order.status !== 'cancelado', 'Este pedido já está cancelado.', 'failed-precondition')
      tx.create(ref, { orderId: data.orderId, userId: actor.uid, motivo, status: 'pendente', createdAt: now(), updatedAt: now() })
      return { id: ref.id, status: 'pendente' }
    })
  }
  async function decide(context, data) {
    await admin(context); await rate(context, 'decide', 30)
    const ref = orderRef(data.orderId)
    const refundRef = db.doc('refundRequests/' + ref.id)
    const answer = publicText(data.answer, 'a resposta ao cliente', 3, 1000)
    requireThat(typeof data.approve === 'boolean', 'Confira a decisão.')
    return db.runTransaction(async tx => {
      await admin(context, tx)
      const request = (await tx.get(refundRef)).data()
      const order = (await tx.get(ref)).data()
      requireThat(request && order && request.userId === order.userId && request.status === 'pendente', 'Esta solicitação já foi analisada.', 'failed-precondition')
      let paymentStatus = order.pagamento.status
      let refundStatus = 'recusado'
      if (data.approve) {
        if (paymentStatus === 'recebido_entrega') { paymentStatus = 'reembolso_manual_pendente'; refundStatus = 'reembolso_manual_pendente' }
        else if (paymentStatus === 'aprovado' && order.pagamento.referencia) {
          paymentStatus = 'reembolso_pendente'; refundStatus = 'reembolso_pendente'
          tx.set(db.doc('refundJobs/' + hash(order.pagamento.referencia)), { orderId: ref.id, paymentId: order.pagamento.referencia, kind: 'cancellation', state: 'pending', nextAttemptAt: now(), attempts: 0, createdAt: now() }, { merge: true })
        } else if (paymentStatus === 'reembolsado') refundStatus = 'reembolsado'
        else { paymentStatus = 'cancelado'; refundStatus = 'cancelado_sem_cobranca' }
        tx.update(ref, { status: 'cancelado', 'pagamento.status': paymentStatus, updatedAt: now(), updatedBy: context.uid })
        tx.create(ref.collection('events').doc(), { status: 'cancelado', by: context.uid, at: now() })
      }
      tx.update(refundRef, { status: refundStatus, resposta: answer, updatedAt: now(), updatedBy: context.uid })
      return { status: refundStatus }
    })
  }
  async function confirmManualRefund(context, data) {
    await admin(context)
    const ref = orderRef(data.orderId)
    const proof = text(data.proof, 'a referência do comprovante de devolução', 5, 150)
    return db.runTransaction(async tx => {
      await admin(context, tx)
      const order = (await tx.get(ref)).data()
      requireThat(order?.pagamento.status === 'reembolso_manual_pendente', 'Este pedido não aguarda devolução manual.', 'failed-precondition')
      tx.update(ref, { 'pagamento.status': 'reembolsado_manual', 'pagamento.comprovante': proof, updatedAt: now(), updatedBy: context.uid })
      tx.update(db.doc('refundRequests/' + ref.id), { status: 'reembolsado_manual', updatedAt: now(), updatedBy: context.uid })
      tx.create(ref.collection('events').doc(), { status: 'reembolsado_manual', by: context.uid, at: now() })
      return { status: 'reembolsado_manual' }
    })
  }
  async function saveSettings(context, input) {
    await admin(context)
    const value = validateSettings(input)
    if (value.acceptingOrders) value.methods.forEach(paymentReady)
    await db.runTransaction(async tx => {
      await admin(context, tx)
      tx.set(settingsRef, { ...value, updatedAt: now(), updatedBy: context.uid })
      tx.create(db.collection('auditEvents').doc(), { action: 'settings_updated', by: context.uid, at: now() })
    })
    return { saved: true }
  }
  async function readiness(context) {
    await admin(context)
    const [settings, metrics] = await Promise.all([settingsRef.get(), db.doc('operations/health').get()])
    let receiverVerified = false
    if (config.hasPaymentSecrets && config.collectorId) {
      try { receiverVerified = String((await mp.account()).id) === String(config.collectorId) } catch { /* Return status only. */ }
    }
    return { environment: config.environment, liveEnabled: config.liveEnabled, appCheck: config.enforceAppCheck,
      paymentSecrets: config.hasPaymentSecrets, receiverVerified, publicUrlConfigured: Boolean(config.origin),
      restaurantConfigured: settings.exists, acceptingOrders: settings.data()?.acceptingOrders === true,
      health: metrics.data() || null,
    }
  }
  async function privacyRequest(context) {
    const actor = user(context); await rate(actor, 'privacy', 2)
    const ref = db.doc('privacyRequests/' + actor.uid)
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).exists) return
      tx.create(ref, { userId: actor.uid, status: 'pendente', createdAt: now(), updatedAt: now() })
    })
    return { requested: true }
  }
  return { storefront, quote, checkout, resume, advance, requestRefund, decide, confirmManualRefund, saveSettings, readiness, privacyRequest, admin, rate }
}
