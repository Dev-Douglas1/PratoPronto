import { assertRespectful, LIMITS } from './input-policy.js'

export function validatePromotion(input) {
  if (!input || typeof input !== 'object') throw new Error('Confira os dados da promoção.')
  const titulo = typeof input.titulo === 'string' ? input.titulo.trim() : ''
  if (titulo.length < 3 || titulo.length > LIMITS.titleMax) throw new Error('O título deve ter de 3 a 60 caracteres.')
  assertRespectful(titulo, 'o título da promoção')
  if (!Number.isInteger(input.percentual) || input.percentual < 1 || input.percentual > 90) throw new Error('Informe um desconto inteiro de 1% a 90%.')
  if (!Number.isSafeInteger(input.inicio) || !Number.isSafeInteger(input.fim) || input.inicio <= 0 || input.fim <= input.inicio || input.fim - input.inicio > 90 * 86400000) throw new Error('A validade deve terminar depois do início e durar até 90 dias.')
  if (typeof input.ativa !== 'boolean') throw new Error('Escolha se a promoção está ativa.')
  return { titulo, percentual: input.percentual, inicio: input.inicio, fim: input.fim, ativa: input.ativa }
}
export function promotionStatus(promotion, now = Date.now()) {
  try { validatePromotion(promotion) } catch { return 'sem_oferta' }
  if (Number(now) >= promotion.fim) return 'encerrada'
  if (!promotion.ativa) return 'pausada'
  if (Number(now) < promotion.inicio) return 'agendada'
  return 'ativa'
}
export function promotionalPrice(unitCents, promotion, now = Date.now()) {
  const active = promotionStatus(promotion, now) === 'ativa'
  const finalCents = active ? Math.max(1, Math.round(unitCents * (100 - promotion.percentual) / 100)) : unitCents
  return { finalCents, discountCents: unitCents - finalCents, promotion: active ? { titulo: promotion.titulo.trim(), percentual: promotion.percentual, fim: promotion.fim } : null }
}
