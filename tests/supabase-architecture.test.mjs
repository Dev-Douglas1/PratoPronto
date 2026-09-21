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
  assert.match(server, /pilot_confirm_delivery/)
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


test('cadastro de piloto nasce no perfil e exige dados da moto', async () => {
  const [profile, signup, route, marketplace] = await Promise.all([
    readFile('src/pages/Perfil.jsx', 'utf8'),
    readFile('src/pages/PilotSignup.jsx', 'utf8'),
    readFile('src/components/PilotRoute.jsx', 'utf8'),
    readFile('src/services/marketplace.js', 'utf8'),
  ])
  assert.match(profile, /Se torne um piloto das entregas/)
  assert.match(profile, /\/piloto\/cadastro/)
  assert.match(signup, /Dados do seu perfil/)
  assert.match(signup, /Placa da moto/)
  assert.match(signup, /Tipo ou modelo da moto/)
  assert.match(signup, /Cor da moto/)
  assert.match(signup, /usuario\.telefone/)
  assert.match(signup, /usuario\.cidade/)
  assert.match(route, /!pilotProfile/)
  assert.match(marketplace, /get_my_pilot_profile/)
  assert.match(marketplace, /p_vehicle_plate/)
  assert.match(marketplace, /p_motorcycle_type/)
  assert.match(marketplace, /p_vehicle_color/)
})
