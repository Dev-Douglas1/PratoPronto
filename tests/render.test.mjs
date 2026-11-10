import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'
import { accountDestination } from '../src/utils/access.js'

let server, UserProvider, CompanyProvider, CartProvider, FavoritesProvider, useCart
before(async () => {
  // No browser, external requests, real accounts or listening HTTP server.
  server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, hmr: false },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': '"https://fixture.supabase.co"',
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_fixture"',
    } })
  ;({ UserProvider } = await server.ssrLoadModule('/src/context/UserContext.jsx'))
  ;({ CompanyProvider } = await server.ssrLoadModule('/src/context/CompanyContext.jsx'))
  ;({ CartProvider, useCart } = await server.ssrLoadModule('/src/context/CartContext.jsx'))
  ;({ FavoritesProvider } = await server.ssrLoadModule('/src/context/FavoritesContext.jsx'))
})
after(async () => { await server?.close() })
const render = (Page, props = {}, route = '/') => renderToString(h(MemoryRouter, { initialEntries: [route] }, h(UserProvider, null, h(CompanyProvider, null, h(CartProvider, null, h(FavoritesProvider, null,
  route.startsWith('/demo/empresa') ? h(Routes, null, h(Route, { path: '/demo/empresa/:aba?', element: h(Page, props) })) : h(Page, props)))))))

test('árvore real do aplicativo abre antes de login e carregamento da loja', () => {
  function Summary() { const cart = useCart(); return h('p', null, cart.quantidadeTotal + ' produtos; entrega ' + (cart.taxaEntrega ?? 'a confirmar')) }
  assert.match(render(Summary), /0 produtos; entrega a confirmar/)
})
test('cadastro sem confirmação nunca renderiza uma tela protegida, mesmo marcado como admin', async () => {
  const { AccessGate } = await server.ssrLoadModule('/src/components/ProtectedRoute.jsx')
  const guarded = props => renderToString(h(MemoryRouter, null, h(AccessGate, props, h('p', null, 'DADOS PRIVADOS'))))
  for (const usuario of [null, { uid:'ana' }, { uid:'ana', emailVerificado:false }, { uid:'ana',admin:true,emailVerificado:false }]) {
    assert.doesNotMatch(guarded({ usuario }), /DADOS PRIVADOS/)
    assert.ok(['/login','/verificar-email'].includes(accountDestination(usuario)))
  }
  assert.match(guarded({ usuario:{ uid:'ana',emailVerificado:true } }), /DADOS PRIVADOS/)
  assert.match(guarded({ usuario:{ uid:'ana',emailVerificado:false },allowUnverified:true }), /DADOS PRIVADOS/)
  assert.equal(accountDestination({ uid:'ana',emailVerificado:true,admin:false }), '/perfil')
  assert.equal(accountDestination({ uid:'ana',emailVerificado:true,admin:false,nome:'Ana',telefone:'41999999999',cep:'83415235',cidade:'Colombo',uf:'PR',endereco:'Rua A',numero:'10',bairro:'Centro',privacyPolicyVersion:'2026-09-15',termsVersion:'2026-09-09' }), '/pizzas')
})
test('início, login, cadastro e recuperação mostram conteúdo sem serviços externos', async () => {
  for (const [name, expected] of [['Home', 'Entrar e pedir'], ['Login', 'Continuar com Google'], ['LoginTelefone', 'Receba um código por SMS'], ['Cadastro', 'Continuar'], ['RecuperarSenha', 'e-mail']]) {
    const { default: Page } = await server.ssrLoadModule('/src/pages/' + name + '.jsx')
    assert.match(render(Page), new RegExp(expected))
  }
})
test('confirmação exige OTP de seis números e permite reenvio', async () => {
  const { default: Page } = await server.ssrLoadModule('/src/pages/VerificarEmail.jsx')
  const html = render(Page)
  assert.match(html, /Código de verificação/)
  assert.match(html, /one-time-code/)
  assert.ok(html.includes('pattern="[0-9]{6}"'))
  assert.match(html, /Confirmar código/)
  assert.match(html, /Enviar código de confirmação/)
})
test('pesquisa independente renderiza filtros e navegação sem chamar serviços externos', async () => {
  const { default: Page } = await server.ssrLoadModule('/src/pages/Pesquisar.jsx')
  const html = render(Page, {}, '/pesquisar')
  for (const label of ['Pesquisar', 'Tudo', 'Pratos', 'Bebidas', 'Sobremesas', 'Digite pelo menos 2 caracteres']) {
    assert.ok(html.includes(label), label)
  }
})

test('navegação inferior prioriza pesquisa e carrinho, sem aba separada de pedidos', async () => {
  const { default: BottomNav } = await server.ssrLoadModule('/src/components/BottomNav.jsx')
  const html = render(BottomNav)
  for (const label of ['Pratos', 'Pesquisar', 'Carrinho', 'Perfil']) assert.ok(html.includes(label), label)
  assert.doesNotMatch(html, />Pedidos</)
})

test('cadastro de empresa usa o fluxo multiempresa atual e valida o identificador', async () => {
  const { default: Page } = await server.ssrLoadModule('/src/pages/CompanyOnboarding.jsx')
  const html = render(Page, {}, '/empresa/nova')
  assert.match(html, /Solicitar cadastro empresarial/)
  assert.match(html, /id="company-cnpj"/)
  assert.match(html, /id="company-legal-name"/)
  assert.match(html, /id="company-trade-name"/)
  assert.match(html, /Enviar solicitação e documentos/)
  assert.match(html, /não comprova vínculo/)
})

test('cadastro de produtos oferece categorias padronizadas sem adicionais ou personalização', async () => {
  const { default: Manager } = await server.ssrLoadModule('/src/components/company/CompanyCatalogManager.jsx')
  const html = render(Manager, { companyId: 'loja-teste' })
  for (const category of ['Pratos', 'Bebidas', 'Sobremesas', 'Lanches', 'Outros']) {
    assert.ok(html.includes('>' + category + '</option>'), category)
  }
  const source = (await import('node:fs/promises')).readFile(new URL('../src/components/company/CompanyCatalogManager.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(await source, /form\.categoria === 'Pizzas'/)
  assert.doesNotMatch(await source, /Permitir tamanhos, bordas e adicionais de pizza/)
  assert.match(await source, /personalizavel: false/)
})

test('demonstrações são somente leitura e protegidas pela administração da plataforma', async () => {
  const app = await (await import('node:fs/promises')).readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const dashboard = await (await import('node:fs/promises')).readFile(new URL('../src/pages/CompanyDashboard.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /\/demo\/empresa/)
  assert.match(dashboard, /const demo = false/)
  assert.match(dashboard, /useCompanyData\(companyId\)/)
})

test('falha no banco mantém nomes e imagens do cardápio, mas bloqueia preços não confirmados', async () => {
  const { default: CatalogResults } = await server.ssrLoadModule('/src/components/CatalogResults.jsx')
  const { produtos } = await server.ssrLoadModule('/src/data/produtos.js')
  const html = render(CatalogResults, { produtos, confirmed: false, loading: false, error: 'Não foi possível atualizar preços.', retry() {} })
  for (const produto of produtos) {
    assert.ok(html.includes(produto.nome))
    assert.ok(html.includes(produto.imagem))
  }
  assert.match(html, /Tentar atualizar/)
  assert.equal((html.match(/disabled="" class="add-button/g) || []).length, produtos.length)
  const online = render(CatalogResults, { produtos, confirmed: true, loading: false, error: '', retry() {} })
  assert.doesNotMatch(online, /disabled="" class="add-button/)
})


test('Piloto Parceiro explica a área antes de liberar o cadastro', async () => {
  const { default: PilotIntroModal } = await server.ssrLoadModule('/src/components/PilotIntroModal.jsx')
  const html = render(PilotIntroModal, { open: true, onClose() {}, onConfirm() {} })
  assert.match(html, /role="dialog"/)
  assert.match(html, /Quer fazer entregas pelo PratoPronto/)
  assert.match(html, /Envie a documentação/)
  assert.match(html, /Aguarde a análise/)
  assert.match(html, /Fechar apresentação do Piloto Parceiro/)
  assert.match(html, /Agora não/)
  assert.match(html, /Entendi, continuar cadastro/)
})

test('ID completo fica copiável sem virar campo editável e permissões de equipe limitam as opções', async () => {
  const { default: AccountIdentifier } = await server.ssrLoadModule('/src/components/AccountIdentifier.jsx')
  const { default: CompanyTeam } = await server.ssrLoadModule('/src/components/company/CompanyTeam.jsx')
  const id = '10000000-0000-4000-8000-000000000001'
  const html = render(AccountIdentifier, { accountId: id, hint: true })
  assert.match(html, new RegExp(id))
  assert.match(html, /Copiar ID/)
  assert.match(html, /role="status"/)
  assert.doesNotMatch(html, /<input/)
  const owner = render(CompanyTeam, { companyId: 'loja-a', actorRole: 'owner', actorId: id })
  assert.match(owner, /ID da conta ou e-mail/)
  assert.match(owner, /<option value="admin"/)
  const admin = render(CompanyTeam, { companyId: 'loja-a', actorRole: 'admin', actorId: id })
  assert.doesNotMatch(admin, /<option value="admin"/)
  assert.match(admin, /<option value="attendant"/)
  const customer = render(CompanyTeam, { companyId: 'loja-a', actorId: id })
  assert.doesNotMatch(customer, /Salvar acesso/)
})

test('perfil mostra atividade real e atalhos permitidos sem expor o formulário inteiro', async () => {
  const { default: ProfileOverview } = await server.ssrLoadModule('/src/components/ProfileOverview.jsx')
  const usuario = { uid: '10000000-0000-4000-8000-000000000001', nome: 'Ana Teste', email: 'ana@example.test', emailVerificado: true, cidade: 'Curitiba', uf: 'PR', endereco: 'Rua Privada' }
  const props = { usuario, stats: { orders: 12, delivered: 9, reviews: 3, loading: false }, onEdit() {} }
  const customer = render(ProfileOverview, props)
  assert.match(customer, /<dd>12<\/dd>/)
  assert.match(customer, /<dd>9<\/dd>/)
  assert.match(customer, /<dd>3<\/dd>/)
  assert.match(customer, /Conta verificada/)
  assert.match(customer, /Editar perfil/)
  assert.match(customer, /href="\/privacidade"/)
  assert.match(customer, /href="\/acompanhamento"/)
  assert.match(customer, /Copiar ID/)
  assert.doesNotMatch(customer, /ana@example.test|Rua Privada|<input|Seguidores|Administrar empresas|Área da empresa/)
  const staff = render(ProfileOverview, { ...props, staffCompanies: [{ role: 'kitchen' }] })
  assert.match(staff, /href="\/empresa\/pedidos"/)
  assert.doesNotMatch(staff, /href="\/plataforma\/empresas"/)
  const draftPilot = render(ProfileOverview, { ...props, pilotProfile: { id: 'pilot', approval_status: 'draft' } })
  assert.match(draftPilot, /Se torne um piloto das entregas/)
  assert.doesNotMatch(draftPilot, /href="\/piloto"/)
  const admin = render(ProfileOverview, { ...props, platformAdmin: true, pilotProfile: { id: 'pilot', approval_status: 'approved' } })
  assert.match(admin, /href="\/plataforma\/empresas"/)
  assert.match(admin, /href="\/piloto"/)
})

test('falha nos contadores mantém edição e não apresenta zeros inventados', async () => {
  const { default: ProfileOverview } = await server.ssrLoadModule('/src/components/ProfileOverview.jsx')
  const props = { usuario: { uid: 'ana', nome: 'Ana' }, incomplete: true, onEdit() {} }
  const failure = render(ProfileOverview, { ...props, stats: { loading: false, error: true } })
  assert.equal((failure.match(/<dd>—<\/dd>/g) || []).length, 3)
  assert.match(failure, /Tentar novamente/)
  assert.match(failure, /Completar perfil/)
  assert.doesNotMatch(failure, /<dd>0<\/dd>/)
  const empty = render(ProfileOverview, { ...props, stats: { loading: false, orders: 0, delivered: 0, reviews: 0 } })
  assert.equal((empty.match(/<dd>0<\/dd>/g) || []).length, 3)
})

test('consulta do perfil conta somente registros próprios e propaga falhas do banco', async () => {
  const { getProfileStats } = await server.ssrLoadModule('/src/services/storage.js')
  const requests = []
  let deny = false
  const client = createClient('https://fixture.supabase.co', 'sb_publishable_fixture', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, options) => {
      const url = new URL(String(input))
      requests.push({ url, options })
      if (deny) return new Response(null, { status: 403 })
      const count = url.pathname.endsWith('reviews') ? 2 : url.searchParams.has('status') ? 5 : 7
      return new Response(null, { status: 200, headers: { 'content-range': '*/' + count } })
    } },
  })
  assert.deepEqual(await getProfileStats('account-a', client), { orders: 7, delivered: 5, reviews: 2 })
  assert.equal(requests.length, 3)
  for (const { url, options } of requests) {
    assert.equal(options.method, 'HEAD')
    assert.equal(url.searchParams.get('user_id'), 'eq.account-a')
    assert.equal(url.searchParams.get('select'), 'id')
  }
  assert.equal(requests.filter(({ url }) => url.searchParams.get('status') === 'eq.entregue').length, 1)
  deny = true
  await assert.rejects(getProfileStats('account-a', client))
  await assert.rejects(getProfileStats('', client))
})

test('Home mantém mensagem estável e favoritos têm controle acessível e estado vazio', async () => {
  const { default: Home } = await server.ssrLoadModule('/src/pages/Home.jsx')
  const { default: ProductCard } = await server.ssrLoadModule('/src/components/ProductCard.jsx')
  const { default: FavoritesPage } = await server.ssrLoadModule('/src/pages/Favoritos.jsx')
  const home = render(Home)
  assert.match(home, /Pratos, bebidas e sobremesas em um só lugar/)
  assert.match(home, /Seu próximo pedido começa aqui/)
  const product = render(ProductCard, { produto: {
    id: 'prato-teste', companyId: 'loja-teste', nome: 'Prato teste',
    descricao: 'Descrição', imagem: '/icons/app-icon.svg', preco: 29.9,
  } })
  assert.match(product, /Adicionar Prato teste aos favoritos/)
  assert.match(product, /aria-pressed="false"/)
  const favorites = render(FavoritesPage, {}, '/favoritos')
  assert.match(favorites, /Você ainda não tem favoritos/)
  assert.match(favorites, /Explorar produtos/)
})
