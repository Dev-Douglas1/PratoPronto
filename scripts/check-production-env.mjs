const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_CONTROLLER_NAME',
  'VITE_PRIVACY_EMAIL',
]

const missing = required.filter((name) => !process.env[name]?.trim())

if (missing.length) {
  console.error(`Configuração de produção incompleta: ${missing.join(', ')}`)
  process.exit(1)
}

if (process.env.VITE_ENABLE_CARD_DEMO === 'true') {
  console.error('VITE_ENABLE_CARD_DEMO não pode estar habilitado em produção.')
  process.exit(1)
}

const secureBackendValue = process.env.VITE_SECURE_ORDER_BACKEND?.trim() || 'false'
if (!['true', 'false'].includes(secureBackendValue)) {
  console.error('VITE_SECURE_ORDER_BACKEND deve ser true ou false.')
  process.exit(1)
}

if (!process.env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim()) {
  if (secureBackendValue === 'true') {
    console.error('App Check é obrigatório antes de ativar o backend seguro de pedidos.')
    process.exit(1)
  }
  console.warn('AVISO: Firebase App Check ainda não foi configurado. Configure antes de ativar enforcement.')
}

if (secureBackendValue === 'true') {
  console.log('Backend seguro de pedidos marcado para uso. Confirme que quoteOrder e createSecureOrder já foram publicados no Firebase Functions.')
}

if (!/^https?:\/\//i.test(process.env.VITE_FIREBASE_AUTH_DOMAIN || 'https://placeholder.invalid')) {
  // authDomain normalmente é um host, não uma URL; este bloco existe apenas
  // para impedir validações equivocadas no futuro sem rejeitar o formato atual.
}

console.log('Configuração de produção validada.')
