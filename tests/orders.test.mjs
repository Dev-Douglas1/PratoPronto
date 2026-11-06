import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canAdvanceOrder } from '../src/config/orderStatus.js'
import { filterOrders, amountToCollect, paymentStatusLabel } from '../src/utils/pedido.js'

test('as etapas só avançam uma posição e pedidos encerrados não reabrem', () => {
  assert.equal(canAdvanceOrder({ status: 'confirmado' }, 'preparando'), true)
  assert.equal(canAdvanceOrder({ status: 'confirmado' }, 'entregue'), false)
  assert.equal(canAdvanceOrder({ status: 'entregue' }, 'preparando'), false)
  assert.equal(canAdvanceOrder({ status: 'cancelado' }, 'preparando'), false)
  assert.equal(canAdvanceOrder({ status: 'Pedido confirmado • preparando' }, 'pronto'), true)
})
test('pedidos reais são filtrados por aba e busca normaliza acentos', () => {
  const orders = [
    { id: '1', status: 'confirmado', createdAt: '2026-11-01T10:00:00Z', cliente: { nome: 'João' }, entrega: { bairro: 'São José' } },
    { id: '2', status: 'preparando', createdAt: '2026-11-01T11:00:00Z', cliente: { nome: 'Ana' }, entrega: { bairro: 'Centro' } },
    { id: '3', status: 'pronto', createdAt: '2026-11-01T12:00:00Z', cliente: { nome: 'Bia' }, entrega: { bairro: 'Centro' } },
    { id: '4', status: 'saiu_entrega', createdAt: '2026-11-01T13:00:00Z', cliente: { nome: 'Caio' }, entrega: { bairro: 'Centro' } },
    { id: '5', status: 'entregue', createdAt: '2026-11-01T14:00:00Z', cliente: { nome: 'Davi' }, entrega: { bairro: 'Centro' } },
    { id: '6', status: 'cancelado', createdAt: '2026-11-01T15:00:00Z', cliente: { nome: 'Eva' }, entrega: { bairro: 'Centro' } },
  ]
  assert.equal(filterOrders(orders, 'pedidos').length, 3)
  assert.equal(filterOrders(orders, 'entregas').length, 2)
  assert.equal(filterOrders(orders, 'concluidos').length, 2)
  assert.equal(filterOrders(orders, 'pedidos', 'sao jose').length, 1)
  assert.equal(filterOrders(orders, 'pedidos', 'inexistente').length, 0)
})
test('comanda só cobra valor pendente e nunca um cancelamento ou pagamento aprovado', () => {
  const order = { total: 89.99, status: 'saiu_entrega', pagamento: { status: 'pendente_entrega' } }
  assert.equal(amountToCollect(order), 89.99)
  assert.equal(amountToCollect({ ...order, status: 'cancelado' }), 0)
  assert.equal(amountToCollect({ ...order, pagamento: { status: 'aprovado_demo' } }), 0)
  assert.match(paymentStatusLabel({ status: 'cancelado_demo' }), /sem cobrança/)
})
