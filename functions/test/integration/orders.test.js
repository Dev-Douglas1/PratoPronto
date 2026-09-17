import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createService } from '../../src/service.js'
import { paymentProcessor } from '../../src/payments.js'
import { hash } from '../../src/domain.js'
import { maintenance } from '../../src/maintenance.js'
import { fixedNow, profile, settings, actor, admin, config, items } from '../fixtures.js'

if (!process.env.FIRESTORE_EMULATOR_HOST || !/^127\.0\.0\.1:|^localhost:/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('Estes testes exigem um emulador local. Nunca executar em produção.')
const projectId = 'demo-pratopronto'
let app, db, service, processor, mp, payments, preferenceCalls, refundCalls, clock, authCalls
before(() => { app = initializeApp({ projectId }); db = getFirestore(app) })
after(async () => { await db.terminate(); await deleteApp(app) })
beforeEach(async () => {
  await fetch('http://' + process.env.FIRESTORE_EMULATOR_HOST + '/emulator/v1/projects/' + projectId + '/databases/(default)/documents', { method: 'DELETE' })
  clock = new Date(fixedNow); preferenceCalls = 0; refundCalls = []; authCalls = []; payments = new Map()
  mp = {
    account: async () => ({ id: 42 }),
    preference: async order => { preferenceCalls++; return { id: 'pref-' + order.id, url: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test' } },
    payment: async id => structuredClone(payments.get(String(id))),
    search: async orderId => [...payments.values()].filter(p => p.external_reference === orderId),
    refund: async (id,key) => { refundCalls.push(key); const p = payments.get(id); p.status = 'refunded'; p.transaction_amount_refunded = p.transaction_amount; p.date_last_updated = new Date(clock.getTime() + 1000).toISOString(); return { id: 'refund' } },
  }
  const dependencies = { db, config, mp, now: () => clock, authAdmin: { revokeRefreshTokens: async uid => authCalls.push(uid), deleteUser: async uid => authCalls.push(uid) } }
  service = createService(dependencies); processor = paymentProcessor(dependencies)
  await db.doc('users/cliente').set(profile)
  await db.doc('admins/empresa').set({ role: 'restaurant_admin' })
  await db.doc('settings/restaurant').set(settings())
})
const quote = (method = 'pix') => service.quote(actor, { items, method, cardType: 'credito', acceptTerms: true })
async function create(method = 'pix') { const q = await quote(method); return service.checkout(actor, { quoteId: q.quoteId, requestId: crypto.randomUUID() }) }
async function paid(orderId, paymentId = '123') {
  const order = (await db.doc('orders/' + orderId).get()).data()
  const payment = { id: paymentId, external_reference: orderId, collector_id: 42, currency_id: 'BRL', live_mode: true, transaction_amount: order.total, transaction_amount_refunded: 0, status: 'approved', date_last_updated: clock.toISOString() }
  payments.set(paymentId, payment); await processor.applyPayment(payment)
}

test('cliques concorrentes e nova chave para o mesmo resumo criam um único pedido e uma preferência', async () => {
  const q = await quote(); const args = { quoteId: q.quoteId, requestId: 'same-request-key-12345' }
  const results = await Promise.all([service.checkout(actor,args),service.checkout(actor,args)])
  assert.equal(results[0].orderId, results[1].orderId)
  assert.equal((await service.checkout(actor,{ ...args, requestId: 'another-request-key-12345' })).orderId, results[0].orderId)
  assert.equal((await db.collection('orders').get()).size, 1); assert.equal(preferenceCalls, 1)
})
test('alteração de preço entre resumo e confirmação bloqueia cobrança', async () => {
  const q = await quote()
  await db.doc('productSettings/calabresa').set({ preco: 99, disponivel: true })
  await assert.rejects(() => service.checkout(actor,{ quoteId: q.quoteId, requestId: crypto.randomUUID() }), /preço/)
  assert.equal(preferenceCalls,0); assert.equal((await db.collection('orders').get()).size,0)
})
test('promoção vencida ou pausada depois do resumo exige nova confirmação sem cobrar', async () => {
  const ref = db.doc('productSettings/calabresa')
  const promocao = { titulo: 'Oferta da casa', percentual: 20, inicio: +clock - 1000, fim: +clock + 60000, ativa: true }
  await ref.set({ preco: 58.9, disponivel: true, promocao })
  const first = await quote()
  assert.equal(first.itens[0].precoUnitario, 47.12)
  clock = new Date(+clock + 60000)
  await assert.rejects(() => service.checkout(actor, { quoteId: first.quoteId, requestId: crypto.randomUUID() }), /preço/)
  await ref.update({ promocao: { ...promocao, fim: +clock + 60000 } })
  const second = await quote()
  await ref.update({ 'promocao.ativa': false })
  await assert.rejects(() => service.checkout(actor, { quoteId: second.quoteId, requestId: crypto.randomUUID() }), /preço/)
  assert.equal(preferenceCalls, 0)
  assert.equal((await db.collection('orders').get()).size, 0)
})
test('pedido preserva o desconto confirmado mesmo que a campanha mude depois', async () => {
  const ref = db.doc('productSettings/calabresa')
  await ref.set({ preco: 58.9, disponivel: true, promocao: { titulo: 'Oferta da casa', percentual: 20, inicio: +clock - 1000, fim: +clock + 60000, ativa: true } })
  const result = await create('maquina_entrega')
  await ref.update({ 'promocao.ativa': false })
  const order = (await db.doc('orders/' + result.orderId).get()).data()
  assert.equal(order.total, 52.12)
  assert.equal(order.itens[0].promocao.percentual, 20)
  assert.equal(order.itens[0].precoOriginal, 58.9)
  assert.equal(preferenceCalls, 0)
})
test('servidor rejeita observação ofensiva antes de criar o resumo', async () => {
  await assert.rejects(() => service.quote(actor, { items, method: 'pix', cardType: 'credito', acceptTerms: true, note: 'p0rr4!' }), /ofensivas/)
  assert.equal((await db.collection('quotes').get()).size, 0)
})
test('não aceita pedido alheio, cliente como administrador ou e-mail não verificado', async () => {
  const result = await create()
  await assert.rejects(() => service.resume({ ...actor, uid: 'intruso' },{ orderId: result.orderId }))
  await assert.rejects(() => service.advance(actor,{ orderId: result.orderId, next: 'preparando' }))
  await assert.rejects(() => service.quote({ ...actor, email_verified: false },{ items, method: 'pix' }))
  await db.doc('admins/empresa').delete()
  await assert.rejects(() => service.advance(admin,{ orderId: result.orderId, next: 'preparando' }))
})
test('preparo só começa após confirmação do provedor; notificação repetida não volta etapa', async () => {
  const { orderId } = await create()
  await assert.rejects(() => service.advance(admin,{ orderId, next: 'preparando' }))
  await paid(orderId)
  await service.advance(admin,{ orderId, next: 'preparando' })
  await processor.applyPayment(payments.get('123'))
  assert.equal((await db.doc('orders/' + orderId).get()).data().status, 'preparando')
})
test('pagamento com conta ou valor divergente não aprova pedido', async () => {
  const { orderId } = await create()
  await assert.rejects(() => processor.applyPayment({ id:'123', external_reference:orderId, collector_id:99, live_mode:true, currency_id:'BRL', transaction_amount:63.9, status:'approved', date_last_updated:clock.toISOString() }))
  assert.equal((await db.doc('orders/' + orderId).get()).data().status, 'aguardando_pagamento')
})
test('cancelamento solicita reembolso e só confirma devolução depois de consultar o provedor', async () => {
  const { orderId } = await create(); await paid(orderId)
  await service.requestRefund(actor,{ orderId, reason:'Cancelar este pedido, por favor.' })
  await service.decide(admin,{ orderId, approve:true, answer:'Cancelamento aprovado.' })
  assert.equal((await db.doc('orders/' + orderId).get()).data().pagamento.status,'reembolso_pendente')
  await processor.refundJob(hash('123'))
  assert.equal((await db.doc('orders/' + orderId).get()).data().pagamento.status,'reembolsado')
  await processor.refundJob(hash('123')); assert.equal(refundCalls.length,1)
})
test('timeout depois da devolução não devolve dinheiro duas vezes', async () => {
  const { orderId } = await create(); await paid(orderId)
  await service.requestRefund(actor,{ orderId, reason:'Pedido não chegou.' })
  await service.decide(admin,{ orderId, approve:true, answer:'Vamos devolver o pagamento.' })
  const original = mp.refund
  mp.refund = async (...args) => { await original(...args); throw new Error('timeout') }
  await processor.refundJob(hash('123')); clock = new Date(clock.getTime() + 300000)
  await processor.refundJob(hash('123'))
  assert.equal(refundCalls.length,1); assert.equal((await db.doc('orders/' + orderId).get()).data().pagamento.status,'reembolsado')
})
test('segundo pagamento é devolvido sem cancelar o pagamento principal', async () => {
  const { orderId } = await create(); await paid(orderId,'123'); await paid(orderId,'124')
  assert.equal((await db.doc('refundJobs/' + hash('124')).get()).data().kind,'duplicate')
  await processor.refundJob(hash('124'))
  const order = (await db.doc('orders/' + orderId).get()).data()
  assert.equal(order.pagamento.referencia,'123'); assert.equal(order.pagamento.status,'aprovado')
})
test('confirmação recebida após expiração gera devolução, sem mandar à cozinha', async () => {
  const { orderId } = await create(); clock = new Date(clock.getTime() + 31 * 60000); await paid(orderId)
  const order = (await db.doc('orders/' + orderId).get()).data()
  assert.equal(order.status,'cancelado'); assert.equal(order.pagamento.status,'reembolso_pendente')
})
test('resultado desconhecido na criação não repete preferência nem inventa aprovação', async () => {
  mp.preference = async () => { preferenceCalls++; throw new Error('timeout') }
  const q = await quote(); const args = { quoteId:q.quoteId, requestId:crypto.randomUUID() }
  const first = await service.checkout(actor,args); const again = await service.checkout(actor,args)
  assert.equal(first.checkoutState,'unknown'); assert.equal(again.checkoutUrl,null); assert.equal(preferenceCalls,1)
})
test('maquininha exige recebimento e devolução manual requer comprovante', async () => {
  const { orderId } = await create('maquina_entrega')
  for (const next of ['preparando','pronto','saiu_entrega']) await service.advance(admin,{ orderId, next })
  await assert.rejects(() => service.advance(admin,{ orderId, next:'entregue' }))
  await service.advance(admin,{ orderId, next:'entregue', received:true })
  await service.requestRefund(actor,{ orderId, reason:'Problema com o pedido entregue.' })
  await service.decide(admin,{ orderId, approve:true, answer:'Faremos a devolução pela maquininha.' })
  assert.equal((await db.doc('orders/' + orderId).get()).data().pagamento.status,'reembolso_manual_pendente')
  await assert.rejects(() => service.confirmManualRefund(admin,{ orderId, proof:'' }))
  await service.confirmManualRefund(admin,{ orderId, proof:'Comprovante terminal TEST-123' })
  assert.equal(refundCalls.length,0); assert.equal(preferenceCalls,0)
})
test('limitação de tentativas impede abuso de criação de resumos', async () => {
  for (let i=0; i<15; i++) await quote()
  await assert.rejects(() => quote(), error => error.code === 'resource-exhausted')
})
test('exclusão espera pedido e remove contato e conta após conclusão', async () => {
  const { orderId } = await create('maquina_entrega')
  await service.privacyRequest(actor)
  const clean = maintenance({ db, config, now:() => clock, authAdmin: { revokeRefreshTokens: async uid => authCalls.push(uid), deleteUser: async uid => authCalls.push(uid) } })
  await clean.privacy(actor.uid)
  assert.equal((await db.doc('privacyRequests/cliente').get()).data().status,'aguardando_pedidos')
  assert.equal(authCalls.length,0)
  for (const next of ['preparando','pronto','saiu_entrega','entregue']) await service.advance(admin,{ orderId, next, received:true })
  await clean.privacy(actor.uid)
  assert.equal((await db.doc('users/cliente').get()).exists,false)
  assert.equal((await db.doc('orders/' + orderId).get()).data().cliente.email,'')
  assert.equal(authCalls.length,2)
})


test('resumo expirado é recuperável sem criar pedido e sinaliza reinício seguro', async () => {
  const q=await quote(); clock=new Date(clock.getTime()+6*60000)
  await assert.rejects(() => service.checkout(actor,{ quoteId:q.quoteId,requestId:crypto.randomUUID() }), error => error.restartCheckout===true)
  assert.equal((await db.collection('orders').get()).size,0)
})
test('pagamento feito no prazo é aceito quando a notificação chega atrasada', async () => {
  const { orderId }=await create()
  const order=(await db.doc('orders/'+orderId).get()).data()
  clock=new Date(clock.getTime()+35*60000)
  await processor.applyPayment({ id:'125',external_reference:orderId,collector_id:42,currency_id:'BRL',live_mode:true,transaction_amount:order.total,status:'approved',transaction_amount_refunded:0,date_approved:new Date(fixedNow.getTime()+20*60000).toISOString(),date_last_updated:clock.toISOString() })
  assert.equal((await db.doc('orders/'+orderId).get()).data().status,'confirmado')
})
test('depois de solicitar exclusão não é possível criar outra compra', async () => {
  const q=await quote()
  await service.privacyRequest(actor)
  await assert.rejects(() => quote())
  await assert.rejects(() => service.checkout(actor,{ quoteId:q.quoteId,requestId:crypto.randomUUID() }))
  assert.equal((await db.collection('orders').get()).size,0)
})
