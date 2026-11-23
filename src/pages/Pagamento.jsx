import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useCart } from '../context/CartContext.jsx'
import { useUser } from '../context/UserContext.jsx'
import { formatarMoeda as money } from '../utils/moeda.js'
import { callServer, cartItems } from '../services/server.js'
import useStorefront from '../hooks/useStorefront.js'
import { getSupabase } from '../lib/supabase.js'

const methods = [
  { id: 'pix', title: 'Pix', detail: 'Confirmação automática pelo Asaas', icon: '◆' },
  { id: 'cartao_online', title: 'Cartão online', detail: 'Em integração — indisponível no momento', icon: '▰' },
  { id: 'maquina_entrega', title: 'Maquininha na entrega', detail: 'Pagamento direto ao restaurante', icon: '⌁' },
]

export default function Pagamento() {
  const navigate = useNavigate()
  const { lista, limpar, companyId } = useCart()
  const { usuario } = useUser()
  const { store, loading, error: storeError } = useStorefront(companyId)
  const [method, setMethod] = useState('pix')
  const [note, setNote] = useState('')
  const [quote, setQuote] = useState(null)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pixPayment, setPixPayment] = useState(null)
  const lock = useRef(false)
  const storageKey = 'pratopronto:checkout:' + usuario?.uid + ':' + companyId
  const [pending, setPending] = useState(() => {
    try { const value = JSON.parse(sessionStorage.getItem(storageKey)); return value?.quoteId && value?.requestId ? value : null } catch { return null }
  })
  const cartSignature = JSON.stringify(cartItems(lista))
  const quoteSubtotal = quote?.itens?.reduce((sum, item) => sum + (Number(item.quantidade) || 0) * (Number(item.precoUnitario) || 0), 0) ?? 0

  useEffect(() => { setQuote(null) }, [cartSignature, method, note, usuario?.updatedAt])
  useEffect(() => {
    if (store?.methods?.length && !store.methods.includes(method)) setMethod(store.methods[0])
  }, [store, method])

  useEffect(() => {
    if (!pixPayment?.orderId) return
    const supabase = getSupabase()
    const channel = supabase.channel('order-payment:' + pixPayment.orderId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: 'id=eq.' + pixPayment.orderId,
      }, payload => {
        if (payload.new?.payment_status === 'paid') {
          setPixPayment(null)
          navigate('/acompanhamento?pedido=' + encodeURIComponent(pixPayment.orderId), { replace: true })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [pixPayment?.orderId, navigate])

  async function finish(attempt) {
    const result = await callServer('appCheckout', attempt)
    setPending(null)
    try { sessionStorage.removeItem(storageKey) } catch { /* Same attempt is retained in memory. */ }
    if (result.paymentMethod === 'pix') {
      if (!result.pix?.payload || !result.pix?.encodedImage) {
        throw new Error('O Asaas criou a cobrança, mas não retornou o QR Code. Consulte seus pedidos antes de tentar novamente.')
      }
      setPixPayment({
        orderId: result.orderId,
        paymentId: result.providerPaymentId,
        payload: result.pix.payload,
        encodedImage: result.pix.encodedImage,
        expirationDate: result.pix.expirationDate,
      })
      setQuote(null)
      limpar()
      return
    }
    limpar()
    navigate('/acompanhamento?pedido=' + encodeURIComponent(result.orderId), { replace: true })
  }

  async function copyPix() {
    try {
      await navigator.clipboard.writeText(pixPayment.payload)
      setError('Código Pix copiado.')
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o código Pix e copie manualmente.')
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      if (pending) { await finish(pending); return }
      if (!quote) {
        const value = await callServer('appQuote', {
          companyId, items: cartItems(lista), method, note, acceptTerms,
        })
        setQuote(value)
        return
      }
      if (new Date(quote.expiresAt).getTime() <= Date.now()) {
        setQuote(null)
        throw new Error('O resumo expirou. Confira os valores novamente antes de pagar.')
      }
      const attempt = { quoteId: quote.quoteId, requestId: crypto.randomUUID() }
      setPending(attempt)
      try { sessionStorage.setItem(storageKey, JSON.stringify(attempt)) } catch { /* Same key retained in state. */ }
      await finish(attempt)
    } catch (err) {
      if (err.restartCheckout === true) {
        setPending(null); setQuote(null)
        try { sessionStorage.removeItem(storageKey) } catch { /* Same key retained in memory. */ }
      }
      setError(err.message)
    }
    finally { lock.current = false; setBusy(false) }
  }

  return <AppScreen>
    <TopBar titulo="Pagamento" perfil />
    <div className="page-heading"><span className="eyebrow">FINALIZAR PEDIDO</span><h1>{pixPayment ? 'Pague com Pix' : quote ? 'Confira antes de confirmar' : 'Escolha como pagar'}</h1><p>O restaurante confirma os preços e a entrega antes do pagamento.</p></div>

    {pixPayment ? (
      <section className="light-card payment-card pix-payment-card" aria-live="polite">
        <div className="payment-demo-panel"><strong>Pedido #{pixPayment.orderId.slice(-8)}</strong><p>Escaneie o QR Code ou copie o código Pix. O pedido só será confirmado após o Asaas notificar o recebimento.</p></div>
        <img className="pix-qr-image" src={'data:image/png;base64,' + pixPayment.encodedImage} alt="QR Code Pix para pagamento do pedido" />
        <label htmlFor="pix-payload">Pix Copia e Cola</label>
        <textarea id="pix-payload" readOnly value={pixPayment.payload} rows={4} />
        <button type="button" className="btn btn-primary wide-button" onClick={copyPix}>Copiar código Pix</button>
        {pixPayment.expirationDate && <p className="muted">Válido até {new Date(pixPayment.expirationDate).toLocaleString('pt-BR')}</p>}
        <p className="payment-live-note">Aguardando confirmação automática. Esta tela acompanha a atualização do pedido em tempo real.</p>
        {error && <p className="form-error dark-error" role="status">{error}</p>}
        <button type="button" className="btn btn-secondary wide-button" onClick={() => navigate('/acompanhamento?pedido=' + encodeURIComponent(pixPayment.orderId))}>Ver acompanhamento do pedido</button>
      </section>
    ) : (
      <form className="light-card payment-card" onSubmit={submit}>
        {(storeError || (!loading && !store?.open)) && <p className="form-error dark-error" role="status">{storeError || 'O restaurante está fechado para novos pedidos neste horário.'}</p>}
        {pending && <div className="payment-demo-panel"><p>Existe uma tentativa anterior. Retome a mesma tentativa para evitar uma cobrança duplicada.</p></div>}
        <fieldset className="payment-methods" disabled={busy || Boolean(pending)}><legend>Forma de pagamento</legend>
          {methods.map(item => <button key={item.id} type="button" disabled={!store?.methods?.includes(item.id)} className={'payment-method ' + (method === item.id ? 'is-selected' : '')} aria-pressed={method === item.id} onClick={() => setMethod(item.id)}><span className="payment-method__icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><i>{method === item.id ? '✓' : ''}</i></button>)}
        </fieldset>
        <div className="payment-demo-panel"><p>{method === 'maquina_entrega'
          ? 'O pedido será entregue pelo restaurante. O pagamento será feito diretamente ao estabelecimento, com maquininha.'
          : method === 'pix'
            ? 'O Pix será gerado pelo Asaas. O pedido só entra em preparação depois que o webhook confirmar o recebimento.'
            : 'Cartão online ainda não está liberado. A integração depende da tokenização segura do cartão.'}</p></div>
        <label htmlFor="checkout-note">Observação do pedido (opcional)</label><textarea id="checkout-note" maxLength={500} value={note} onChange={event => setNote(event.target.value)} disabled={busy || Boolean(pending)} placeholder="Ex.: tocar o interfone ao chegar." />
        <div className="delivery-summary light-summary"><strong>Entregar em</strong><span>{usuario?.endereco}, {usuario?.numero} · {usuario?.bairro}</span><span>{usuario?.cidade} / {usuario?.uf} · CEP {usuario?.cep}</span><Link to="/perfil?editar=endereco">Corrigir endereço</Link></div>
        {quote && <section className="checkout-quote" aria-live="polite"><h3>Detalhamento dos valores</h3>{quote.itens.map(item => <p key={item.id}><span>{item.quantidade} × {item.nome}<small>{item.detalhes}</small>{item.promocao && <small>{item.promocao.percentual}% de desconto · {item.promocao.titulo}</small>}</span><b>{money(item.quantidade * item.precoUnitario)}</b></p>)}<p><span>Subtotal dos produtos</span><b>{money(quoteSubtotal)}</b></p><p><span>Taxa de entrega</span><b>{quote.taxaEntrega === 0 ? 'Grátis' : money(quote.taxaEntrega)}</b></p><div className="payment-total"><span>Total {method === 'maquina_entrega' ? 'na entrega' : 'no Pix'}</span><strong>{money(quote.total)}</strong></div><small>Entrega estimada: {quote.estimateMinutes} minutos. Valores válidos por 5 minutos.</small></section>}
        {!usuario?.emailVerificado && <Link className="text-link dark-link" to="/verificar-email">Confirme seu e-mail para finalizar.</Link>}
        {!pending && <label className="checkbox-line"><input type="checkbox" checked={acceptTerms} required disabled={busy} onChange={event => { setAcceptTerms(event.target.checked); setQuote(null) }} />Li os <Link to="/termos-de-uso">Termos de Uso</Link> e a <Link to="/politica-de-privacidade">Política de Privacidade</Link> apresentados para este pedido.</label>}
        {error && <p className="form-error dark-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy || (!pending && (!lista.length || !store?.open || !store?.methods?.includes(method))) || !usuario?.emailVerificado}>{busy ? 'Aguarde…' : pending ? 'Retomar tentativa anterior' : !quote ? 'Confirmar seleção e calcular valores' : method === 'maquina_entrega' ? 'Confirmar pedido · ' + money(quote.total) : 'Gerar Pix Asaas · ' + money(quote.total)}</button>
        {pending && <Link to="/acompanhamento" className="text-link dark-link">Consultar meus pedidos</Link>}
        <Link className="btn btn-secondary" to="/pedido">Voltar ao carrinho</Link>
      </form>
    )}
  </AppScreen>
}
