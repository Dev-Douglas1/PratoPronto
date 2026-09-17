// The two server implementations use different catalog and order schemas.
// Never silently send a legacy Worker checkout to Cloud Functions.
export function assertCurrentBackend(env = {}) {
  const legacy = String(env.VITE_SECURE_ORDER_BACKEND ?? 'false').trim()
  if (legacy !== 'false') {
    throw new Error('A configuração de pedidos pertence à versão Cloudflare anterior. A empresa precisa revisar a integração do servidor antes de receber pedidos nesta versão.')
  }
}
