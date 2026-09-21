import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function files(root) {
  const result = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) result.push(...await files(path))
    else if (/\.(js|jsx)$/.test(entry.name)) result.push(path)
  }
  return result
}

test('runtime do navegador não importa SDK Firebase', async () => {
  const paths = await files('src')
  const violations = []
  for (const path of paths) {
    const source = await readFile(path, 'utf8')
    if (/from ['"]firebase\//.test(source) || /VITE_FIREBASE_/.test(source)) violations.push(path)
  }
  assert.deepEqual(violations, [])
})

test('fluxos críticos apontam para Supabase e RLS/RPC', async () => {
  const [user, server, company, marketplace] = await Promise.all([
    readFile('src/context/UserContext.jsx', 'utf8'),
    readFile('src/services/server.js', 'utf8'),
    readFile('src/services/company.js', 'utf8'),
    readFile('src/services/marketplace.js', 'utf8'),
  ])
  assert.match(user, /signInWithPassword/)
  assert.match(user, /auth\.signUp/)
  assert.match(server, /quote_order/)
  assert.match(server, /checkout_order/)
  assert.match(company, /from\('orders'\)/)
  assert.match(marketplace, /respond_order_delivery_offer/)
  assert.match(marketplace, /pilot_confirm_delivery/)
})

test('papéis internos não incluem piloto e entregas usam ofertas separadas', async () => {
  const roles = await readFile('src/config/marketplace.js', 'utf8')
  assert.match(roles, /attendant/)
  assert.match(roles, /kitchen/)
  assert.doesNotMatch(roles, /pilot:\s*'Piloto/)
  const pilot = await readFile('src/pages/PilotPartner.jsx', 'utf8')
  assert.match(pilot, /Aceitar entrega/)
  assert.match(pilot, /Recusar/)
})
