import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canAdvanceOrder } from '../src/config/orderStatus.js'
import { filterOrders, amountToCollect, paymentStatusLabel } from '../src/utils/pedido.js'
import { makeCompanyDemo } from '../src/data/companyDemo.js'

test('as etapas só avançam uma posição e pedidos encerrados não reabrem', () => {
  assert.equal(canAdvanceOrder({ status: 'confirmado' }, 'preparando'), true)
  assert.equal(canAdvanceOrder({ status: 'confirmado' }, 'entregue'), false)
  assert.equal(canAdvanceOrder({ status: 'entregue' }, 'preparando'), false)
  assert.equal(canAdvanceOrder({ status: 'cancelado' }, 'preparando'), false)
  assert.equal(canAdvanceOrder({ status: 'Pedido confirmado • preparando' }, 'pronto'), true)
})
test('pedidos das diferentes abas, acentos e busca pelo bairro', () => {
  const { orders } = makeCompanyDemo()
  assert.equal(filterOrders(orders, 'pedidos').length, 4)
  assert.equal(filterOrders(orders, 'entregas').length, 2)
  assert.equal(filterOrders(orders, 'concluidos').length, 2)
  const result = filterOrders([{ ...orders[0], cliente: { nome: 'João' }, entrega: { bairro: 'São José' } }], 'pedidos', 'sao jose')
  assert.equal(result.length, 1)
  assert.equal(filterOrders(orders, 'pedidos', 'inexistente').length, 0)
})
test('comanda só cobra valor pendente e nunca um cancelamento ou pagamento aprovado', () => {
  const order = { total: 89.99, status: 'saiu_entrega', pagamento: { status: 'pendente_entrega' } }
  assert.equal(amountToCollect(order), 89.99)
  assert.equal(amountToCollect({ ...order, status: 'cancelado' }), 0)
  assert.equal(amountToCollect({ ...order, pagamento: { status: 'aprovado_demo' } }), 0)
  assert.match(paymentStatusLabel({ status: 'cancelado_demo' }), /sem cobrança/)
})
