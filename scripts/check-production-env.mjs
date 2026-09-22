import { assertCurrentBackend } from '../src/config/backend.js'

try { assertCurrentBackend(process.env) }
catch (error) { console.error(error.message); process.exit(1) }

const required = ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_CONTROLLER_NAME','VITE_PRIVACY_EMAIL']
const missing = required.filter(name => !process.env[name]?.trim())
if (missing.length) {
  console.error('Configuração de produção incompleta: ' + missing.join(', '))
  process.exit(1)
}
if (process.env.VITE_ENABLE_CARD_DEMO === 'true') {
  console.error('Cartão demonstrativo não pode estar habilitado em produção.')
  process.exit(1)
}
console.log('Configuração Supabase validada para produção.')
