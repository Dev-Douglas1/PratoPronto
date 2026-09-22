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
  assert.match(signup, /Dados vindos do seu perfil/)
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
  assert.match(signup, /CNH — frente/)
  assert.match(signup, /CNH — verso/)
  assert.match(signup, /Foto atual do piloto/)
  assert.match(signup, /Foto da moto/)
  assert.match(signup, /submitPilotApplication/)
  assert.match(marketplace, /pilot-documents/)
  assert.match(marketplace, /submit_pilot_application/)
})

test('ofertas de entrega ficam bloqueadas até aprovação manual do piloto', async () => {
  const [pilot, review, route, marketplace] = await Promise.all([
    readFile('src/pages/PilotPartner.jsx', 'utf8'),
    readFile('src/pages/PilotReview.jsx', 'utf8'),
    readFile('src/components/PlatformAdminRoute.jsx', 'utf8'),
    readFile('src/services/marketplace.js', 'utf8'),
  ])
  assert.match(pilot, /approval_status === 'approved'/)
  assert.match(pilot, /Em análise/)
  assert.match(pilot, /Cadastro precisa de correção/)
  assert.match(review, /Aprovar Piloto Parceiro/)
  assert.match(review, /Reprovar e pedir correção/)
  assert.match(route, /platformAdmin/)
  assert.match(marketplace, /review_pilot_application/)
  assert.match(marketplace, /list_pilot_applications/)
})


test('runtime não referencia tabelas e RPCs legadas removidas do Supabase', async () => {
  const paths = await files('src')
  const forbidden = [
    'app_commit',
    'app_rate',
    'store_settings',
    "from('pedidos')",
    'pedido_itens',
    "from('produtos')",
    "from('enderecos')",
    "from('favoritos')",
    'restaurant_admins',
  ]
  const violations = []
  for (const path of paths) {
    const source = await readFile(path, 'utf8')
    for (const token of forbidden) {
      if (source.includes(token)) violations.push(path + ' -> ' + token)
    }
  }
  assert.deepEqual(violations, [])
})


test('operações críticas expõem moderação e status operacional', async () => {
  const [server, marketplace, pilotReview, companies, pilotArea, dashboard] = await Promise.all([
    readFile('src/services/server.js', 'utf8'),
    readFile('src/services/marketplace.js', 'utf8'),
    readFile('src/pages/PilotReview.jsx', 'utf8'),
    readFile('src/pages/PlatformCompanies.jsx', 'utf8'),
    readFile('src/pages/PilotPartner.jsx', 'utf8'),
    readFile('src/pages/CompanyDashboard.jsx', 'utf8'),
  ])
  assert.match(server, /accountStatus/)
  assert.match(marketplace, /set_pilot_account_status/)
  assert.match(marketplace, /set_restaurant_account_status/)
  assert.match(marketplace, /audit_events/)
  assert.match(pilotReview, /Suspender/)
  assert.match(pilotReview, /Bloquear/)
  assert.match(companies, /Empresas da plataforma/)
  assert.match(companies, /Auditoria recente/)
  assert.match(pilotArea, /operationalStatus/)
  assert.match(dashboard, /companyOperationalStatus/)
})

test('retenção documental fica acessível apenas pelo fluxo administrativo', async () => {
  const [marketplace, pilotReview] = await Promise.all([
    readFile('src/services/marketplace.js', 'utf8'),
    readFile('src/pages/PilotReview.jsx', 'utf8'),
  ])
  assert.match(marketplace, /pilot-document-cleanup/)
  assert.match(marketplace, /pilot_document_cleanup_queue/)
  assert.match(pilotReview, /Processar retenção de documentos/)
})


test('mutações críticas da empresa não escrevem diretamente nas tabelas protegidas', async () => {
  const [company, marketplace, dashboard] = await Promise.all([
    readFile('src/services/company.js', 'utf8'),
    readFile('src/services/marketplace.js', 'utf8'),
    readFile('src/pages/CompanyDashboard.jsx', 'utf8'),
  ])
  assert.doesNotMatch(company, /from\('products'\)\.update/)
  assert.doesNotMatch(marketplace, /from\('restaurant_pilot_contacts'\)\.(insert|update|delete)/)
  assert.match(company, /update_restaurant_product_state/)
  assert.match(marketplace, /save_restaurant_pilot_contact/)
  assert.match(marketplace, /remove_restaurant_pilot_contact/)
  assert.match(dashboard, /audit:read/)
  assert.match(dashboard, /CompanyAudit/)
})

test('plataforma possui moderação de empresas e pilotos sem apagar histórico', async () => {
  const [app, profile, companies, pilots] = await Promise.all([
    readFile('src/App.jsx', 'utf8'),
    readFile('src/pages/Perfil.jsx', 'utf8'),
    readFile('src/pages/PlatformCompanies.jsx', 'utf8'),
    readFile('src/pages/PilotReview.jsx', 'utf8'),
  ])
  assert.match(app, /\/plataforma\/empresas/)
  assert.match(profile, /Administrar empresas/)
  assert.match(companies, /Suspender/)
  assert.match(companies, /Bloquear/)
  assert.match(companies, /Reativar/)
  assert.match(pilots, /Suspender/)
  assert.match(pilots, /Bloquear/)
  assert.match(pilots, /Reativar acesso/)
})


test('service worker não persiste sessão, API ou dados de cliente', async () => {
  const sw = await readFile('public/sw.js', 'utf8')
  assert.match(sw, /event\.request\.method !== 'GET'/)
  assert.match(sw, /url\.origin !== self\.location\.origin/)
  assert.match(sw, /Somente arquivos estáticos/)
  assert.match(sw, /\^\\\/\(assets\|images\|icons\)\\\//)
  assert.doesNotMatch(sw, /supabase\.co/)
  assert.doesNotMatch(sw, /authorization/i)
  assert.doesNotMatch(sw, /localStorage/)
})


test('documentos de piloto usam quatro caminhos fixos e não podem ser apagados pelo frontend', async () => {
  const [marketplace, signup] = await Promise.all([
    readFile('src/services/marketplace.js', 'utf8'),
    readFile('src/pages/PilotSignup.jsx', 'utf8'),
  ])
  assert.match(marketplace, /const path = `\$\{uid\}\/\$\{kind\}`/)
  assert.match(marketplace, /upsert: true/)
  assert.doesNotMatch(marketplace, /removePilotDocuments/)
  assert.doesNotMatch(marketplace, /storage\.from\(PILOT_BUCKET\)\.remove/)
  assert.match(signup, /savePilotProfile/)
  assert.match(signup, /submitPilotApplication/)
})

test('cardápio e contatos de entrega usam somente RPCs rate-limitáveis para escrita', async () => {
  const [company, marketplace] = await Promise.all([
    readFile('src/services/company.js', 'utf8'),
    readFile('src/services/marketplace.js', 'utf8'),
  ])
  assert.match(company, /update_restaurant_product_state/)
  assert.doesNotMatch(company, /from\('products'\)\.update/)
  assert.match(marketplace, /save_restaurant_pilot_contact/)
  assert.match(marketplace, /remove_restaurant_pilot_contact/)
})


test('cadastro usa OTP de seis dígitos e recuperação possui tela para nova senha', async () => {
  const [user, verify, app, reset] = await Promise.all([
    readFile('src/context/UserContext.jsx', 'utf8'),
    readFile('src/pages/VerificarEmail.jsx', 'utf8'),
    readFile('src/App.jsx', 'utf8'),
    readFile('src/pages/RedefinirSenha.jsx', 'utf8'),
  ])
  assert.match(user, /auth\.verifyOtp/)
  assert.match(user, /type:\s*'email'/)
  assert.match(user, /\/redefinir-senha/)
  assert.match(verify, /one-time-code/)
  assert.match(verify, /\\d\{6\}/)
  assert.match(app, /\/redefinir-senha/)
  assert.match(reset, /exchangeCodeForSession/)
  assert.match(reset, /auth\.updateUser\(\{ password:/)
})


test('login social e telefone usam os fluxos oficiais do Supabase Auth', async () => {
  const [user, login, phone, callback] = await Promise.all([
    readFile('src/context/UserContext.jsx', 'utf8'),
    readFile('src/pages/Login.jsx', 'utf8'),
    readFile('src/pages/LoginTelefone.jsx', 'utf8'),
    readFile('src/pages/AuthCallback.jsx', 'utf8'),
  ])
  assert.match(user, /signInWithOAuth/)
  assert.match(user, /provider:\s*'google'/)
  assert.match(user, /signInWithOtp\(\{ phone:/)
  assert.match(user, /type:\s*'sms'/)
  assert.match(user, /exchangeCodeForSession/)
  assert.match(login, /Continuar com Google/)
  assert.match(login, /Entrar com telefone/)
  assert.match(phone, /one-time-code/)
  assert.match(callback, /accountDestination/)
})


test('falha na consulta de empresa não derruba o perfil autenticado', async () => {
  const user = await readFile('src/context/UserContext.jsx', 'utf8')
  const migration = await readFile('supabase/migrations/20260922151000_fix_authenticated_profile_loading.sql', 'utf8')
  assert.match(user, /getAdminStatus\(user\.id\)\.catch\(\(\) => false\)/)
  assert.match(migration, /grant execute on function private\.restaurant_membership_exists\(uuid, uuid\) to authenticated/i)
  assert.match(migration, /phone_confirmed_at is not null/)
})
