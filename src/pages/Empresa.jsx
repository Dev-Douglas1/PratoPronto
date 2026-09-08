import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'
import { produtos } from '../data/produtos.js'
import { formatarMoeda } from '../utils/moeda.js'
import {
  DEFAULT_DELIVERY_CONFIG,
  getDeliveryConfig,
  ORDER_STATUS,
  ORDER_STATUS_LABELS,
  replyToReview,
  saveDeliveryConfig,
  subscribeCatalog,
  subscribeOrdersForAdmin,
  subscribeReviewsForAdmin,
  updateCatalogItem,
  updateOrderStatus,
  updateRefundStatus,
} from '../services/storage.js'

const TABS = [
  ['dashboard', 'Visão geral', '▦'],
  ['process', 'Em processo', '🍕'],
  ['deliveries', 'Entregas', '🏍️'],
  ['completed', 'Concluídos', '✓'],
  ['reviews', 'Avaliações', '★'],
  ['catalog', 'Cardápio', '☰'],
  ['support', 'Atendimento', '☎'],
  ['settings', 'Entrega', '⌖'],
]

function dateText(value) {
  const date = value?.toDate?.() || (value?.seconds ? new Date(value.seconds * 1000) : null)
  return date ? date.toLocaleString('pt-BR') : 'agora'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function itemCustomization(item) {
  const p = item.personalizacao
  if (!p) return ''
  const chunks = [p.tamanhoLabel, p.bordaLabel]
  if (p.extrasLabels?.length) chunks.push(p.extrasLabels.join(', '))
  if (p.observacao) chunks.push(`Obs.: ${p.observacao}`)
  return chunks.filter(Boolean).join(' • ')
}

function printOrder(order, kind) {
  const isCourier = kind === 'courier'
  const itemRows = (order.itens || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.quantidade)}x</td>
      <td><strong>${escapeHtml(item.nome)}</strong>${itemCustomization(item) ? `<br><small>${escapeHtml(itemCustomization(item))}</small>` : ''}</td>
    </tr>`).join('')

  const body = isCourier ? `
    <h2>ENTREGA</h2>
    <p><strong>Cliente:</strong> ${escapeHtml(order.cliente?.nome?.split(' ')[0] || 'Cliente')}</p>
    <p><strong>Telefone:</strong> ${escapeHtml(order.cliente?.telefone)}</p>
    <p><strong>Endereço:</strong> ${escapeHtml(order.entrega?.endereco)}, ${escapeHtml(order.entrega?.numero)}</p>
    <p><strong>Bairro:</strong> ${escapeHtml(order.entrega?.bairro)}</p>
    ${order.entrega?.complemento ? `<p><strong>Complemento:</strong> ${escapeHtml(order.entrega.complemento)}</p>` : ''}
    <p><strong>Pagamento:</strong> ${escapeHtml(order.pagamento?.metodo)}</p>
    <p class="total"><strong>Valor:</strong> ${escapeHtml(formatarMoeda(order.total || 0))}</p>
  ` : `
    <h2>COZINHA</h2>
    <table>${itemRows}</table>
    ${order.observacao ? `<p><strong>Observação geral:</strong> ${escapeHtml(order.observacao)}</p>` : ''}
    <p><strong>Pagamento:</strong> ${escapeHtml(order.pagamento?.metodo)} • ${escapeHtml(order.paymentStatus || '')}</p>
  `

  const popup = window.open('', '_blank', 'width=420,height=720')
  if (!popup) return
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pedido ${escapeHtml(order.id)}</title><style>
    @page{size:80mm auto;margin:4mm}body{font-family:Arial,sans-serif;width:72mm;margin:0;color:#000;font-size:12px}h1{font-size:18px;margin:0 0 3px}h2{font-size:14px;border-bottom:1px dashed #000;padding-bottom:5px}p{margin:5px 0;line-height:1.35}table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:5px 2px;border-bottom:1px dashed #aaa}td:first-child{width:24px}.total{font-size:16px;border-top:2px solid #000;padding-top:8px}.muted{font-size:10px;color:#444}</style></head><body>
    <h1>PratoPronto</h1><p>Pedido #${escapeHtml(order.id.slice(0, 8))}</p><p class="muted">${escapeHtml(dateText(order.createdAt))}</p>${body}
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`)
  popup.document.close()
}

function OrderCard({ order, courier, setCourier, onStatus, onRefund }) {
  const status = order.status === 'Pedido confirmado • preparando' ? ORDER_STATUS.PREPARING : order.status
  return (
    <article className="company-order-card">
      <div className="company-order-head">
        <div>
          <small>#{order.id.slice(0, 8)} • {dateText(order.createdAt)}</small>
          <h3>{order.cliente?.nome || 'Cliente'}</h3>
          <span>{order.cliente?.telefone || 'Sem telefone'}</span>
        </div>
        <span className={`company-status status-${status}`}>{ORDER_STATUS_LABELS[order.status] || ORDER_STATUS_LABELS[status] || status}</span>
      </div>

      <div className="company-order-grid">
        <section>
          <h4>Itens</h4>
          {(order.itens || []).map((item, index) => (
            <div className="company-item" key={`${item.id}-${index}`}>
              <strong>{item.quantidade}× {item.nome}</strong>
              {itemCustomization(item) ? <small>{itemCustomization(item)}</small> : null}
            </div>
          ))}
          {order.observacao ? <p><strong>Obs.:</strong> {order.observacao}</p> : null}
        </section>
        <section>
          <h4>Entrega</h4>
          <p>{order.entrega?.endereco}, {order.entrega?.numero}</p>
          <p>{order.entrega?.bairro}{order.entrega?.complemento ? ` • ${order.entrega.complemento}` : ''}</p>
          <h4>Pagamento</h4>
          <p>{order.pagamento?.metodo}</p>
          <p><strong>{formatarMoeda(order.total || 0)}</strong></p>
        </section>
      </div>

      <label className="courier-field">Motoboy responsável
        <input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Nome do motoboy" />
      </label>

      {order.cancelReason ? <div className="support-alert"><strong>Motivo do cancelamento:</strong> {order.cancelReason}</div> : null}
      {order.refundStatus && order.refundStatus !== 'none' ? <div className="support-alert"><strong>Reembolso:</strong> {order.refundStatus}{order.refundReason ? ` • ${order.refundReason}` : ''}</div> : null}

      <div className="company-actions">
        {status === ORDER_STATUS.RECEIVED ? <button onClick={() => onStatus(order, ORDER_STATUS.PREPARING)}>Aceitar / preparar</button> : null}
        {status === ORDER_STATUS.PREPARING ? <button onClick={() => onStatus(order, ORDER_STATUS.READY)}>Marcar pronto</button> : null}
        {status === ORDER_STATUS.READY ? <button onClick={() => onStatus(order, ORDER_STATUS.OUT_FOR_DELIVERY)}>Saiu para entrega</button> : null}
        {status === ORDER_STATUS.OUT_FOR_DELIVERY ? <button onClick={() => onStatus(order, ORDER_STATUS.DELIVERED)}>Entregue</button> : null}
        {status === ORDER_STATUS.CANCELLATION_REQUESTED ? <button className="danger" onClick={() => onStatus(order, ORDER_STATUS.CANCELLED)}>Confirmar cancelamento</button> : null}
        {![ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED].includes(status) ? <button className="danger-outline" onClick={() => onStatus(order, ORDER_STATUS.CANCELLED)}>Cancelar</button> : null}
        <button className="secondary" onClick={() => printOrder(order, 'kitchen')}>Imprimir cozinha</button>
        <button className="secondary" onClick={() => printOrder(order, 'courier')}>Imprimir motoboy</button>
      </div>

      {order.refundStatus === 'requested' ? (
        <div className="refund-actions">
          <button onClick={() => onRefund(order, 'approved')}>Aprovar reembolso</button>
          <button onClick={() => onRefund(order, 'rejected')}>Recusar</button>
          <button onClick={() => onRefund(order, 'refunded')}>Marcar reembolsado</button>
        </div>
      ) : null}
    </article>
  )
}

export default function Empresa() {
  const navigate = useNavigate()
  const { usuario, sair } = useUser()
  const [tab, setTab] = useState('dashboard')
  const [orders, setOrders] = useState([])
  const [reviews, setReviews] = useState([])
  const [catalog, setCatalog] = useState({})
  const [couriers, setCouriers] = useState({})
  const [catalogDraft, setCatalogDraft] = useState({})
  const [delivery, setDelivery] = useState(DEFAULT_DELIVERY_CONFIG)
  const [deliveryLines, setDeliveryLines] = useState('')
  const [reviewReplies, setReviewReplies] = useState({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let offOrders
    let offReviews
    let offCatalog
    try {
      offOrders = subscribeOrdersForAdmin(setOrders, (e) => setError(e.message))
      offReviews = subscribeReviewsForAdmin(setReviews, (e) => setError(e.message))
      offCatalog = subscribeCatalog(setCatalog, (e) => setError(e.message))
    } catch (e) {
      setError(e.message)
    }
    getDeliveryConfig().then((config) => {
      setDelivery(config)
      setDeliveryLines((config.areas || []).map((area) => `${area.bairro}=${area.fee}`).join('\n'))
    }).catch((e) => setError(e.message))
    return () => {
      offOrders?.()
      offReviews?.()
      offCatalog?.()
    }
  }, [])

  const stats = useMemo(() => {
    const todayKey = new Date().toLocaleDateString('pt-BR')
    const todayOrders = orders.filter((order) => {
      const date = order.createdAt?.toDate?.()
      return date?.toLocaleDateString('pt-BR') === todayKey
    })
    return {
      newOrders: orders.filter((order) => order.status === ORDER_STATUS.RECEIVED).length,
      preparing: orders.filter((order) => [ORDER_STATUS.PREPARING, ORDER_STATUS.READY].includes(order.status) || order.status === 'Pedido confirmado • preparando').length,
      deliveries: orders.filter((order) => order.status === ORDER_STATUS.OUT_FOR_DELIVERY).length,
      revenue: todayOrders.filter((order) => order.status !== ORDER_STATUS.CANCELLED).reduce((sum, order) => sum + Number(order.total || 0), 0),
      totalToday: todayOrders.length,
    }
  }, [orders])

  const visibleOrders = useMemo(() => {
    if (tab === 'process') return orders.filter((order) => [ORDER_STATUS.RECEIVED, ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.CANCELLATION_REQUESTED, 'Pedido confirmado • preparando'].includes(order.status))
    if (tab === 'deliveries') return orders.filter((order) => [ORDER_STATUS.READY, ORDER_STATUS.OUT_FOR_DELIVERY].includes(order.status))
    if (tab === 'completed') return orders.filter((order) => [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED].includes(order.status))
    if (tab === 'support') return orders.filter((order) => order.status === ORDER_STATUS.CANCELLATION_REQUESTED || order.refundStatus === 'requested')
    return []
  }, [orders, tab])

  async function changeStatus(order, status) {
    try {
      setError('')
      await updateOrderStatus(order.id, status, { assignedCourier: couriers[order.id] ?? order.assignedCourier ?? '' })
      setMessage(`Pedido #${order.id.slice(0, 8)} atualizado.`)
    } catch (e) {
      setError(e.message)
    }
  }

  async function changeRefund(order, status) {
    try {
      setError('')
      await updateRefundStatus(order.id, status)
      setMessage(`Reembolso do pedido #${order.id.slice(0, 8)} atualizado para ${status}.`)
    } catch (e) {
      setError(e.message)
    }
  }

  function draftFor(product) {
    return catalogDraft[product.id] || {
      price: catalog[product.id]?.price ?? product.preco,
      stock: catalog[product.id]?.stock ?? 99,
      available: catalog[product.id]?.available !== false,
    }
  }

  async function saveProduct(product) {
    const draft = draftFor(product)
    try {
      await updateCatalogItem(product.id, draft)
      setMessage(`${product.nome} atualizado.`)
    } catch (e) {
      setError(e.message)
    }
  }

  async function saveDelivery() {
    try {
      const areas = deliveryLines.split('\n').map((line) => {
        const [bairro, fee] = line.split('=')
        return { bairro: bairro?.trim(), fee: Number(String(fee || '').replace(',', '.')) }
      }).filter((area) => area.bairro && Number.isFinite(area.fee))
      const next = { ...delivery, areas }
      await saveDeliveryConfig(next)
      setDelivery(next)
      setMessage('Taxas de entrega atualizadas.')
    } catch (e) {
      setError(e.message)
    }
  }

  async function sendReply(review) {
    try {
      await replyToReview(review.id, reviewReplies[review.id] ?? review.restaurantReply ?? '')
      setMessage('Resposta enviada.')
    } catch (e) {
      setError(e.message)
    }
  }

  async function logout() {
    await sair()
    navigate('/login', { replace: true })
  }

  return (
    <div className="company-shell">
      <header className="company-header">
        <div className="company-brand"><span className="company-pac">◕</span><div><strong>PratoPronto</strong><small>Área da empresa</small></div></div>
        <div className="company-user"><span>{usuario?.nome || 'Administrador'}</span><button onClick={() => navigate('/pizzas')}>Ver loja</button><button onClick={logout}>Sair</button></div>
      </header>

      <div className="company-layout">
        <nav className="company-nav" aria-label="Menu da empresa">
          {TABS.map(([id, label, icon]) => <button className={tab === id ? 'is-active' : ''} key={id} onClick={() => setTab(id)}><span>{icon}</span>{label}{id === 'process' && stats.newOrders ? <b>{stats.newOrders}</b> : null}</button>)}
        </nav>

        <main className="company-main">
          <div className="company-title-row"><div><small>PAINEL EM TEMPO REAL</small><h1>{TABS.find(([id]) => id === tab)?.[1]}</h1></div><span className="live-dot">● Online</span></div>
          {message ? <div className="company-message">{message}<button onClick={() => setMessage('')}>×</button></div> : null}
          {error ? <div className="company-error">{error}<button onClick={() => setError('')}>×</button></div> : null}

          {tab === 'dashboard' ? (
            <>
              <section className="company-stats">
                <article><span>Novos</span><strong>{stats.newOrders}</strong><small>aguardando aceite</small></article>
                <article><span>Em preparo</span><strong>{stats.preparing}</strong><small>cozinha</small></article>
                <article><span>Entregas</span><strong>{stats.deliveries}</strong><small>na rua</small></article>
                <article><span>Pedidos hoje</span><strong>{stats.totalToday}</strong><small>{formatarMoeda(stats.revenue)}</small></article>
              </section>
              <section className="company-panel">
                <div className="company-panel-head"><h2>Pedidos mais recentes</h2><button onClick={() => setTab('process')}>Abrir pedidos</button></div>
                {orders.slice(0, 5).map((order) => <div className="compact-order" key={order.id}><strong>#{order.id.slice(0, 8)} • {order.cliente?.nome}</strong><span>{ORDER_STATUS_LABELS[order.status] || order.status}</span><b>{formatarMoeda(order.total || 0)}</b></div>)}
                {!orders.length ? <p>Nenhum pedido ainda.</p> : null}
              </section>
            </>
          ) : null}

          {['process', 'deliveries', 'completed', 'support'].includes(tab) ? (
            <section className="company-orders">
              {visibleOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  courier={couriers[order.id] ?? order.assignedCourier ?? ''}
                  setCourier={(value) => setCouriers((current) => ({ ...current, [order.id]: value }))}
                  onStatus={changeStatus}
                  onRefund={changeRefund}
                />
              ))}
              {!visibleOrders.length ? <div className="company-empty"><span>✓</span><h3>Nada por aqui</h3><p>Os pedidos aparecerão automaticamente.</p></div> : null}
            </section>
          ) : null}

          {tab === 'reviews' ? (
            <section className="review-list">
              {reviews.map((review) => (
                <article className="company-panel review-admin-card" key={review.id}>
                  <div className="review-admin-head"><div><strong>{review.displayName || 'Cliente'}</strong><small>Pedido #{review.orderId?.slice(0, 8)}</small></div><span>🍕 {review.foodRating}/5 • 🏍️ {review.deliveryRating}/5</span></div>
                  {review.comment ? <p>{review.comment}</p> : <p className="muted">Sem comentário.</p>}
                  <label>Responder
                    <textarea value={reviewReplies[review.id] ?? review.restaurantReply ?? ''} onChange={(e) => setReviewReplies((current) => ({ ...current, [review.id]: e.target.value }))} maxLength={800} />
                  </label>
                  <button className="company-primary" onClick={() => sendReply(review)}>Salvar resposta</button>
                </article>
              ))}
              {!reviews.length ? <div className="company-empty"><span>★</span><h3>Sem avaliações</h3><p>A avaliação é liberada somente após a entrega.</p></div> : null}
            </section>
          ) : null}

          {tab === 'catalog' ? (
            <section className="catalog-admin-grid">
              {produtos.map((product) => {
                const draft = draftFor(product)
                return (
                  <article className="company-panel catalog-admin-card" key={product.id}>
                    <img src={product.imagem} alt="" />
                    <div><strong>{product.nome}</strong><small>{product.descricao}</small></div>
                    <label>Preço<input type="number" min="0" step="0.01" value={draft.price} onChange={(e) => setCatalogDraft((current) => ({ ...current, [product.id]: { ...draft, price: e.target.value } }))} /></label>
                    <label>Estoque<input type="number" min="0" step="1" value={draft.stock} onChange={(e) => setCatalogDraft((current) => ({ ...current, [product.id]: { ...draft, stock: e.target.value } }))} /></label>
                    <label className="switch-row"><input type="checkbox" checked={draft.available} onChange={(e) => setCatalogDraft((current) => ({ ...current, [product.id]: { ...draft, available: e.target.checked } }))} />Disponível no app</label>
                    <button className="company-primary" onClick={() => saveProduct(product)}>Salvar</button>
                  </article>
                )
              })}
            </section>
          ) : null}

          {tab === 'settings' ? (
            <section className="company-panel delivery-config">
              <h2>Taxas por bairro</h2>
              <p>Configure as taxas reais da sua área. Use uma linha por bairro no formato <strong>Bairro=valor</strong>.</p>
              <div className="settings-grid">
                <label>Taxa padrão (R$)<input type="number" min="0" step="0.01" value={delivery.defaultFee} onChange={(e) => setDelivery({ ...delivery, defaultFee: Number(e.target.value) })} /></label>
                <label>Entrega grátis a partir de (R$)<input type="number" min="0" step="0.01" value={delivery.freeOver} onChange={(e) => setDelivery({ ...delivery, freeOver: Number(e.target.value) })} /></label>
              </div>
              <label>Bairros e taxas<textarea rows="10" value={deliveryLines} onChange={(e) => setDeliveryLines(e.target.value)} placeholder={'Centro=5\nMaracanã=6'} /></label>
              <button className="company-primary" onClick={saveDelivery}>Salvar taxas</button>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  )
}
