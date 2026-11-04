export function isValidFutureDate(value, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 23, 59, 59, 999)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false
  return date.getTime() >= now
}
