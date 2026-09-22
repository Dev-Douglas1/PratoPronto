import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useCart } from '../context/CartContext.jsx'
import { useUser } from '../context/UserContext.jsx'
import { formatarMoeda as money } from '../utils/moeda.js'
import { callServer, cartItems, checkoutUrl } from '../services/server.js'
import useStorefront from '../hooks/useStorefront.js'

const methods = [
  { id: 'pix', title: 'Pix', detail: 'Pague no ambiente do Mercado Pago', icon: '◆' },
  { id: 'cartao_online', title: 'Cartão online', detail: 'Crédito ou débito disponível no provedor', icon: '▰' },
  { id: 'maquina_entrega', title: 'Máquina na entrega', detail: 'O motoboy leva a maquininha', icon: '⌁' },
]
export default function Pagamento() {
  const navigate = useNavigate()
  const { lista, limpar, companyId } = useCart()
  const { usuario } = useUser()
  const { store, loading, error: storeError } = useStorefront(companyId)
  const [method, setMethod] = useState('pix')
  const [cardType, setCardType] = useState('credito')
  const [note, setNote] = useState('')
  const [quote, setQuote] = useState(null)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const storageKey = 'pratopronto:checkout:' + usuario?.uid + ':' + companyId
  const [pending, setPending] = useState(() => {
    try { const value = JSON.parse(sessionStorage.getItem(storageKey)); return value?.quoteId && value?.requestId ? value : null } catch { return null }
  })
  const cartSignature = JSON.stringify(cartItems(lista))
  useEffect(() => { setQuote(null) }, [cartSignature, method, cardType, note, usuario?.updatedAt])
  useEffect(() => {
    if (store?.methods?.length && !store.methods.includes(method)) setMethod(store.methods[0])
  }, [store, method])
  async function finish(attempt) {
    const result = await callServer('appCheckout', attempt)
    setPending(null)
    try { sessionStorage.removeItem(storageKey) } catch { /* Available in memory. */ }
    limpar()
    const url = checkoutUrl(result.checkoutUrl)
    if (url) window.location.assign(url)
    else navigate('/acompanhamento?pedido=' + encodeURIComponent(result.orderId), { replace: true })
  }
  async function submit(event) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      if (pending) { await finish(pending); return }
      if (!quote) {
        const value = await callServer('appQuote', { companyId, items: cartItems(lista), method, cardType, note, acceptTerms })
        setQuote(value)
        return
      }
      if (new Date(quote.expiresAt).getTime() <= Date.now()) {
        setQuote(null); throw new Error('O resumo expirou. Confira os valores novamente antes de pagar.')
      }
      const attempt = { quoteId: quote.quoteId, requestId: crypto.randomUUID() }
      setPending(attempt)
      try { sessionStorage.setItem(storageKey, JSON.stringify(attempt)) } catch { /* Same key retained in state. */ }
      await finish(attempt)
    } catch (err) {
      if (err.restartCheckout === true) {
        setPending(null); setQuote(null)
        try { sessionStorage.removeItem(storageKey) } catch { /* Available in memory. */ }
      }
      setError(err.message)
    }
    finally { lock.current = false; setBusy(false) }
  }
  return <AppScreen>
    <TopBar titulo="Pagamento" perfil />
    <div className="page-heading"><span className="eyebrow">FINALIZAR PEDIDO</span><h1>{quote ? 'Confira antes de confirmar' : 'Escolha como pagar'}</h1><p>O restaurante confirma os preços e a entrega antes do pagamento.</p></div>
    <form className="light-card payment-card" onSubmit={submit}>
      {store?.environment === 'test' && <div className="demo-payment-banner" role="note"><strong>AMBIENTE DE TESTES</strong><span>Use somente usuários e cartões de teste do Mercado Pago. Não há cobrança real.</span></div>}
      {(storeError || (!loading && !store?.open)) && <p className="form-error dark-error" role="status">{storeError || 'O restaurante está fechado para novos pedidos neste horário.'}</p>}
      {pending && <div className="payment-demo-panel"><p>Existe uma tentativa anterior. Recupere o pedido para conferir o resultado antes de iniciar outra compra.</p></div>}
      <fieldset className="payment-methods" disabled={busy || Boolean(pending)}><legend>Forma de pagamento</legend>
        {methods.map(item => <button key={item.id} type="button" disabled={!store?.methods.includes(item.id)} className={'payment-method ' + (method === item.id ? 'is-selected' : '')} aria-pressed={method === item.id} onClick={() => setMethod(item.id)}><span className="payment-method__icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><i>{method === item.id ? '✓' : ''}</i></button>)}
      </fieldset>
      {method !== 'pix' && <fieldset className="payment-kind" disabled={busy || Boolean(pending)}><legend>Tipo do cartão</legend>{[['credito','Crédito'],['debito','Débito']].map(([id,title]) => <button key={id} type="button" className={cardType === id ? 'is-selected' : ''} onClick={() => setCardType(id)}>{title}</button>)}</fieldset>}
      <div className="payment-demo-panel"><p>{method === 'maquina_entrega' ? 'O pagamento será feito na entrega. O pedido informa ao entregador que ele deve levar a maquininha.' : 'Você será encaminhado ao Mercado Pago. Os dados do cartão e o CVV são preenchidos no provedor de pagamento. A aprovação aparecerá aqui após a confirmação.'}</p></div>
      <label htmlFor="checkout-note">Observação do pedido (opcional)</label><textarea id="checkout-note" maxLength={500} value={note} onChange={event => setNote(event.target.value)} disabled={busy || Boolean(pending)} placeholder="Ex.: tocar o interfone ao chegar." />
      <div className="delivery-summary light-summary"><strong>Entregar em</strong><span>{usuario?.endereco}, {usuario?.numero} · {usuario?.bairro}</span><span>{usuario?.cidade} / {usuario?.uf} · CEP {usuario?.cep}</span><Link to="/perfil">Corrigir endereço</Link></div>
      {quote && <section className="checkout-quote" aria-live="polite"><h3>Resumo confirmado pelo restaurante</h3>{quote.itens.map(item => <p key={item.id}><span>{item.quantidade} × {item.nome}<small>{item.detalhes}</small>{item.promocao && <small>{item.promocao.percentual}% de desconto · {item.promocao.titulo}</small>}</span><b>{money(item.quantidade * item.precoUnitario)}</b></p>)}<p><span>Entrega</span><b>{quote.taxaEntrega === 0 ? 'Grátis' : money(quote.taxaEntrega)}</b></p><div className="payment-total"><span>Total a {method === 'maquina_entrega' ? 'pagar na entrega' : 'pagar'}</span><strong>{money(quote.total)}</strong></div><small>Previsão: {quote.estimateMinutes} minutos após a confirmação. Valores válidos por 5 minutos.</small></section>}
      {!usuario?.emailVerificado && <Link className="text-link dark-link" to="/verificar-email">Confirme seu e-mail para finalizar.</Link>}
      {!pending && <label className="checkbox-line"><input type="checkbox" checked={acceptTerms} required disabled={busy} onChange={event => { setAcceptTerms(event.target.checked); setQuote(null) }} />Li os <Link to="/termos-de-uso">Termos de Uso</Link> e a <Link to="/politica-de-privacidade">Política de Privacidade</Link> apresentados para este pedido.</label>}
      {error && <p className="form-error dark-error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || (!pending && (!lista.length || !store?.open || !store?.methods.includes(method))) || !usuario?.emailVerificado}>{busy ? 'Aguarde…' : pending ? 'Recuperar tentativa anterior' : !quote ? 'Conferir valores e entrega' : method === 'maquina_entrega' ? 'Confirmar pedido · ' + money(quote.total) : 'Pagar no Mercado Pago · ' + money(quote.total)}</button>
      {pending && <Link to="/acompanhamento" className="text-link dark-link">Consultar meus pedidos</Link>}
      <Link className="btn btn-secondary" to="/pedido">Voltar ao carrinho</Link>
    </form>
  </AppScreen>
}
