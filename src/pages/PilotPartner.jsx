import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'
import { pilotConfirmDelivery, pilotStartDelivery, subscribePilotOrders } from '../services/marketplace.js'
import { amountToCollect, paymentLabel, paymentStatusLabel, timestampMillis } from '../utils/pedido.js'
import { formatarMoeda as money } from '../utils/moeda.js'
import { normalizeOrderStatus, orderStatusLabel } from '../config/orderStatus.js'
import PrintTicket from '../components/company/PrintTicket.jsx'
import Icon from '../components/company/Icon.jsx'
import '../company.css'

export default function PilotPartner() {
  const { usuario, sair } = useUser()
  const { pilotCompanies } = useCompany()
  const [companyId, setCompanyId] = useState(() => pilotCompanies[0]?.companyId || '')
  const [orders, setOrders] = useState([])
  const [codes, setCodes] = useState({})
  const [received, setReceived] = useState({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const [ticket, setTicket] = useState(null)

  useEffect(() => {
    if (!pilotCompanies.some(item => item.companyId === companyId)) setCompanyId(pilotCompanies[0]?.companyId || '')
  }, [pilotCompanies, companyId])

  useEffect(() => {
    if (!usuario?.uid) return
    return subscribePilotOrders(usuario.uid, setOrders, err => setNotice({ error: true, text: err.message || 'Não foi possível carregar suas entregas.' }))
  }, [usuario?.uid])

  const visible = useMemo(
    () => orders.filter(order => (!companyId || (order.companyId || 'pratopronto') === companyId) && !['entregue','cancelado'].includes(normalizeOrderStatus(order.status))),
    [orders, companyId],
  )
  const history = useMemo(
    () => orders.filter(order => (!companyId || (order.companyId || 'pratopronto') === companyId) && ['entregue','cancelado'].includes(normalizeOrderStatus(order.status))).slice(0, 20),
    [orders, companyId],
  )

  async function action(order, fn, success) {
    if (busy) return
    setBusy(order.id); setNotice(null)
    try { await fn(); setNotice({ text: success }) }
    catch (err) { setNotice({ error: true, text: err.message || 'Não foi possível atualizar a entrega.' }) }
    finally { setBusy('') }
  }

  async function confirm(order) {
    const code = String(codes[order.id] || '').trim()
    if (!/^\d{4}$/.test(code)) { setNotice({ error: true, text: 'Digite a senha de entrega de 4 números informada pelo cliente.' }); return }
    await action(order, () => pilotConfirmDelivery(order.id, code, received[order.id] === true), 'Entrega confirmada. O cliente já pode avaliar o pedido.')
    setCodes(current => ({ ...current, [order.id]: '' }))
  }

  const companyName = pilotCompanies.find(item => item.companyId === companyId)?.name || 'Empresa'

  return <div className="company-app pilot-app">
    <aside className="company-sidebar">
      <Link className="company-brand" to="/piloto"><img src="/icons/app-icon.svg" alt="" width="42" height="42" /><span>Prato<span>Pronto</span><small>PILOTO PARCEIRO</small></span></Link>
      <div className="workspace-label">ENTREGAS <span>PARCEIRAS</span></div>
      <label className="company-selector">Empresa
        <select value={companyId} onChange={event => setCompanyId(event.target.value)}>
          {pilotCompanies.map(company => <option key={company.companyId} value={company.companyId}>{company.name}</option>)}
        </select>
        <small>Você vê apenas pedidos atribuídos à sua conta.</small>
      </label>
      <div className="sidebar-bottom"><div className="company-account"><span>{usuario?.nome?.slice(0, 2).toUpperCase() || 'PP'}</span><div><strong>{usuario?.nome || 'Piloto Parceiro'}</strong><small>{companyName}</small></div></div><button onClick={() => sair()} className="sidebar-exit"><Icon name="exit" />Sair da conta</button></div>
    </aside>
    <div className="company-main">
      <header className="company-topbar"><Link className="company-store-link" to="/">Área do cliente ↗</Link><span className="connection"><i />Piloto conectado</span></header>
      <main className="company-content">
        <div className="company-page-heading"><div><p>Pedidos atribuídos pela empresa</p><h1>Piloto Parceiro</h1></div><span className="today-label">{visible.length} entregas ativas</span></div>
        <div className="company-live-note">Nunca peça a senha antes de estar com o pedido no endereço. O cliente deve informar os 4 números somente no momento da entrega.</div>
        {notice && <div className={notice.error ? 'company-alert' : 'company-notice'} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}
        <section className="company-orders">
          {visible.map(order => {
            const status = normalizeOrderStatus(order.status)
            const collect = amountToCollect(order)
            return <article className={'company-order order-' + status} key={order.id}>
              <div className="order-card-heading"><b>#{order.id.slice(-8)}</b><span>{orderStatusLabel(status)}</span></div>
              <h2>{order.cliente?.nome || 'Cliente'}</h2>
              <p className="order-neighborhood">{order.entrega?.endereco}, {order.entrega?.numero}<br />{order.entrega?.bairro} · {order.entrega?.cidade}/{order.entrega?.uf}</p>
              <div className="order-products">{order.itens?.map((item, i) => <div key={item.id + i}><span>{item.quantidade}×</span><p>{item.nome}<small>{item.detalhes}</small></p></div>)}</div>
              <div className="order-card-total"><span>{paymentLabel(order.pagamento)}<small>{paymentStatusLabel(order.pagamento)}</small></span><b>{money(order.total)}</b></div>
              {collect > 0 && <p className="order-attention">Cobrar na entrega: {money(collect)}{order.pagamento?.metodo === 'maquina_entrega' ? ' · levar maquininha' : ''}</p>}
              <div className="order-card-actions"><a className="company-button subtle" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([order.entrega?.endereco, order.entrega?.numero, order.entrega?.bairro, order.entrega?.cidade, order.entrega?.uf].filter(Boolean).join(', '))} target="_blank" rel="noreferrer">Abrir endereço</a><button className="icon-button" aria-label="Imprimir nota de entrega" onClick={() => setTicket(order)}><Icon name="print" /></button></div>
              {status === 'pronto' && <button className="company-button primary wide" disabled={busy === order.id} onClick={() => action(order, () => pilotStartDelivery(order.id), 'Rota iniciada. O cliente já vê que o pedido saiu para entrega.')}>{busy === order.id ? 'Atualizando…' : 'Iniciar entrega'}</button>}
              {status === 'saiu_entrega' && <div className="company-panel pilot-confirm">
                <label>Senha de entrega
                  <input inputMode="numeric" autoComplete="one-time-code" maxLength="4" pattern="[0-9]{4}" placeholder="0000" value={codes[order.id] || ''} onChange={event => setCodes(current => ({ ...current, [order.id]: event.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                </label>
                {collect > 0 && <label className="company-checkbox"><input type="checkbox" checked={received[order.id] === true} onChange={event => setReceived(current => ({ ...current, [order.id]: event.target.checked }))} />Confirmo que recebi {money(collect)} na entrega.</label>}
                <button className="company-button primary wide" disabled={busy === order.id || String(codes[order.id] || '').length !== 4 || (collect > 0 && received[order.id] !== true)} onClick={() => confirm(order)}>{busy === order.id ? 'Confirmando…' : 'Confirmar entrega com senha'}</button>
              </div>}
            </article>
          })}
          {!visible.length && <div className="company-empty"><h3>Nenhuma entrega atribuída</h3><p>Quando uma empresa atribuir um pedido à sua conta, ele aparecerá aqui.</p></div>}
        </section>
        {!!history.length && <section className="company-panel"><h2>Entregas recentes</h2>{history.map(order => <p key={order.id}><b>#{order.id.slice(-8)}</b> · {orderStatusLabel(order.status)} · {new Date(timestampMillis(order.createdAt)).toLocaleString('pt-BR')}</p>)}</section>}
      </main>
    </div>
    {ticket && <PrintTicket order={ticket} kind="entrega" companyName={companyName} onClose={() => setTicket(null)} />}
  </div>
}
