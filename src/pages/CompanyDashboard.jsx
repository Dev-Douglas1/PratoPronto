import Promotions from '../components/company/Promotions.jsx'
import StoreSettings from '../components/company/StoreSettings.jsx'
import { callServer } from '../services/server.js'
import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'
import useCompanyData from '../hooks/useCompanyData.js'
import { produtos } from '../data/produtos.js'
import { NEXT_ACTION, NEXT_STATUS, normalizeOrderStatus, orderStatusLabel, ORDER_STATUS_OPTIONS } from '../config/orderStatus.js'
import { amountToCollect, filterOrders, paymentLabel, paymentStatusLabel, timestampMillis } from '../utils/pedido.js'
import { formatarMoeda as money } from '../utils/moeda.js'
import { subscribeOrderEvents } from '../services/company.js'
import { traduzirErroFirebase } from '../utils/firebaseError.js'
import { companyTabState } from '../utils/dataAccess.js'
import Icon from '../components/company/Icon.jsx'
import Modal from '../components/company/Modal.jsx'
import PrintTicket from '../components/company/PrintTicket.jsx'
import CompanyTeam from '../components/company/CompanyTeam.jsx'
import CompanyCatalogManager from '../components/company/CompanyCatalogManager.jsx'
import PilotAssignment from '../components/company/PilotAssignment.jsx'
import { DEFAULT_COMPANY_ID, roleLabel } from '../config/marketplace.js'
import { migrateDefaultCompany } from '../services/marketplace.js'
import '../company.css'
import InstallApp from '../components/InstallApp.jsx'

const tabs = [
  ['pedidos', 'Pedidos', 'orders'], ['entregas', 'Entregas', 'delivery'], ['concluidos', 'Concluídos', 'check'],
  ['promocoes', 'Ofertas', 'tag'], ['avaliacoes', 'Avaliações', 'star'], ['cardapio', 'Cardápio', 'menu'], ['equipe', 'Equipe', 'orders'], ['atendimento', 'Atendimento', 'chat'], ['configuracoes', 'Configurações', 'menu'],
]
const mobileTabs = ['pedidos', 'entregas', 'promocoes', 'cardapio']
const headings = { promocoes: ['Descontos e campanhas do restaurante', 'Ofertas e promoções'], configuracoes: ['Horários, entrega e pagamentos', 'Configurações da empresa'], pedidos: ['Acompanhe e atualize cada etapa', 'Pedidos em processo'], entregas: ['Organize a saída dos pedidos', 'Central de entregas'], concluidos: ['Histórico do restaurante', 'Pedidos concluídos'], avaliacoes: ['Opinião dos seus clientes', 'Avaliações dos clientes'], cardapio: ['Preços e itens disponíveis', 'Produtos e disponibilidade'], equipe: ['Acessos, funções e pilotos', 'Equipe da empresa'], atendimento: ['Cancelamentos e reembolsos', 'Central de atendimento'] }
const hour = value => new Date(timestampMillis(value)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const date = value => new Date(timestampMillis(value)).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
function Status({ value }) { return <span className={'company-status status-' + normalizeOrderStatus(value)}><i />{orderStatusLabel(value)}</span> }
function Empty({ text, filtered = false, onClear }) { return <div className="company-empty"><Icon name={filtered ? 'search' : 'orders'} size={28} /><h3>{filtered ? 'Nenhum resultado' : 'Nada nesta lista ainda'}</h3><p>{text}</p>{filtered && <button className="company-button secondary" type="button" onClick={onClear}>Limpar filtros</button>}</div> }

function OrderDetails({ order, demo, data, companyId, canPrint, canAdvance, canAssignPilot, onClose, onPrint, onAdvance, onAssigned, busy }) {
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (demo) return
    return subscribeOrderEvents(order.id, setEvents, err => setError(traduzirErroFirebase(err)))
  }, [order.id, demo])
  const history = demo ? data.events[order.id] || [] : events
  const address = [order.entrega.endereco + ', ' + order.entrega.numero, order.entrega.bairro, order.entrega.cidade, order.entrega.uf, order.entrega.cep, order.entrega.complemento].filter(Boolean).join(' · ')
  async function copyAddress() {
    try { await navigator.clipboard.writeText(address); setCopied(true) }
    catch { setError('Não foi possível copiar. Selecione o endereço acima e use Copiar.') }
  }
  const status = normalizeOrderStatus(order.status)
  return <Modal title={'Pedido #' + order.id.slice(-8)} onClose={onClose}>
    <div className="detail-intro"><Status value={status} /><span>{date(order.createdAt)} às {hour(order.createdAt)}</span></div>
    <section className="detail-section"><h3>Cliente e entrega</h3><strong>{order.cliente.nome}</strong><p className="selectable">{address}</p><div className="inline-actions"><button className="company-button subtle" onClick={copyAddress}>{copied ? 'Endereço copiado' : 'Copiar endereço'}</button>{order.cliente.telefone && <a className="company-button subtle" href={'tel:' + order.cliente.telefone.replace(/[^+0-9]/g, '')}>Ligar para cliente</a>}</div></section>
    {!demo && canAssignPilot && !['entregue','cancelado'].includes(status) && <PilotAssignment companyId={companyId} order={order} disabled={busy} onAssigned={onAssigned} />}
    <section className="detail-section">{order.observacao && <p><b>Observação:</b> {order.observacao}</p>}<h3>O que vai no pedido</h3>{order.itens.map((item, i) => <div className="detail-item" key={item.id + i}><div><strong>{item.quantidade} × {item.nome}</strong><small>{item.detalhes}</small></div><b>{money(item.precoUnitario * item.quantidade)}</b></div>)}</section>
    <section className="detail-section"><div className="detail-item"><span>Entrega</span><b>{money(order.taxaEntrega)}</b></div><div className="detail-item detail-total"><strong>Total</strong><b>{money(order.total)}</b></div><div className="payment-callout"><strong>{paymentLabel(order.pagamento)}</strong><p>{paymentStatusLabel(order.pagamento)}{amountToCollect(order) > 0 ? ' · ' + money(amountToCollect(order)) : ''}</p>{order.pagamento.ambiente !== 'producao' && <small>Ambiente de teste. Nenhum valor real movimentado.</small>}</div></section>
    <section className="detail-section"><h3>Histórico de etapas</h3><ol className="event-list"><li><span>Pedido criado</span><time>{hour(order.createdAt)}</time></li>{history.map(event => <li key={event.id}><span>{orderStatusLabel(event.status)}<small>Alterado pela empresa</small></span><time>{hour(event.at)}</time></li>)}</ol>{!history.length && <p className="muted">As próximas mudanças aparecerão aqui.</p>}</section>
    {error && <p className="company-alert" role="alert">{error}</p>}
    {canPrint && <div className="inline-actions"><button className="company-button secondary" onClick={() => onPrint(order.id, 'cozinha')}><Icon name="print" />Cozinha</button><button className="company-button secondary" onClick={() => onPrint(order.id, 'entrega')}><Icon name="print" />Entrega</button></div>}
    {canAdvance && NEXT_STATUS[status] && !(order.deliveryVerificationRequired && ['pronto','saiu_entrega'].includes(status)) && <button className="company-button primary wide" disabled={busy} onClick={() => onAdvance(order)}>{NEXT_ACTION[status]}<Icon name="arrow" /></button>}
    {status === 'pronto' && order.deliveryVerificationRequired && <p className="company-notice">{order.assignedCourier ? 'Piloto atribuído. Ele deve iniciar a entrega na área Piloto Parceiro.' : 'Atribua um Piloto Parceiro para liberar a saída do pedido.'}</p>}
    {status === 'saiu_entrega' && order.deliveryVerificationRequired && <p className="company-notice">Aguardando o Piloto Parceiro confirmar a senha de entrega informada pelo cliente.</p>}
  </Modal>
}
function AnswerForm({ label, initial = '', onSave, disabled, button = 'Enviar resposta' }) {
  const [text, setText] = useState(initial)
  return <form className="answer-form" onSubmit={event => { event.preventDefault(); onSave(text) }}>
    <label>{label}<textarea required minLength={3} maxLength={1000} value={text} onChange={event => setText(event.target.value)} placeholder="Escreva uma resposta atenciosa..." /></label>
    <button className="company-button secondary" disabled={disabled} type="submit">{button}</button>
  </form>
}
function ProductEditor({ product, setting, onSave, busy }) {
  const current = setting?.preco ?? product.preco
  const [price, setPrice] = useState(current.toFixed(2))
  const available = setting?.disponivel !== false
  useEffect(() => setPrice(current.toFixed(2)), [current])
  return <article className="company-product">
    <img src={product.imagem} alt={product.nome} loading="lazy" width="100" height="100" />
    <div className="company-product-info"><h3>{product.nome}</h3><p>{product.descricao}</p><button className={'availability-toggle ' + (available ? 'is-on' : '')} type="button" role="switch" aria-checked={available} aria-label={'Disponibilidade de ' + product.nome} disabled={busy} onClick={() => onSave(product.id, { preco: current, disponivel: !available })}><i />{available ? 'Disponível' : 'Pausado'}</button></div>
    <form onSubmit={event => { event.preventDefault(); onSave(product.id, { preco: Number(price), disponivel: available }) }}><label>Preço base (R$)<input type="number" step="0.01" min={product.personalizavel ? '12.01' : '0.01'} max="2000" required value={price} onChange={event => setPrice(event.target.value)} /></label><button className="company-button subtle" type="submit" disabled={busy || Number(price) === current}>Salvar preço</button></form>
  </article>
}

export default function CompanyDashboard({ demo = false }) {
  const { aba = 'pedidos' } = useParams()
  const navigate = useNavigate()
  const { usuario, sair, conferirVerificacaoEmail } = useUser()
  const { staffCompanies, activeCompanyId, activeCompany, selectCompany, refresh: refreshCompanies } = useCompany()
  const companyId = demo ? DEFAULT_COMPANY_ID : activeCompanyId
  const permissions = demo ? ['company:manage','team:manage','catalog:manage','orders:read','orders:advance','orders:print','reviews:reply','refunds:manage','pilots:assign'] : (activeCompany?.permissions || [])
  const can = permission => demo || permissions.includes(permission)
  const visibleTabs = tabs.filter(([id]) => {
    if (['pedidos','entregas','concluidos'].includes(id)) return can('orders:read')
    if (['promocoes','cardapio'].includes(id)) return can('catalog:manage')
    if (id === 'avaliacoes') return can('reviews:reply')
    if (id === 'equipe') return can('team:manage')
    if (id === 'atendimento') return can('refunds:manage')
    if (id === 'configuracoes') return can('company:manage')
    return true
  })
  const data = useCompanyData(demo, companyId)
  const tabState = companyTabState(data.sources, aba)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('todos')
  const [selected, setSelected] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [ticket, setTicket] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [received, setReceived] = useState(false)
  const [response, setResponse] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [online, setOnline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine !== false)
  const [now, setNow] = useState(Date.now())
  const base = demo ? '/demo/empresa' : '/empresa'
  useEffect(() => { setSearch(''); setStatus('todos'); setSelected(null); setMenuOpen(false) }, [aba, companyId])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { clearInterval(timer); window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => { if (!notice || notice.error) return; const id = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(id) }, [notice])
  const currentOrders = useMemo(() => filterOrders(data.orders, aba, search, status), [data.orders, aba, search, status])
  const pending = data.orders.filter(o => normalizeOrderStatus(o.status) === 'confirmado').length
  const preparing = data.orders.filter(o => normalizeOrderStatus(o.status) === 'preparando').length
  const deliveries = data.orders.filter(o => ['pronto', 'saiu_entrega'].includes(normalizeOrderStatus(o.status))).length
  const support = data.refunds.filter(r => r.status === 'pendente').length
  const rating = data.reviews.length ? (data.reviews.reduce((sum, r) => sum + r.notaComida, 0) / data.reviews.length).toFixed(1).replace('.', ',') : '—'
  const selectedOrder = data.orders.find(order => order.id === selected)
  const printOrder = data.orders.find(order => order.id === ticket?.id)
  const fresh = key => demo || (!data.sources[key].loading && !data.sources[key].error && !data.sources[key].fromCache)
  const badge = { pedidos: fresh('orders') ? pending + preparing : 0, entregas: fresh('orders') ? deliveries : 0, atendimento: fresh('refunds') ? support : 0 }
  const blocked = busy || (!demo && (!online || tabState.loading || Boolean(tabState.error) || tabState.fromCache))
  const connectionLabel = demo ? 'Demonstração' : !online ? 'Sem conexão' : data.error ? 'Atualização incompleta' : data.loading ? 'Carregando dados' : data.fromCache ? 'Dados locais' : 'Dados sincronizados'
  const count = (value, key = 'orders') => !fresh(key) ? '—' : String(value).padStart(2, '0')
  async function refreshSession() {
    if (busy) return
    setBusy(true)
    try { await conferirVerificacaoEmail(); data.retry(); setNotice(null) }
    catch { setNotice({ error: true, text: 'Não foi possível renovar o acesso. Saia da conta e entre novamente.' }) }
    finally { setBusy(false) }
  }
  async function act(action, success) {
    if (busy) return
    if (!demo && (!online || tabState.loading || tabState.fromCache || tabState.error)) { setNotice({ error: true, text: 'Aguarde a conexão com o restaurante antes de salvar alterações.' }); return false }
    setBusy(true); setNotice(null)
    try { await action(); setNotice({ text: success }); return true }
    catch (error) { setNotice({ error: true, text: error.code ? traduzirErroFirebase(error) : error.message || 'Não foi possível salvar. Tente novamente.' }); return false }
    finally { setBusy(false) }
  }
  function advance(order) {
    const next = NEXT_STATUS[normalizeOrderStatus(order.status)]
    if (next === 'entregue' && order.deliveryVerificationRequired) {
      setNotice({ error: true, text: 'A entrega deste pedido deve ser concluída pelo Piloto Parceiro usando a senha do cliente.' })
      return
    }
    if (next === 'entregue') { setReceived(false); setConfirm({ type: 'delivery', id: order.id }); return }
    act(() => data.advance(order.id, next), 'Pedido atualizado. A próxima etapa já está disponível.')
  }
  async function confirmAction() {
    const ok = await act(() => confirm.type === 'delivery' ? data.advance(confirm.id, 'entregue', received) : data.decide(confirm.id, confirm.approve, response), confirm.type === 'delivery' ? 'Entrega concluída. O cliente já pode avaliar.' : 'Solicitação respondida.')
    if (ok) setConfirm(null)
  }
  async function migrateLegacyCompany() {
    if (busy) return
    setBusy(true); setNotice(null)
    try {
      const result = await migrateDefaultCompany()
      await refreshCompanies()
      data.retry()
      setNotice({ text: `Migração concluída. ${result.changed || 0} registros antigos foram vinculados ao PratoPronto.` })
    } catch (error) {
      setNotice({ error: true, text: error.message || 'Não foi possível migrar os dados antigos.' })
    } finally { setBusy(false) }
  }
  function print(id, kind) { setTicket({ id, kind }); setSelected(null) }
  if (!headings[aba] || !visibleTabs.some(([id]) => id === aba)) return <Navigate to={base + '/' + (visibleTabs[0]?.[0] || 'pedidos')} replace />
  return <div className="company-app">
    <aside className="company-sidebar">
      <Link className="company-brand" to={base + '/pedidos'}><img src="/icons/app-icon.svg" alt="" width="42" height="42" /><span>Prato<span>Pronto</span><small>ÁREA DA EMPRESA</small></span></Link>
      <div className="workspace-label">{demo ? 'RESTAURANTE DE TESTE' : 'EMPRESA ATIVA'} <span>2.0</span></div>
      {!demo && <label className="company-selector">Empresa<select value={companyId} onChange={event => selectCompany(event.target.value)}>{staffCompanies.map(company => <option key={company.companyId} value={company.companyId}>{company.name}</option>)}</select><small>{roleLabel(activeCompany?.role)}</small></label>}
      <nav className="company-nav" aria-label="Área da empresa">{visibleTabs.map(([id, label, icon]) => <NavLink key={id} className={({ isActive }) => [isActive ? 'active' : '', mobileTabs.includes(id) ? '' : 'nav-secondary'].filter(Boolean).join(' ')} to={base + '/' + id}><Icon name={icon} /><span>{id === 'atendimento' ? <><span className="desktop-label">Atendimento</span><span className="mobile-label">Suporte</span></> : label}</span>{badge[id] > 0 && <b>{badge[id] > 99 ? '99+' : badge[id]}</b>}</NavLink>)}<button className={'company-more ' + (!mobileTabs.includes(aba) ? 'active' : '')} type="button" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Icon name="more" /><span>Mais</span></button></nav>
      <div className="sidebar-bottom"><div className="company-account"><span>{demo ? 'PP' : (activeCompany?.name || usuario?.nome || 'PP').slice(0, 2).toUpperCase()}</span><div><strong>{demo ? 'Restaurante de teste' : activeCompany?.name || usuario?.nome || 'Minha empresa'}</strong><small>{demo ? 'Dados fictícios' : roleLabel(activeCompany?.role)}</small></div></div><button onClick={() => demo ? navigate('/login') : sair().then(() => navigate('/login')).catch(() => setNotice({ error: true, text: 'Não foi possível sair. Tente novamente.' }))} className="sidebar-exit"><Icon name="exit" />{demo ? 'Entrar na minha conta' : 'Sair da conta'}</button></div>
    </aside>
    <div className="company-main">
      <header className="company-topbar"><Link className="company-store-link" to={demo ? '/' : companyId === DEFAULT_COMPANY_ID ? '/pizzas' : '/loja/' + companyId}>Ver loja <span aria-hidden="true">↗</span></Link><span className={'connection ' + (!demo && (!online || data.error || data.fromCache) ? 'is-offline' : '')} role="status"><i />{connectionLabel}</span></header>
      {demo && <div className="company-demo-banner"><span><b>Você está em uma demonstração.</b> Pedidos e clientes fictícios. Nenhuma cobrança é realizada.</span><button type="button" onClick={() => { data.reset(); setNotice({ text: 'Demonstração reiniciada.' }) }}>Reiniciar teste ↻</button></div>}
      {!demo && <div className="company-live-note">Confira o ambiente e os serviços em Configurações antes de receber pedidos reais.</div>}
      {!demo && activeCompany?.legacy && <div className="company-alert"><b>Migração multiempresa pendente.</b> Vincule os pedidos e avaliações antigos ao PratoPronto antes de cadastrar outras empresas. <button className="company-button secondary" type="button" disabled={busy} onClick={migrateLegacyCompany}>{busy ? 'Migrando…' : 'Migrar dados antigos'}</button></div>}
      {!online && !demo && <p className="company-alert" role="alert">Sem conexão. Os dados podem estar desatualizados. Reconecte para alterar pedidos.</p>}
      <main className="company-content">
        <div className="company-page-heading"><div><p>{headings[aba][0]}</p><h1>{headings[aba][1]}</h1></div>{demo && ['pedidos', 'entregas', 'concluidos'].includes(aba) ? <button className="company-button primary" type="button" onClick={() => { data.simulate(); navigate(base + '/pedidos'); setNotice({ text: 'Novo pedido fictício recebido.' }) }}>+ Simular novo pedido</button> : <span className="today-label">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>}</div>
        {['pedidos', 'entregas', 'concluidos'].includes(aba) && <section className="company-stats" aria-label="Resumo dos pedidos carregados"><div className="stat-highlight"><span>Novos pedidos<Icon name="orders" /></span><strong>{count(pending)}</strong><small>Aguardando aceite</small></div><div><span>Na cozinha<Icon name="clock" /></span><strong>{count(preparing)}</strong><small>Em preparo</small></div><div><span>Para entregar<Icon name="delivery" /></span><strong>{count(deliveries)}</strong><small>Prontos ou a caminho</small></div><div><span>Avaliações<Icon name="star" /></span><strong>{!fresh('reviews') ? '—' : rating}<em> / 5</em></strong><small>{count(data.reviews.length, 'reviews')} recebidas</small></div></section>}
        {notice && <div className={notice.error ? 'company-alert' : 'company-notice'} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}
        {tabState.error ? <div className="company-empty" role="alert"><h2>Não foi possível carregar esta área</h2><p>{tabState.error}</p><div className="inline-actions"><button className="company-button primary" type="button" onClick={refreshSession} disabled={busy}>{busy ? 'Atualizando…' : 'Atualizar acesso'}</button><Link className="company-button secondary" to={base + '/configuracoes'}>Abrir configurações</Link></div><details className="company-permission-help"><summary>Como conferir as permissões do Firebase</summary><p>No projeto <b>pratopronto-d861d</b>, publique a versão atual de <code>firestore.rules</code> em Firestore Database → Regras. Confirme que sua conta tem e-mail verificado e que o documento <code>admins/UID_DA_CONTA</code> possui <code>role: restaurant_admin</code>.</p><p>Estas consultas ainda usam o Firebase. Alterar as tabelas do Supabase não libera este painel.</p></details></div> : tabState.loading ? <div className="company-empty" role="status">Carregando esta área…</div> : <>
          {aba === 'promocoes' && (companyId === DEFAULT_COMPANY_ID || demo ? <Promotions settings={data.settings} now={now} demo={demo} busy={blocked} feedback={notice?.error ? notice.text : ''} onSave={(id, offer) => act(() => data.promotion(id, offer), 'Promoção salva. A validade e o desconto serão aplicados no cardápio.')} /> : <div className="company-panel"><h2>Ofertas da empresa</h2><p>O cardápio multiempresa já aceita produtos próprios. A edição de promoções personalizadas será ligada a esses produtos em uma próxima etapa.</p></div>)}
          {aba === 'configuracoes' && <StoreSettings demo={demo} companyId={companyId} />}
          {aba === 'equipe' && !demo && <CompanyTeam companyId={companyId} />}
          {['pedidos', 'entregas', 'concluidos'].includes(aba) && <>
            <div className="company-toolbar"><label className="company-search"><Icon name="search" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar pedido, cliente ou bairro" aria-label="Buscar pedido, cliente ou bairro" /></label><select aria-label="Filtrar por etapa" value={status} onChange={event => setStatus(event.target.value)}><option value="todos">Todas as etapas</option>{ORDER_STATUS_OPTIONS.filter(s => aba === 'concluidos' ? ['entregue', 'cancelado'].includes(s.id) : aba === 'entregas' ? ['pronto', 'saiu_entrega'].includes(s.id) : ['aguardando_pagamento', 'confirmado', 'preparando', 'pronto'].includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select><span className="results-count">{currentOrders.length} pedidos</span></div>
            <section className="company-orders" aria-label="Lista de pedidos">{currentOrders.map(order => {
              const stage = normalizeOrderStatus(order.status)
              const minutes = Math.max(0, Math.floor((now - timestampMillis(order.createdAt)) / 60000))
              const late = minutes >= 30 && !['entregue', 'cancelado'].includes(stage)
              return <article className={'company-order order-' + stage} key={order.id}>
                <div className="order-card-heading"><b>#{order.id.slice(-8)}</b><span className={late ? 'order-age late' : 'order-age'}><Icon name="clock" size={14} />{['entregue', 'cancelado'].includes(stage) ? date(order.createdAt) : minutes + ' min'}</span></div>
                <h2>{order.cliente.nome}</h2><p className="order-neighborhood"><Icon name="pin" size={15} />{order.entrega.bairro}</p>
                <Status value={stage} />
                <div className="order-products">{order.itens.slice(0, 3).map((item, i) => <div key={item.id + i}><span>{item.quantidade}×</span><p>{item.nome}<small>{item.detalhes}</small></p></div>)}{order.itens.length > 3 && <small>+ {order.itens.length - 3} itens · ver detalhes</small>}</div>
                <div className="order-card-total"><span>{paymentLabel(order.pagamento)}<small>{paymentStatusLabel(order.pagamento)}</small></span><b>{money(order.total)}</b></div>
                {late && <p className="order-attention">Há mais de 30 min · confira o andamento</p>}
                <div className="order-card-actions"><button className="company-button subtle" onClick={() => setSelected(order.id)}>Ver detalhes</button>{can('orders:print') && <button className="icon-button" aria-label={'Imprimir comanda do pedido ' + order.id} onClick={() => print(order.id, aba === 'entregas' ? 'entrega' : 'cozinha')}><Icon name="print" /></button>}</div>
                {can('orders:advance') && NEXT_STATUS[stage] && !(order.deliveryVerificationRequired && ['pronto','saiu_entrega'].includes(stage)) && <button className={'company-button wide ' + (stage === 'confirmado' ? 'primary' : 'dark')} disabled={blocked} onClick={() => advance(order)}>{NEXT_ACTION[stage]}<Icon name="arrow" size={18} /></button>}
                {stage === 'pronto' && order.deliveryVerificationRequired && <p className="order-attention">{order.assignedCourier ? 'Piloto atribuído · aguardando início da rota.' : 'Atribua um Piloto Parceiro nos detalhes.'}</p>}
                {stage === 'saiu_entrega' && order.deliveryVerificationRequired && <p className="order-attention">Aguardando senha de entrega pelo Piloto Parceiro.</p>}
              </article>
            })}</section>
            {!currentOrders.length && <Empty filtered={Boolean(search || status !== 'todos')} onClear={() => { setSearch(''); setStatus('todos') }} text={search || status !== 'todos' ? 'Nenhum pedido corresponde aos filtros. Experimente outra busca.' : 'Os pedidos desta etapa aparecerão aqui.'} />}
          </>}
          {aba === 'avaliacoes' && <section className="company-reviews">{data.reviews.map(review => <article className="company-panel" key={review.id}><div className="review-header"><span className="review-avatar">{review.nome?.slice(0, 1)}</span><div><h2>{review.nome}</h2><small>Pedido #{review.orderId.slice(-8)} · {date(review.createdAt)}</small></div><span className="review-stars" aria-label={review.notaComida + ' de 5 estrelas'}>{'★'.repeat(review.notaComida)}<span>{'★'.repeat(5 - review.notaComida)}</span></span></div><p className="review-comment">{review.comentario || 'O cliente avaliou sem deixar um comentário.'}</p><p className="muted">Comida: {review.notaComida}/5 · Entrega: {review.notaEntrega}/5</p>{review.resposta && <blockquote className="review-reply"><b>Resposta da empresa</b><p>{review.resposta}</p></blockquote>}<AnswerForm label={review.resposta ? 'Atualizar resposta' : 'Responder ao cliente'} initial={review.resposta} disabled={blocked} onSave={text => act(() => data.reply(review.id, text), 'Resposta salva para o cliente.')} /></article>)}{!data.reviews.length && <Empty text="Depois da entrega, o cliente poderá avaliar a comida e o atendimento da entrega." />}</section>}
          {aba === 'cardapio' && (companyId === DEFAULT_COMPANY_ID || demo
            ? <><p className="section-explainer">Pause itens esgotados e atualize os preços. {demo ? 'Neste teste, as mudanças duram apenas enquanto esta página estiver aberta.' : 'O cardápio dos clientes recebe as atualizações automaticamente.'} Para pizzas, o preço base é o tamanho grande.</p><section className="company-catalog">{produtos.map(product => <ProductEditor key={product.id} product={product} setting={data.settings.find(s => s.id === product.id)} busy={blocked} onSave={(id, settings) => act(() => data.product(id, settings), 'Cardápio atualizado.')} />)}</section></>
            : <CompanyCatalogManager companyId={companyId} />)}
          {aba === 'atendimento' && <><p className="section-explainer">Analise cancelamentos e problemas na entrega. A decisão e sua resposta ficam disponíveis para o cliente. {demo ? 'Este ambiente simula os reembolsos.' : 'A aprovação solicita a devolução. O status só muda para reembolsado após a confirmação.'}</p><section className="company-reviews">{data.refunds.map(request => {
            const order = data.orders.find(item => item.id === request.orderId)
            return <article key={request.id} className="company-panel"><div className="support-heading"><span className={'company-status ' + (request.status === 'pendente' ? 'status-confirmado' : 'status-entregue')}>{request.status === 'pendente' ? 'Aguardando resposta' : request.status === 'recusado' ? 'Solicitação recusada' : request.status === 'aprovado_demo' ? 'Aprovado · teste' : request.status === 'cancelado_sem_cobranca' ? 'Cancelado sem cobrança' : paymentStatusLabel({ status: request.status })}</span><small>{date(request.createdAt)} · {hour(request.createdAt)}</small></div><h2>{order?.cliente.nome || 'Cliente'} <small>#{request.orderId.slice(-8)}</small></h2><p className="review-comment">{request.motivo}</p>{request.resposta && <blockquote className="review-reply"><b>Sua resposta</b><p>{request.resposta}</p></blockquote>}{order && <button className="company-button subtle" onClick={() => setSelected(order.id)}>Consultar pedido · {money(order.total)}</button>}{!demo && request.status === 'reembolso_manual_pendente' && <AnswerForm label="Referência do comprovante da devolução realizada" button="Registrar devolução realizada" disabled={blocked} onSave={proof => act(() => callServer('appConfirmManualRefund', { orderId: request.orderId, proof }), 'Devolução informada ao cliente.')} />}
              {request.status === 'pendente' && <div className="inline-actions"><button className="company-button primary" disabled={blocked} onClick={() => { setResponse(''); setConfirm({ type: 'refund', id: request.id, approve: true }) }}>Aprovar cancelamento</button><button className="company-button secondary" disabled={blocked} onClick={() => { setResponse(''); setConfirm({ type: 'refund', id: request.id, approve: false }) }}>Recusar e explicar</button></div>}</article>
          })}{!data.refunds.length && <Empty text="Nenhuma solicitação de atendimento recebida." />}</section></>}
        </>}
        <InstallApp />
        <footer className="company-footer"><span>PratoPronto <b>Empresa 2.0</b></span><span>{demo ? 'Dados fictícios · reiniciam ao recarregar' : 'Todos os pedidos ativos + histórico recente'}</span><Link to={demo ? '/login' : '/pizzas'}>{demo ? 'Acessar minha conta' : 'Abrir área do cliente'} ↗</Link></footer>
      </main>
    </div>
    {menuOpen && <Modal title="Mais opções" className="company-menu-dialog" onClose={() => setMenuOpen(false)}><nav className="company-more-links" aria-label="Outras áreas da empresa">{visibleTabs.filter(([id]) => !mobileTabs.includes(id)).map(([id, label, icon]) => <NavLink key={id} to={base + '/' + id} onClick={() => setMenuOpen(false)}><Icon name={icon} /><span>{label}</span><Icon name="arrow" size={18} /></NavLink>)}</nav></Modal>}
    {selectedOrder && !ticket && <OrderDetails order={selectedOrder} demo={demo} data={data} companyId={companyId} canPrint={can('orders:print')} canAdvance={can('orders:advance')} canAssignPilot={can('pilots:assign')} onClose={() => setSelected(null)} onPrint={print} onAdvance={advance} onAssigned={() => data.retry()} busy={blocked} />}
    {printOrder && <PrintTicket order={printOrder} kind={ticket.kind} companyName={demo ? 'Restaurante de teste' : activeCompany?.name || 'PratoPronto'} onClose={() => setTicket(null)} />}
    {confirm && <Modal title={confirm.type === 'delivery' ? 'Confirmar entrega' : confirm.approve ? 'Aprovar cancelamento' : 'Responder ao cliente'} onClose={() => { if (!busy) setConfirm(null) }}>
      {confirm.type === 'delivery' ? <><p>Confirme que o pedido chegou ao cliente. Depois disso, ele poderá enviar sua avaliação.</p>{amountToCollect(data.orders.find(order => order.id === confirm.id)) > 0 && <label className="company-checkbox"><input type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} />Confirmo o recebimento na maquininha de {money(amountToCollect(data.orders.find(order => order.id === confirm.id)))}{demo ? ' (simulação)' : ''}.</label>}</> : <><p>{confirm.approve ? (demo ? 'O pedido e o reembolso serão simulados nesta demonstração.' : 'O pedido será cancelado. Pagamentos online aprovados terão devolução solicitada ao Mercado Pago. Se foi pago na maquininha, faça a devolução e registre o comprovante. A confirmação pode levar tempo.') : 'Explique ao cliente por que a solicitação foi recusada.'}</p><label className="company-field">Resposta ao cliente<textarea maxLength={1000} minLength={3} required value={response} onChange={event => setResponse(event.target.value)} /></label></>}
      {notice?.error && <p className="company-alert" role="alert">{notice.text}</p>}
      <div className="inline-actions"><button className="company-button secondary" disabled={busy} onClick={() => setConfirm(null)}>Voltar</button><button className="company-button primary" disabled={blocked || (confirm.type === 'refund' && response.trim().length < 3) || (confirm.type === 'delivery' && amountToCollect(data.orders.find(order => order.id === confirm.id)) > 0 && !received)} onClick={confirmAction}>{busy ? 'Salvando…' : 'Confirmar'}</button></div>
    </Modal>}
  </div>
}
