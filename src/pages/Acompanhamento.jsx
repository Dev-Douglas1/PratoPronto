import { callServer, checkoutUrl } from '../services/server.js'
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useUser } from '../context/UserContext.jsx'
import { submitRefund, submitReview, subscribeCustomerOrders, subscribeOrderRecord } from '../services/company.js'
import { formatarMoeda as money } from '../utils/moeda.js'
import { normalizeOrderStatus, orderStatusLabel, ORDER_STATUS_OPTIONS } from '../config/orderStatus.js'
import { paymentLabel, paymentStatusLabel, timestampMillis } from '../utils/pedido.js'
import { traduzirErroFirebase } from '../utils/firebaseError.js'
import { subscribeDeliverySecret } from '../services/marketplace.js'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'

export default function Acompanhamento() {
  const { usuario } = useUser()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [refund, setRefund] = useState(null)
  const [review, setReview] = useState(null)
  const [recordLoading, setRecordLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [help, setHelp] = useState(false)
  const [food, setFood] = useState('')
  const [delivery, setDelivery] = useState('')
  const [comment, setComment] = useState('')
  const [deliverySecret, setDeliverySecret] = useState(null)
  const selectedId = params.get('pedido') || location.state?.pedidoId
  const order = selectedId ? orders.find(item => item.id === selectedId) : orders[0]
  function showError(err) { setError(err.code ? traduzirErroFirebase(err) : err.message) }
  useEffect(() => {
    return subscribeCustomerOrders(usuario.uid, list => { setOrders(list); setLoading(false) }, err => { showError(err); setLoading(false) })
  }, [usuario.uid])
  useEffect(() => {
    setRefund(null); setReview(null); setRecordLoading(true); setHelp(false); setError(''); setReason(''); setFood(''); setDelivery(''); setComment(''); setDeliverySecret(null)
    if (!order?.id) return
    let loaded = 0
    const done = () => { if (++loaded >= 2) setRecordLoading(false) }
    const unsubscribe = [
      subscribeOrderRecord('refundRequests', order.id, value => { setRefund(value); done() }, err => { showError(err); done() }),
      subscribeOrderRecord('reviews', order.id, value => { setReview(value); done() }, err => { showError(err); done() }),
    ]
    return () => unsubscribe.forEach(fn => fn())
  }, [order?.id])
  useEffect(() => {
    if (!order?.id || order.deliveryVerificationRequired !== true) { setDeliverySecret(null); return }
    return subscribeDeliverySecret(order.id, setDeliverySecret, err => showError(err))
  }, [order?.id, order?.deliveryVerificationRequired])
  async function submit(event, action) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try { await action(); setHelp(false) } catch (err) { showError(err) } finally { setBusy(false) }
  }
  const status = normalizeOrderStatus(order?.status)
  const demo = order?.pagamento.ambiente === 'demonstracao'
  const test = order?.pagamento.ambiente !== 'producao'
  async function payAgain() {
    setBusy(true); setError('')
    try { const result = await callServer('appResume', { orderId: order.id }); const url = checkoutUrl(result.checkoutUrl); if (url) window.location.assign(url); else setError(result.checkoutState === 'expired' ? 'O prazo deste pagamento terminou. Aguarde a atualização do pedido.' : 'O provedor ainda não confirmou a abertura do pagamento. Aguarde ou solicite ajuda à empresa.') } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const stages = ORDER_STATUS_OPTIONS.filter(s => s.id !== 'cancelado')
  const index = stages.findIndex(s => s.id === status)
  return <AppScreen>
    <TopBar titulo="Meus pedidos" perfil />
    <div className="page-heading"><span className="eyebrow">CADA ETAPA DO SEU PEDIDO</span><h1>{loading ? 'Buscando seus pedidos…' : order ? orderStatusLabel(status) : 'Seu histórico de pedidos'}</h1></div>
    {orders.length > 0 && <label className="customer-order-picker">Escolher pedido<select value={order?.id || ''} onChange={event => setParams({ pedido: event.target.value })}>{!order && <option value="">Selecione um pedido</option>}{orders.map(item => <option key={item.id} value={item.id}>#{item.id.slice(-8)} · {new Date(timestampMillis(item.createdAt)).toLocaleDateString('pt-BR')} · {orderStatusLabel(item.status)}</option>)}</select></label>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loading && !order && <div className="light-card">{selectedId ? 'Este pedido não está disponível na sua conta. Selecione outro pedido.' : 'Você ainda não fez pedidos. Escolha uma pizza para começar.'}</div>}
    {order && <>
      <div className="delivery-summary"><span className="delivery-summary__icon">{status === 'entregue' ? '✓' : '#'}</span><div><strong>Pedido #{order.id.slice(-8)}</strong><span>Total: {money(order.total)}</span><small>{order.entrega.endereco}, {order.entrega.numero} · {order.entrega.bairro} · {order.entrega.cidade}/{order.entrega.uf}</small></div></div>
      <div className="payment-status-card"><span>▰</span><div><small>{test ? 'AMBIENTE DE TESTES' : 'PAGAMENTO'}</small><strong>{paymentLabel(order.pagamento)}</strong><p>{paymentStatusLabel(order.pagamento)}.{test ? ' Nenhum valor real foi movimentado.' : ''}</p></div></div>
      {status === 'aguardando_pagamento' && !demo && <button className="btn btn-primary wide-button" disabled={busy} onClick={payAgain}>Continuar pagamento no Mercado Pago</button>}
      {deliverySecret?.code && ['pronto','saiu_entrega'].includes(status) && <div className="light-card delivery-code-card"><small>SENHA DE ENTREGA</small><h2>{deliverySecret.code}</h2><p>Informe estes 4 números ao Piloto Parceiro somente quando estiver com seu pedido em mãos. Não envie a senha por mensagem antes da entrega.</p></div>}
      {status !== 'cancelado' && <div className="order-progress" aria-label="Etapas do pedido">{stages.map((step, i) => <div key={step.id} className={i < index ? 'is-done' : i === index ? 'is-current' : ''} aria-current={i === index ? 'step' : undefined}><i>{i < index ? '✓' : i + 1}</i><span><strong>{step.label}</strong><small>{i < index ? 'Concluído' : i === index ? 'Etapa atual' : 'Próxima etapa'}</small></span></div>)}</div>}
      <div className="light-card"><h3>Seu pedido</h3>{order.itens.map((item, i) => <p key={item.id + i}><strong>{item.quantidade} × {item.nome}</strong><br /><small>{item.detalhes}</small></p>)}</div>
      <p className="live-update-note">O restaurante atualiza as etapas do seu pedido.</p>
      {refund && <div className="refund-note"><strong>Atendimento: {refund.status === 'pendente' ? 'em análise' : refund.status === 'recusado' ? 'solicitação recusada' : refund.status === 'aprovado_demo' ? 'cancelamento aprovado (teste)' : refund.status === 'cancelado_sem_cobranca' ? 'cancelado sem cobrança' : paymentStatusLabel({ status: refund.status })}</strong><span>{refund.motivo}</span>{refund.resposta && <p><b>Resposta da empresa:</b> {refund.resposta}</p>}</div>}
      {!refund && !recordLoading && status !== 'cancelado' && !help && <button className="btn btn-secondary wide-button" onClick={() => setHelp(true)}>Preciso de ajuda com este pedido</button>}
      {help && <form className="light-card refund-form" onSubmit={event => submit(event, () => submitRefund({ userId: usuario.uid, orderId: order.id, motivo: reason }))}><label htmlFor="reason">Cancelamento ou problema na entrega</label><textarea id="reason" required minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Conte o que aconteceu para a empresa ajudar." /><small>O restaurante analisará sua solicitação. {test ? 'Neste ambiente, o reembolso é de teste.' : 'A devolução será solicitada após a aprovação. Você acompanha aqui a confirmação do provedor.'}</small><div className="two-actions"><button className="btn btn-secondary" type="button" onClick={() => setHelp(false)}>Voltar</button><button className="btn btn-primary" disabled={busy}>Enviar</button></div></form>}
      {status === 'entregue' && !recordLoading && <section className="light-card customer-review"><h3>{review ? 'Sua avaliação' : 'Como foi seu pedido?'}</h3>{review ? <><p>Comida: {review.notaComida}/5 · Entrega: {review.notaEntrega}/5</p><p>{review.comentario}</p>{review.resposta && <blockquote><strong>A empresa respondeu</strong><p>{review.resposta}</p></blockquote>}</> : <form onSubmit={event => submit(event, () => submitReview({ companyId: order.companyId || DEFAULT_COMPANY_ID, userId: usuario.uid, orderId: order.id, nome: usuario.nome || 'Cliente', notaComida: food, notaEntrega: delivery, comentario: comment }))}><p>Sua opinião ajuda o restaurante a melhorar.</p><label>Comida<select required value={food} onChange={event => setFood(event.target.value)}><option value="">Escolha uma nota</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'estrela' : 'estrelas'}</option>)}</select></label><label>Entrega<select required value={delivery} onChange={event => setDelivery(event.target.value)}><option value="">Escolha uma nota</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'estrela' : 'estrelas'}</option>)}</select></label><label>Comentário (opcional)<textarea maxLength={1000} value={comment} onChange={event => setComment(event.target.value)} /></label><button className="btn btn-primary wide-button" disabled={busy}>{busy ? 'Enviando…' : 'Enviar avaliação'}</button></form>}</section>}
    </>}
    <Link className="btn btn-primary wide-button" to="/pizzas">Escolher pizzas</Link>
  </AppScreen>
}
