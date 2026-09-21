export const DEFAULT_COMPANY_ID = 'pratopronto'

export const COMPANY_ROLE_LABELS = {
  owner: 'Proprietário',
  admin: 'Administrador',
  attendant: 'Atendente',
  kitchen: 'Cozinha',
}

export const COMPANY_STAFF_ROLES = ['owner', 'admin', 'attendant', 'kitchen']

export function roleLabel(role) {
  return COMPANY_ROLE_LABELS[role] || role || 'Membro'
}

export function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}
