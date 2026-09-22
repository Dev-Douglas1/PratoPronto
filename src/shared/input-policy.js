// Shared by the browser and Supabase-facing services. Never apply moderation to
// passwords, email addresses, identifiers or payment references.
export const LIMITS = Object.freeze({ nameMin: 2, nameMax: 80, passwordMin: 12, passwordMax: 128, titleMax: 60 })
const letters = 'a-zA-ZÀ-ÿ0-9'
const variants = { a: '[a4@áàâãä]', e: '[e3éèêë]', i: '[i1!íìîï]', o: '[o0óòôõö]', u: '[uúùûü]', s: '[s5$]' }
const separator = '[\\s._*\\-\u200b-\u200d]*'
const words = ['porra', 'caralho', 'merda', 'puta', 'puto', 'putaria', 'buceta', 'foda', 'foder', 'fodase', 'fodido', 'fodida', 'arrombado', 'arrombada', 'cuzao', 'cuzona', 'viado', 'viada']
export const OFFENSIVE_PATTERN = `(^|[^${letters}])(?:${words.map(word => [...word].map(letter => (variants[letter] || letter) + '+').join(separator)).join('|')})(s)?($|[^${letters}])`
const offensive = new RegExp(OFFENSIVE_PATTERN, 'i')
export function hasOffensiveLanguage(value) { return typeof value === 'string' && offensive.test(value) }
export function assertRespectful(value, label = 'o texto') {
  if (hasOffensiveLanguage(value)) throw new Error(`Revise ${label}: palavras ofensivas não são permitidas.`)
  return value
}
export function normalizeName(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '' }
export function validateName(value) {
  const name = normalizeName(value)
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) throw new Error('O nome deve ter de 2 a 80 caracteres.')
  if (!/^[\p{L}\p{M}][\p{L}\p{M} '.’\-]*$/u.test(name)) throw new Error('Use letras, espaços, apóstrofos ou hífens no nome.')
  return assertRespectful(name, 'o nome')
}
export function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2)
  return digits
}
export function validatePhone(value) {
  const phone = normalizePhone(value)
  if (!/^[1-9][0-9]{9,10}$/.test(phone)) throw new Error('Informe um telefone com DDD e 10 ou 11 números.')
  return phone
}
export function phoneInput(value) { return normalizePhone(value) }
export function normalizeCep(value) { return String(value || '').replace(/\D/g, '').slice(0, 8) }
export function validateCep(value) {
  const cep = String(value || '').replace(/\D/g, '')
  if (!/^\d{8}$/.test(cep)) throw new Error('Informe um CEP com exatamente 8 números.')
  return cep
}
export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < LIMITS.passwordMin || value.length > LIMITS.passwordMax) {
    throw new Error('A senha deve ter de 12 a 128 caracteres.')
  }
  const hasLower = /[a-z]/.test(value)
  const hasUpper = /[A-Z]/.test(value)
  const hasDigit = /\d/.test(value)
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};'\\:"|<>?,.\/\`~]/.test(value)
  if (!hasLower || !hasUpper || !hasDigit || !hasSymbol) {
    throw new Error('A senha deve ter pelo menos uma letra minúscula, uma maiúscula, um número e um símbolo.')
  }
  return value
}
