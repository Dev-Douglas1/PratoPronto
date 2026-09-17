import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { priceOrder, normalizeItems, isOpen, verifyWebhook, verifyPayment } from '../src/domain.js'
import { produtos } from '../src/catalog-data.js'
import { isCheckoutUrl, mercadoPago } from '../src/mercadopago.js'
import { fixedNow, profile, settings, items, config } from './fixtures.js'
const price = overrides => priceOrder({ items, delivery: profile, settings: settings(), now: fixedNow, ...overrides })

test('preço e nome enviados pelo cliente não alteram a cobrança; cálculo usa centavos', () => {
  const result = price({ items: [{ ...items[0], precoUnitario: 0.01, nome: 'Produto adulterado', total: 0.01 }] })
  assert.equal(result.itens[0].nome, 'Calabresa'); assert.equal(result.totalCents, 6390)
  assert.equal(price({ items: [{ id: 'coca-cola', quantidade: 3 }] }).totalCents, 2897)
})
test('tamanho, borda, adicionais e tabela da empresa determinam o preço final', () => {
  const result = price({ items: [{ id: 'calabresa', quantidade: 2, opcoes: { tamanho: 'pequena', borda: 'catupiry', extras: ['bacon'] } }], productSettings: { calabresa: { preco: 65.9 } } })
  assert.equal(result.itens[0].unitCents, 6590); assert.equal(result.totalCents, 13180); assert.equal(result.taxaEntrega, 0)
})
test('aceita os 12 produtos e rejeita opção inventada, repetida ou quantidade inválida', () => {
  assert.equal(price({ items: produtos.map(p => ({ id: p.id, quantidade: 1 })) }).itens.length, 12)
  for (const invalid of [[{ id: 'inventado', quantidade: 1 }], [{ id: 'coca-cola', quantidade: 0 }], [{ id: 'calabresa', quantidade: 1, opcoes: { extras: ['bacon','bacon'] } }], [items[0],items[0]]]) assert.throws(() => normalizeItems(invalid))
})
test('bloqueia loja fechada, produto pausado, endereço incompleto e região não atendida', () => {
  for (const overrides of [{ settings: { ...settings(), acceptingOrders: false } }, { productSettings: { calabresa: { disponivel: false } } }, { delivery: { ...profile, cep: '' } }, { delivery: { ...profile, cidade: 'Outra cidade' } }, { delivery: { ...profile, bairro: 'Fora da rota' } }]) assert.throws(() => price(overrides))
})
test('horário é interpretado no fuso da loja e fechamento é exclusivo', () => {
  const s = settings(); s.hours = Array.from({ length: 7 }, () => [{ start: 1080, end: 1140 }])
  assert.equal(isOpen(s, new Date('2026-09-09T21:59:59Z')), true)
  assert.equal(isOpen(s, new Date('2026-09-09T22:00:00Z')), false)
})
test('assinatura válida aceita e assinatura, ID ou requisição adulterada rejeita', () => {
  const input = { dataId: '123', requestId: 'request-one', secret: 'webhook-test-secret' }
  const digest = createHmac('sha256', input.secret).update('id:123;request-id:request-one;ts:1704908010;').digest('hex')
  const signature = 'ts=1704908010,v1=' + digest
  assert.equal(verifyWebhook({ ...input, signature }), true)
  for (const changed of [{ dataId: '124' }, { requestId: 'another' }, { signature: signature.slice(0,-1) + 'z' }, { secret: '' }]) assert.equal(verifyWebhook({ ...input, signature, ...changed }), false)
})
test('confirmação exige referência, conta, ambiente, moeda e valor corretos', () => {
  const order = { id: 'order', totalCents: 6390, pagamento: { metodo: 'pix', ambiente: 'producao' } }
  const payment = { external_reference: 'order', collector_id: 42, live_mode: true, currency_id: 'BRL', transaction_amount: 63.9 }
  assert.doesNotThrow(() => verifyPayment(payment, order, config))
  for (const altered of [{ external_reference: 'other' }, { collector_id: 43 }, { transaction_amount: 0.01 }, { live_mode: false }, { currency_id: 'USD' }]) assert.throws(() => verifyPayment({ ...payment, ...altered }, order, config))
})
test('redirecionamento aceita somente domínio de checkout e HTTPS', () => {
  assert.equal(isCheckoutUrl('https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123'), true)
  for (const url of ['javascript:alert(1)','https://www.mercadopago.com.br.evil.test','https://user:password@www.mercadopago.com.br','http://www.mercadopago.com.br']) assert.equal(isCheckoutUrl(url), false)
})
test('falha do provedor não vaza payload; reembolso envia a mesma chave idempotente', async () => {
  const calls = []
  const mp = mercadoPago({ token: 'fake-secret', fetcher: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ id: 1 }) } } })
  await mp.refund('123', 'stable-key'); await mp.refund('123', 'stable-key')
  assert.equal(calls[0].options.headers['X-Idempotency-Key'], calls[1].options.headers['X-Idempotency-Key'])
  const bad = mercadoPago({ token: 'fake-secret', fetcher: async () => ({ ok: false, status: 400, json: async () => ({ secret: 'DO-NOT-LEAK' }) }) })
  await assert.rejects(() => bad.payment('123'), error => !error.message.includes('DO-NOT-LEAK'))
})

test('checkout preserva centavos e restringe a modalidade aos meios ativos do provedor', async () => {
  let payload
  const mp = mercadoPago({ token: 'test-only', origin: 'https://loja.example', webhookUrl: 'https://api.example/webhook', environment: 'test', fetcher: async (url, options) => ({ ok: true, json: async () => {
    if (url.endsWith('/v1/payment_methods')) return [{ id: 'pix', status: 'active', payment_type_id: 'bank_transfer' }, { id: 'visa', status: 'active', payment_type_id: 'credit_card' }]
    payload = JSON.parse(options.body)
    return { id: 'pref-test', sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=test' }
  } }) })
  const order = { id: 'order-test', totalCents: 2897, expiresAt: Date.now() + 60000, cliente: { email: 'cliente@example.com' }, pagamento: { metodo: 'pix' } }
  await mp.preference(order)
  assert.equal(payload.items[0].unit_price, 28.97)
  assert.equal(payload.external_reference, order.id)
  assert.deepEqual(payload.payment_methods.excluded_payment_types, [{ id: 'credit_card' }])
  await assert.rejects(() => mp.preference({ ...order, pagamento: { metodo: 'cartao', modalidade: 'debito' } }), /não está disponível/)
})
