import { assertCurrentBackend } from '../src/config/backend.js'

try { assertCurrentBackend(process.env) }
catch (error) { console.error(error.message); process.exit(1) }

const required = [
  'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID',
  'VITE_CONTROLLER_NAME', 'VITE_PRIVACY_EMAIL', 'VITE_FIREBASE_APPCHECK_SITE_KEY',
]
const missing = required.filter(name => !process.env[name]?.trim())
if (missing.length) {
  console.error(`Configuração de produção incompleta: ${missing.join(', ')}`)
  process.exit(1)
}
if (process.env.VITE_FIREBASE_APPCHECK_DEBUG === 'true' || process.env.VITE_ENABLE_CARD_DEMO === 'true') {
  console.error('App Check debug e cartão demonstrativo não podem estar habilitados em produção.')
  process.exit(1)
}
console.log('Configuração local validada. Confirme a publicação e homologação das Cloud Functions antes de receber pedidos.')
