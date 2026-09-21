import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

export const DEFAULT_COMPANY_ID = 'pratopronto'

export const COMPANY_ROLE_PERMISSIONS = Object.freeze({
  owner: ['company:manage', 'team:manage', 'catalog:manage', 'orders:read', 'orders:advance', 'orders:print', 'reviews:reply', 'refunds:manage', 'pilots:assign'],
  admin: ['company:manage', 'team:manage', 'catalog:manage', 'orders:read', 'orders:advance', 'orders:print', 'reviews:reply', 'refunds:manage', 'pilots:assign'],
  member: ['orders:read', 'orders:advance', 'orders:print', 'reviews:reply', 'refunds:manage', 'pilots:assign'],
  kitchen: ['orders:read', 'orders:advance', 'orders:print'],
  support: ['orders:read', 'orders:print', 'reviews:reply', 'refunds:manage'],
  pilot: ['pilot:deliver'],
})

export function normalizeCompanyId(value) {
  const companyId = String(value || DEFAULT_COMPANY_ID).trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(companyId)) throw new Error('Identificador da empresa inválido.')
  return companyId
}

export function permissionsForRole(role) {
  return COMPANY_ROLE_PERMISSIONS[String(role || '').toLowerCase()] || []
}

export function roleCan(role, permission) {
  return permissionsForRole(role).includes(permission)
}

export function createDeliveryCode() {
  return String(randomInt(0, 10000)).padStart(4, '0')
}

export function deliveryCodeHash(orderId, code) {
  return createHash('sha256').update(`${String(orderId)}:${String(code)}`).digest('hex')
}

export function verifyDeliveryCode(orderId, code, expectedHash) {
  const normalized = String(code || '').trim()
  if (!/^\d{4}$/.test(normalized) || !/^[a-f0-9]{64}$/i.test(String(expectedHash || ''))) return false
  const calculated = Buffer.from(deliveryCodeHash(orderId, normalized), 'hex')
  const expected = Buffer.from(String(expectedHash), 'hex')
  return calculated.length === expected.length && timingSafeEqual(calculated, expected)
}
