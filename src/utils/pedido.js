import { normalizeOrderStatus } from '../config/orderStatus.js'

export function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (value?.seconds) return value.seconds * 1000
  return Number(new Date(value || 0)) || 0
}

export function paymentLabel(payment) {
  if (payment?.provedorTipo === 'account_money') return 'Saldo Mercado Pago'
  if (payment?.provedorTipo === 'credit_card') return 'Crédito online'
  if (payment?.provedorTipo === 'debit_card') return 'Débito online'
  if (payment?.metodo === 'pix') return 'Pix'
  const card = payment?.modalidade === 'debito' ? 'Débito' : 'Crédito'
  return payment?.metodo === 'maquina_entrega' ? `${card} • levar maquininha` : `${card} online`
}

export function paymentStatusLabel(payment) {
  return ({ pendente: 'Aguardando confirmação do provedor', aprovado: 'Pagamento aprovado', recebido_entrega: 'Recebido na entrega', recusado: 'Pagamento recusado', expirado: 'Prazo de pagamento encerrado', cancelado: 'Cancelado · sem cobrança confirmada', reembolso_pendente: 'Devolução solicitada ao Mercado Pago', reembolsado: 'Devolução confirmada pelo Mercado Pago', reembolso_manual_pendente: 'Empresa deve devolver o pagamento da entrega', reembolsado_manual: 'Devolução informada pela empresa', reembolso_parcial: 'Devolução parcial · entre em contato', contestado: 'Pagamento em contestação', pendente_entrega: 'Cobrar na entrega', aprovado_demo: 'Aprovado · teste', recebido_demo: 'Recebido · teste', reembolsado_demo: 'Reembolsado · teste', cancelado_demo: 'Cancelado · sem cobrança' })[payment?.status] || 'Consultar pagamento'
}

export function amountToCollect(order) {
  return order?.pagamento?.status === 'pendente_entrega' && normalizeOrderStatus(order?.status) !== 'cancelado' ? order.total : 0
}

export function filterOrders(orders, tab, search = '', status = 'todos') {
  const needle = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  return orders.filter(order => {
    const current = normalizeOrderStatus(order.status)
    if (tab === 'pedidos' && !['aguardando_pagamento', 'confirmado', 'preparando', 'pronto'].includes(current)) return false
    if (tab === 'entregas' && !['pronto', 'saiu_entrega'].includes(current)) return false
    if (tab === 'concluidos' && !['entregue', 'cancelado'].includes(current)) return false
    if (status !== 'todos' && current !== status) return false
    const text = [order.id, order.cliente?.nome, order.entrega?.bairro].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return text.includes(needle)
  }).sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))
}
