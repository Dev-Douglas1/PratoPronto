const normalizar = value => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  : ''

// This is only an estimate for the cart. The server validates the final price.
export function estimarEntrega(store, usuario, subtotal) {
  if (!store?.address || !usuario || !Array.isArray(store.zones)) return null
  if (!Number.isFinite(subtotal) || subtotal < 0) return null
  const cidade = normalizar(usuario.cidade)
  const uf = normalizar(usuario.uf)
  const bairro = normalizar(usuario.bairro)
  if (!cidade || !uf || !bairro) return null
  if (normalizar(store.address.cidade) !== cidade || normalizar(store.address.uf) !== uf) return null
  const zone = store.zones.find(item => item && normalizar(item.bairro) === bairro)
  if (!zone || !Number.isInteger(zone.feeCents) || zone.feeCents < 0) return null
  const gratis = Number.isInteger(zone.freeAboveCents) && zone.freeAboveCents >= 0
    && Math.round(subtotal * 100) >= zone.freeAboveCents
  return gratis ? 0 : zone.feeCents / 100
}
