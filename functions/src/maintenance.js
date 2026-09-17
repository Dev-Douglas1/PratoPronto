import { hash } from './domain.js'

const time = value => value?.toMillis?.() ?? Number(new Date(value))
export function maintenance({ db, authAdmin, config, credential, now = () => new Date() }) {
  async function privacy(uid) {
    const ref = db.doc('privacyRequests/' + uid)
    const request = (await ref.get()).data()
    if (!request || request.status === 'concluido') return
    // The last administrator must transfer access before closing this account.
    if ((await db.doc('admins/' + uid).get()).exists) {
      await ref.update({ status: 'transferir_administracao', updatedAt: now() }); return
    }
    const orders = await db.collection('orders').where('userId','==',uid).get()
    const unsettled = orders.docs.some(doc => {
      const order = doc.data()
      return !['entregue','cancelado'].includes(order.status) || ['reembolso_pendente','reembolso_manual_pendente','reembolso_parcial','contestado'].includes(order.pagamento.status)
    })
    if (unsettled) { await ref.update({ status: 'aguardando_pedidos', updatedAt: now() }); return }
    // Backend jobs finish this workflow even if the user closes their browser.
    // Keep only the minimal transaction record; remove delivery and contact data.
    for (const doc of orders.docs) await doc.ref.update({ cliente: { nome: 'Conta excluída', email: '', telefone: '' }, entrega: { endereco: '', numero: '', bairro: '', complemento: '', cep: '', cidade: '', uf: '' }, observacao: '', redacted: true })
    for (const name of ['reviews','quotes']) {
      const rows = await db.collection(name).where('userId','==',uid).get()
      for (const doc of rows.docs) await doc.ref.delete()
    }
    const refunds = await db.collection('refundRequests').where('userId','==',uid).get()
    for (const doc of refunds.docs) await doc.ref.update({ motivo: 'Dados pessoais removidos a pedido do titular.', resposta: '', redacted: true })
    await db.doc('users/' + uid).delete()
    await db.doc('emailChallenges/' + uid).delete()
    const loginEmails = await db.collection('loginEmailJobs').where('uid','==',uid).get()
    for (const message of loginEmails.docs) await message.ref.delete()
    try { await authAdmin.revokeRefreshTokens(uid); await authAdmin.deleteUser(uid) } catch (error) { if (error.code !== 'auth/user-not-found') throw error }
    await ref.set({ userId: uid, status: 'concluido', createdAt: request.createdAt, updatedAt: now() })
  }
  async function clean() {
    // TTL can also be enabled in GCP. This bounded cleanup works without TTL billing.
    for (const name of ['quotes','rateLimits','webhookEvents']) {
      const docs = await db.collection(name).where('expiresAt','<',now()).limit(200).get()
      for (const doc of docs.docs) await doc.ref.delete()
    }
    const requests = await db.collection('privacyRequests').where('status','in',['pendente','aguardando_pedidos']).limit(50).get()
    for (const request of requests.docs) await privacy(request.id)
    // Rotate across old orders, rather than repeatedly scanning the same first page.
    const cursorRef = db.doc('operations/retention')
    const cursor = (await cursorRef.get()).data()?.cursor || ''
    let query = db.collection('orders').orderBy('__name__').limit(200)
    if (cursor) query = query.startAfter(cursor)
    const page = await query.get()
    for (const doc of page.docs) {
      const order = doc.data()
      if (order.redacted || !['entregue','cancelado'].includes(order.status) || ['reembolso_pendente','reembolso_manual_pendente','reembolso_parcial','contestado'].includes(order.pagamento.status)) continue
      if (time(order.updatedAt) + (order.retentionDays || 3650) * 86400000 > now().getTime()) continue
      await doc.ref.update({ cliente: { nome: 'Dados removidos por retenção', email: '', telefone: '' }, entrega: { endereco: '', numero: '', bairro: '', complemento: '', cep: '', cidade: '', uf: '' }, observacao: '', redacted: true })
    }
    await cursorRef.set({ cursor: page.size < 200 ? '' : page.docs.at(-1).id, updatedAt: now() })
    await db.doc('operations/health').set({ lastMaintenanceAt: now() }, { merge: true })
  }
  async function backup() {
    const ref = db.doc('operations/backup')
    if (!config.backupBucket) {
      await ref.set({ configured: false, state: 'not_configured', checkedAt: now() }); return
    }
    const previous = (await ref.get()).data()
    const accessToken = (await credential.getAccessToken()).access_token
    const headers = { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }
    if (previous?.state === 'running') {
      const check = await fetch('https://firestore.googleapis.com/v1/' + previous.operation, { headers, signal: AbortSignal.timeout(15000) })
      if (!check.ok) throw new Error('backup-status-failed')
      const status = await check.json()
      if (!status.done) return
      await ref.update({ state: status.error ? 'failed' : 'succeeded', checkedAt: now(), ...(status.error ? {} : { lastSuccessAt: now() }) })
      if (status.error) throw new Error('backup-export-failed')
    }
    const date = now().toISOString().slice(0,10)
    if (previous?.day === date) return
    const response = await fetch('https://firestore.googleapis.com/v1/projects/' + config.projectId + '/databases/(default):exportDocuments', { method: 'POST', headers,
      body: JSON.stringify({ outputUriPrefix: 'gs://' + config.backupBucket + '/firestore/' + date + '-' + hash(now().toISOString()).slice(0,8) }), signal: AbortSignal.timeout(15000) })
    if (!response.ok) { await ref.set({ configured: true, state: 'failed', checkedAt: now(), day: date }, { merge: true }); throw new Error('backup-export-failed') }
    const operation = await response.json()
    await ref.set({ configured: true, state: 'running', operation: operation.name, checkedAt: now(), day: date }, { merge: true })
  }
  return { clean, privacy, backup }
}
