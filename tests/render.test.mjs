import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { accountDestination } from '../src/utils/access.js'

let server, UserProvider, CompanyProvider, CartProvider, useCart
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
})
after(async () => { await server?.close() })
const render = (Page, props = {}, route = '/') => renderToString(h(MemoryRouter, { initialEntries: [route] }, h(UserProvider, null, h(CompanyProvider, null, h(CartProvider, null,
  route.startsWith('/demo/empresa') ? h(Routes, null, h(Route, { path: '/demo/empresa/:aba?', element: h(Page, props) })) : h(Page, props))))))

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
  for (const [name, expected] of [['Home', 'Entrar e pedir'], ['Login', 'Continuar com Google'], ['LoginTelefone', 'Receba um código por SMS'], ['Cadastro', 'Cadastrar'], ['RecuperarSenha', 'e-mail']]) {
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
test('painel de demonstração abre usando os mesmos providers do aplicativo', async () => {
  const { default: Page } = await server.ssrLoadModule('/src/pages/CompanyDashboard.jsx')
  assert.match(render(Page, { demo: true }, '/demo/empresa/pedidos'), /Pedidos em processo/)
})
test('todas as abas da empresa abrem e mantêm o acesso ao menu de celular', async () => {
  const { default: Page } = await server.ssrLoadModule('/src/pages/CompanyDashboard.jsx')
  for (const [route, title] of [['promocoes', 'Ofertas e promoções'], ['entregas', 'Central de entregas'], ['concluidos', 'Pedidos concluídos'], ['avaliacoes', 'Avaliações dos clientes'], ['cardapio', 'Produtos e disponibilidade'], ['atendimento', 'Central de atendimento'], ['configuracoes', 'Configurações da empresa']]) {
    const html = render(Page, { demo: true }, '/demo/empresa/' + route)
    assert.ok(html.includes(title), route + ' precisa renderizar o conteúdo')
    assert.match(html, /aria-haspopup="dialog"/)
  }
})

test('aba de ofertas apresenta criação, preço anterior e ações em uma superfície utilizável', async () => {
  const { default: Page } = await server.ssrLoadModule('/src/pages/CompanyDashboard.jsx')
  const html = render(Page, { demo:true }, '/demo/empresa/promocoes')
  for (const text of ['Criar promoção', 'Especial da casa', 'Editar oferta', 'Pausar', 'Agendadas', '<del>']) assert.ok(html.includes(text), text)
  assert.doesNotMatch(html, /Resumo dos pedidos carregados/)
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
