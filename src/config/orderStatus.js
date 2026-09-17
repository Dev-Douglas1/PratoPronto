export const ORDER_STATUS = {
  AGUARDANDO_PAGAMENTO: 'aguardando_pagamento',
  CONFIRMADO: 'confirmado',
  PREPARANDO: 'preparando',
  PRONTO: 'pronto',
  SAIU_ENTREGA: 'saiu_entrega',
  ENTREGUE: 'entregue',
  CANCELADO: 'cancelado',
}

export const ORDER_STATUS_OPTIONS = [
  { id: ORDER_STATUS.AGUARDANDO_PAGAMENTO, label: 'Aguardando pagamento' },
  { id: ORDER_STATUS.CONFIRMADO, label: 'Pedido confirmado' },
  { id: ORDER_STATUS.PREPARANDO, label: 'Preparando' },
  { id: ORDER_STATUS.PRONTO, label: 'Pronto para sair' },
  { id: ORDER_STATUS.SAIU_ENTREGA, label: 'Saiu para entrega' },
  { id: ORDER_STATUS.ENTREGUE, label: 'Entregue' },
  { id: ORDER_STATUS.CANCELADO, label: 'Cancelado' },
]

const LEGACY_STATUS = {
  'Pedido confirmado • preparando': ORDER_STATUS.PREPARANDO,
  'Pedido confirmado • pagamento na entrega': ORDER_STATUS.CONFIRMADO,
}

export function normalizeOrderStatus(status) {
  return LEGACY_STATUS[status] || status || ORDER_STATUS.CONFIRMADO
}

export function orderStatusLabel(status) {
  const normalized = normalizeOrderStatus(status)
  return ORDER_STATUS_OPTIONS.find((item) => item.id === normalized)?.label || status || 'Pedido confirmado'
}

export const NEXT_STATUS = { confirmado: 'preparando', preparando: 'pronto', pronto: 'saiu_entrega', saiu_entrega: 'entregue' }
export const NEXT_ACTION = { confirmado: 'Aceitar e preparar', preparando: 'Marcar como pronto', pronto: 'Despachar entrega', saiu_entrega: 'Confirmar entrega' }

export function canAdvanceOrder(order, next) {
  return NEXT_STATUS[normalizeOrderStatus(order.status)] === next
}
