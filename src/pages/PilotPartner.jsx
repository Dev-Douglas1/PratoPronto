import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'
import {
  pilotConfirmDelivery, pilotStartDelivery, respondDeliveryOffer, savePilotProfile,
  subscribePilotOffers, subscribePilotOrders,
} from '../services/marketplace.js'
import { amountToCollect, paymentLabel, paymentStatusLabel, timestampMillis } from '../utils/pedido.js'
import { formatarMoeda as money } from '../utils/moeda.js'
import { normalizeOrderStatus, orderStatusLabel } from '../config/orderStatus.js'
import PrintTicket from '../components/company/PrintTicket.jsx'
import Icon from '../components/company/Icon.jsx'
import '../company.css'

const emptyPilot = { vehiclePlate: '', motorcycleType: '', vehicleColor: '', acceptingOffers: true }

export default function PilotPartner() {
  const { usuario, sair } = useUser()
  const { pilotProfile, refresh } = useCompany()
  const [profileForm, setProfileForm] = useState(emptyPilot)
  const [offers, setOffers] = useState([])
  const [orders, setOrders] = useState([])
  const [codes, setCodes] = useState({})
  const [received, setReceived] = useState({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const [ticket, setTicket] = useState(null)

  useEffect(() => {
    if (!pilotProfile) return
    setProfileForm({
      vehiclePlate: pilotProfile.vehicle_plate || '',
      motorcycleType: pilotProfile.motorcycle_type || '',
      vehicleColor: pilotProfile.vehicle_color || '',
      acceptingOffers: pilotProfile.accepting_offers !== false,
    })
  }, [pilotProfile])

  useEffect(() => {
    if (!usuario?.uid || !pilotProfile) { setOffers([]); setOrders([]); return }
    const stops = [
      subscribePilotOffers(usuario.uid, setOffers, err => setNotice({ error: true, text: err.message || 'Não foi possível carregar as ofertas.' })),
      subscribePilotOrders(usuario.uid, setOrders, err => setNotice({ error: true, text: err.message || 'Não foi possível carregar suas entregas.' })),
    ]
    return () => stops.forEach(stop => stop())
  }, [usuario?.uid, pilotProfile?.profile_id])

  const pendingOffers = useMemo(
    () => offers.filter(offer => offer.status === 'pending' && offer.order && !['entregue','cancelado'].includes(normalizeOrderStatus(offer.order.status))),
    [offers],
  )
  const activeOrders = useMemo(
    () => orders.filter(order => !['entregue','cancelado'].includes(normalizeOrderStatus(order.status))),
    [orders],
  )
  const history = useMemo(
    () => orders.filter(order => ['entregue','cancelado'].includes(normalizeOrderStatus(order.status))).slice(0, 20),
    [orders],
  )

  async function saveProfileForm(event) {
    event.preventDefault()
    if (busy) return
    setBusy('profile'); setNotice(null)
    try {
      await savePilotProfile(profileForm)
      await refresh()
      setNotice({ text: 'Cadastro de Piloto Parceiro atualizado.' })
    } catch (err) { setNotice({ error: true, text: err.message || 'Não foi possível salvar o perfil de piloto.' }) }
    finally { setBusy('') }
  }

  async function answerOffer(offer, accept) {
    if (busy) return
    setBusy(offer.id); setNotice(null)
    try {
      await respondDeliveryOffer(offer.id, accept)
      setNotice({ text: accept ? 'Entrega aceita. O pedido aparecerá nas suas entregas ativas.' : 'Oferta recusada.' })
    } catch (err) { setNotice({ error: true, text: err.message || 'Não foi possível responder à oferta.' }) }
    finally { setBusy('') }
  }

  async function action(order, fn, success) {
    if (busy) return
    setBusy(order.id); setNotice(null)
    try { await fn(); setNotice({ text: success }) }
    catch (err) { setNotice({ error: true, text: err.message || 'Não foi possível atualizar a entrega.' }) }
    finally { setBusy('') }
  }

  async function confirm(order) {
    const code = String(codes[order.id] || '').trim()
    if (!/^\d{4}$/.test(code)) {
      setNotice({ error: true, text: 'Digite a senha de entrega de 4 números informada pelo cliente.' })
      return
    }
    await action(order, () => pilotConfirmDelivery(order.id, code, received[order.id] === true), 'Entrega confirmada. O cliente já pode avaliar o pedido.')
    setCodes(current => ({ ...current, [order.id]: '' }))
  }

  return <div className="company-app pilot-app">
    <aside className="company-sidebar">
      <Link className="company-brand" to="/piloto"><img src="/icons/app-icon.svg" alt="" width="42" height="42" /><span>Prato<span>Pronto</span><small>PILOTO PARCEIRO</small></span></Link>
      <div className="workspace-label">ENTREGAS <span>PARCEIRAS</span></div>
      <div className="company-selector">
        <b>Perfil ativo</b>
        <small>Você pode receber ofertas de várias empresas.</small>
      </div>
      <div className="sidebar-bottom">
        <div className="company-account"><span>{usuario?.nome?.slice(0, 2).toUpperCase() || 'PP'}</span><div><strong>{usuario?.nome || 'Piloto Parceiro'}</strong><small>{pilotProfile?.vehicle_type || 'Conta PratoPronto'}</small></div></div>
        <button onClick={() => sair()} className="sidebar-exit"><Icon name="exit" />Sair da conta</button>
      </div>
    </aside>

    <div className="company-main">
      <header className="company-topbar"><Link className="company-store-link" to="/">Área do cliente ↗</Link><span className="connection"><i />Supabase conectado</span></header>
      <main className="company-content">
        <div className="company-page-heading"><div><p>Entregas oferecidas por empresas do PratoPronto</p><h1>Piloto Parceiro</h1></div>{pilotProfile && <span className="today-label">{activeOrders.length} entregas ativas</span>}</div>
        <div className="company-live-note">Nunca peça a senha antes de estar com o pedido no endereço. O cliente informa os 4 números somente no momento da entrega.</div>
        {notice && <div className={notice.error ? 'company-alert' : 'company-notice'} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}

        <section className="company-panel">
          <h2>Meu cadastro de piloto</h2>
          <p>Nome, telefone e cidade continuam vindo do seu perfil PratoPronto. Aqui você pode atualizar os dados da sua moto e sua disponibilidade.</p>
          <div className="settings-grid">
            <div><small>Nome</small><strong>{usuario?.nome || '—'}</strong></div>
            <div><small>Telefone</small><strong>{usuario?.telefone || '—'}</strong></div>
            <div><small>Cidade</small><strong>{usuario?.cidade || '—'}</strong></div>
          </div>
          <form className="settings-form" onSubmit={saveProfileForm}>
            <div className="settings-grid">
              <label>Placa da moto<input required maxLength="7" autoCapitalize="characters" value={profileForm.vehiclePlate} onChange={event => setProfileForm(value => ({ ...value, vehiclePlate: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) }))} /></label>
              <label>Tipo ou modelo da moto<input required minLength="2" maxLength="60" value={profileForm.motorcycleType} onChange={event => setProfileForm(value => ({ ...value, motorcycleType: event.target.value }))} /></label>
              <label>Cor da moto<input required minLength="2" maxLength="40" value={profileForm.vehicleColor} onChange={event => setProfileForm(value => ({ ...value, vehicleColor: event.target.value }))} /></label>
            </div>
            <label className="company-checkbox"><input type="checkbox" checked={profileForm.acceptingOffers} onChange={event => setProfileForm(value => ({ ...value, acceptingOffers: event.target.checked }))} />Aceitar novas ofertas de entrega</label>
            <button className="company-button primary" disabled={busy === 'profile'}>{busy === 'profile' ? 'Salvando…' : 'Atualizar cadastro'}</button>
          </form>
        </section>

        {pilotProfile && <>
          <div className="company-page-heading pilot-section-heading"><div><p>Você decide antes de ficar responsável pelo pedido</p><h2>Ofertas de entrega</h2></div><span className="today-label">{pendingOffers.length} pendentes</span></div>
          <section className="company-orders">
            {pendingOffers.map(offer => {
              const order = offer.order
              return <article className="company-order" key={offer.id}>
                <div className="order-card-heading"><b>#{order.id.slice(-8)}</b><span>{order.companyId || 'Empresa'}</span></div>
                <h2>{order.entrega?.bairro || 'Entrega'}</h2>
                <p className="order-neighborhood">{order.entrega?.cidade}/{order.entrega?.uf}</p>
                <div className="order-card-total"><span>Pedido</span><b>{money(order.total)}</b></div>
                {offer.message && <p className="company-notice">{offer.message}</p>}
                {offer.expires_at && <p className="muted">Oferta válida até {new Date(offer.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</p>}
                <div className="inline-actions">
                  <button className="company-button secondary" disabled={busy === offer.id} onClick={() => answerOffer(offer, false)}>Recusar</button>
                  <button className="company-button primary" disabled={busy === offer.id} onClick={() => answerOffer(offer, true)}>{busy === offer.id ? 'Respondendo…' : 'Aceitar entrega'}</button>
                </div>
              </article>
            })}
            {!pendingOffers.length && <div className="company-empty"><h3>Nenhuma oferta pendente</h3><p>Quando uma empresa enviar uma entrega para sua conta, ela aparecerá aqui para você aceitar ou recusar.</p></div>}
          </section>

          <div className="company-page-heading pilot-section-heading"><div><p>Pedidos que você já aceitou</p><h2>Minhas entregas</h2></div></div>
          <section className="company-orders">
            {activeOrders.map(order => {
              const status = normalizeOrderStatus(order.status)
              const collect = amountToCollect(order)
              return <article className={'company-order order-' + status} key={order.id}>
                <div className="order-card-heading"><b>#{order.id.slice(-8)}</b><span>{orderStatusLabel(status)}</span></div>
                <h2>{order.cliente?.nome || 'Cliente'}</h2>
                <p className="order-neighborhood">{order.entrega?.endereco}, {order.entrega?.numero}<br />{order.entrega?.bairro} · {order.entrega?.cidade}/{order.entrega?.uf}</p>
                <div className="order-products">{order.itens?.map((item, i) => <div key={item.id + i}><span>{item.quantidade}×</span><p>{item.nome}<small>{item.detalhes}</small></p></div>)}</div>
                <div className="order-card-total"><span>{paymentLabel(order.pagamento)}<small>{paymentStatusLabel(order.pagamento)}</small></span><b>{money(order.total)}</b></div>
                {collect > 0 && <p className="order-attention">Cobrar na entrega: {money(collect)} · levar maquininha</p>}
                <div className="order-card-actions">
                  <a className="company-button subtle" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([order.entrega?.endereco, order.entrega?.numero, order.entrega?.bairro, order.entrega?.cidade, order.entrega?.uf].filter(Boolean).join(', '))} target="_blank" rel="noreferrer">Abrir endereço</a>
                  <button className="icon-button" aria-label="Imprimir nota de entrega" onClick={() => setTicket(order)}><Icon name="print" /></button>
                </div>
                {status === 'pronto' && <button className="company-button primary wide" disabled={busy === order.id} onClick={() => action(order, () => pilotStartDelivery(order.id), 'Rota iniciada. O cliente já vê que o pedido saiu para entrega.')}>{busy === order.id ? 'Atualizando…' : 'Iniciar entrega'}</button>}
                {['confirmado','preparando'].includes(status) && <p className="company-notice">Entrega aceita. Aguarde a empresa deixar o pedido pronto.</p>}
                {status === 'saiu_entrega' && <div className="company-panel pilot-confirm">
                  <label>Senha de entrega<input inputMode="numeric" autoComplete="one-time-code" maxLength="4" pattern="[0-9]{4}" placeholder="0000" value={codes[order.id] || ''} onChange={event => setCodes(current => ({ ...current, [order.id]: event.target.value.replace(/\D/g, '').slice(0, 4) }))} /></label>
                  {collect > 0 && <label className="company-checkbox"><input type="checkbox" checked={received[order.id] === true} onChange={event => setReceived(current => ({ ...current, [order.id]: event.target.checked }))} />Confirmo que recebi {money(collect)} na entrega.</label>}
                  <button className="company-button primary wide" disabled={busy === order.id || String(codes[order.id] || '').length !== 4 || (collect > 0 && received[order.id] !== true)} onClick={() => confirm(order)}>{busy === order.id ? 'Confirmando…' : 'Confirmar entrega com senha'}</button>
                </div>}
              </article>
            })}
            {!activeOrders.length && <div className="company-empty"><h3>Nenhuma entrega ativa</h3><p>Aceite uma oferta para ficar responsável pela entrega.</p></div>}
          </section>

          {!!history.length && <section className="company-panel"><h2>Entregas recentes</h2>{history.map(order => <p key={order.id}><b>#{order.id.slice(-8)}</b> · {orderStatusLabel(order.status)} · {new Date(timestampMillis(order.createdAt)).toLocaleString('pt-BR')}</p>)}</section>}
        </>}
      </main>
    </div>
    {ticket && <PrintTicket order={ticket} kind="entrega" companyName={ticket.companyId || 'Empresa'} onClose={() => setTicket(null)} />}
  </div>
}
