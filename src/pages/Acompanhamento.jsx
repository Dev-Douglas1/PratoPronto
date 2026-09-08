import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useUser } from '../context/UserContext.jsx'
import {
  createReview,
  getReview,
  ORDER_STATUS,
  ORDER_STATUS_LABELS,
  requestOrderCancellation,
  requestRefund,
  subscribeOrdersForUser,
} from '../services/storage.js'
import { formatarMoeda } from '../utils/moeda.js'

const STEPS = [ORDER_STATUS.RECEIVED, ORDER_STATUS.PREPARING, ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.DELIVERED]

function normalizeStatus(status) {
  if (status === 'Pedido confirmado • preparando') return ORDER_STATUS.PREPARING
  if (status === ORDER_STATUS.READY) return ORDER_STATUS.PREPARING
  return status
}

export default function Acompanhamento() {
  const navigate = useNavigate()
  const { usuario } = useUser()
  const [orders, setOrders] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [erro, setErro] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [reason, setReason] = useState('')
  const [review, setReview] = useState(null)
  const [reviewForm, setReviewForm] = useState({ foodRating: 5, deliveryRating: 5, comment: '' })

  useEffect(() => {
    if (!usuario?.uid) return undefined
    setErro('')
    try {
      return subscribeOrdersForUser(usuario.uid, (items) => {
        setOrders(items)
        setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id || '')
      }, (error) => setErro(error.message))
    } catch (error) {
      setErro(error.message)
      return undefined
    }
  }, [usuario?.uid])

  const order = useMemo(() => orders.find((item) => item.id === selectedId) || orders[0] || null, [orders, selectedId])
  const normalizedStatus = normalizeStatus(order?.status)
  const currentIndex = Math.max(0, STEPS.indexOf(normalizedStatus))

  useEffect(() => {
    let active = true
    if (!order?.id || normalizedStatus !== ORDER_STATUS.DELIVERED) {
      setReview(null)
      return undefined
    }
    getReview(order.id).then((value) => { if (active) setReview(value) }).catch(() => undefined)
    return () => { active = false }
  }, [order?.id, normalizedStatus])

  async function solicitarCancelamento() {
    if (!order) return
    try {
      setErro('')
      await requestOrderCancellation(order.id, reason)
      setReason('')
      setActionMessage('Solicitação de cancelamento enviada para a empresa.')
    } catch (error) {
      setErro(error.message)
    }
  }

  async function solicitarReembolso() {
    if (!order) return
    try {
      setErro('')
      await requestRefund(order.id, reason)
      setReason('')
      setActionMessage('Solicitação de reembolso enviada para análise.')
    } catch (error) {
      setErro(error.message)
    }
  }

  async function enviarAvaliacao(event) {
    event.preventDefault()
    if (!order || !usuario) return
    try {
      setErro('')
      await createReview({
        orderId: order.id,
        userId: usuario.uid,
        displayName: usuario.nome ? `${usuario.nome.split(' ')[0]} ${usuario.nome.split(' ')[1]?.[0] || ''}.`.trim() : 'Cliente',
        foodRating: reviewForm.foodRating,
        deliveryRating: reviewForm.deliveryRating,
        comment: reviewForm.comment,
      })
      const saved = await getReview(order.id)
      setReview(saved)
      setActionMessage('Obrigado pela avaliação!')
    } catch (error) {
      setErro(error.message)
    }
  }

  const canCancel = order && ![ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED, ORDER_STATUS.CANCELLATION_REQUESTED].includes(normalizedStatus)
  const canRefund = order && order.refundStatus !== 'requested' && order.refundStatus !== 'refunded'

  return (
    <AppScreen>
      <TopBar titulo="Acompanhamento do pedido" perfil />
      <div className="page-heading">
        <span className="eyebrow">ATUALIZAÇÃO AUTOMÁTICA</span>
        <h1>Acompanhe seus pedidos</h1>
        <p>O status muda em tempo real quando a empresa atualiza o pedido.</p>
      </div>

      {orders.length > 1 ? (
        <label className="order-selector">Pedido
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {orders.map((item) => <option value={item.id} key={item.id}>#{item.id.slice(0, 8)} • {formatarMoeda(item.total)}</option>)}
          </select>
        </label>
      ) : null}

      {order ? (
        <>
          <div className="delivery-summary">
            <span className="delivery-summary__icon">✓</span>
            <div>
              <strong>Pedido #{order.id.slice(0, 8)}</strong>
              <span>Total: {formatarMoeda(order.total)}</span>
              <small>{order.entrega?.endereco}, {order.entrega?.numero} • {order.entrega?.bairro}</small>
            </div>
          </div>
          <div className="status-badge">{ORDER_STATUS_LABELS[order.status] || order.status}</div>
          {order.refundStatus && order.refundStatus !== 'none' ? <div className="refund-badge">Reembolso: {order.refundStatus}</div> : null}

          <div className="order-progress" aria-label="Etapas do pedido">
            {[
              ['Pedido recebido', 'Recebemos seu pedido'],
              ['Preparando', 'A cozinha está preparando'],
              ['Saiu para entrega', 'O entregador está a caminho'],
              ['Entregue', 'Bom apetite!'],
            ].map(([title, detail], index) => (
              <div key={title} className={index < currentIndex ? 'is-done' : index === currentIndex ? 'is-current' : ''}>
                <i>{index < currentIndex ? '✓' : index + 1}</i>
                <span><strong>{title}</strong><small>{detail}</small></span>
              </div>
            ))}
          </div>

          <div className="light-card support-card">
            <h3>Problema com o pedido?</h3>
            <textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Explique rapidamente o motivo (opcional)." />
            <div className="two-actions">
              <button className="btn btn-secondary" disabled={!canCancel} type="button" onClick={solicitarCancelamento}>Cancelar pedido</button>
              <button className="btn btn-secondary" disabled={!canRefund} type="button" onClick={solicitarReembolso}>Solicitar reembolso</button>
            </div>
            <small>Cancelamentos e reembolsos são analisados pela empresa. O reembolso financeiro real será automatizado quando o backend do Mercado Pago estiver ativado.</small>
          </div>

          {normalizedStatus === ORDER_STATUS.DELIVERED ? (
            <div className="light-card review-card">
              <h3>Avalie seu pedido</h3>
              {review ? (
                <div className="review-saved">
                  <strong>Comida: {review.foodRating}/5 • Entrega: {review.deliveryRating}/5</strong>
                  {review.comment ? <p>{review.comment}</p> : null}
                  {review.restaurantReply ? <small>Resposta da empresa: {review.restaurantReply}</small> : null}
                </div>
              ) : (
                <form onSubmit={enviarAvaliacao}>
                  <div className="rating-grid">
                    <label>Comida<select value={reviewForm.foodRating} onChange={(e) => setReviewForm({ ...reviewForm, foodRating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} estrelas</option>)}</select></label>
                    <label>Entrega<select value={reviewForm.deliveryRating} onChange={(e) => setReviewForm({ ...reviewForm, deliveryRating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} estrelas</option>)}</select></label>
                  </div>
                  <textarea value={reviewForm.comment} maxLength={800} onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })} placeholder="Comentário opcional" />
                  <button className="btn btn-primary wide-button" type="submit">Enviar avaliação</button>
                </form>
              )}
            </div>
          ) : null}
        </>
      ) : <div className="light-card empty-state"><span>🍕</span><p>Nenhum pedido encontrado.</p></div>}

      {actionMessage && <p className="form-success" role="status">{actionMessage}</p>}
      {erro && <p className="form-error" role="alert">{erro}</p>}
      <button className="btn ghost-button wide-button" onClick={() => navigate('/pizzas')}>Fazer novo pedido</button>
    </AppScreen>
  )
}
