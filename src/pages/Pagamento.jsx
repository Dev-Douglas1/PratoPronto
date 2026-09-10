import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatarMoeda } from '../utils/moeda.js'
import { formatarNumeroCartao, formatarValidade } from '../utils/cartao.js'
import { useUser } from '../context/UserContext.jsx'
import { calculateDeliveryFee, createOrder } from '../services/storage.js'
import {
  createSecureOrder,
  quoteSecureOrder,
  secureOrderBackendEnabled,
} from '../services/secureOrders.js'

const cardDemoEnabled = !secureOrderBackendEnabled
  && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_CARD_DEMO === 'true')

export default function Pagamento() {
  const navigate = useNavigate()
  const { lista, total, limpar, precoUnitario } = useCart()
  const { usuario } = useUser()
  const [deliveryFee, setDeliveryFee] = useState(null)
  const [serverQuote, setServerQuote] = useState(null)
  const [loadingFee, setLoadingFee] = useState(false)
  const [feeError, setFeeError] = useState('')
  const [method, setMethod] = useState(cardDemoEnabled ? 'card-demo' : 'cash-on-delivery')
  const [form, setForm] = useState({ numero: '', validade: '', cvv: '', nome: '' })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const backendItems = useMemo(() => lista.map((item) => ({
    id: item.produto.id,
    quantidade: item.quantidade,
    personalizacao: item.personalizacao,
  })), [lista])

  const backendItemsKey = useMemo(() => JSON.stringify(backendItems), [backendItems])

  useEffect(() => {
    let active = true

    async function loadFee() {
      setFeeError('')
      setServerQuote(null)

      if (!lista.length || total <= 0) {
        setDeliveryFee(0)
        return
      }
      if (!usuario?.bairro) {
        setDeliveryFee(null)
        setFeeError('Informe seu bairro no perfil antes de finalizar o pedido.')
        return
      }

      try {
        setLoadingFee(true)
        if (secureOrderBackendEnabled) {
          const quote = await quoteSecureOrder(JSON.parse(backendItemsKey))
          if (active) {
            setServerQuote(quote)
            setDeliveryFee(Number(quote.deliveryFee || 0))
          }
          return
        }

        const value = await calculateDeliveryFee(usuario.bairro, total)
        if (active) setDeliveryFee(value)
      } catch (error) {
        if (active) {
          setDeliveryFee(null)
          setServerQuote(null)
          setFeeError(error.message || 'Não foi possível calcular a taxa de entrega.')
        }
      } finally {
        if (active) setLoadingFee(false)
      }
    }

    loadFee()
    return () => { active = false }
  }, [usuario?.bairro, total, lista.length, backendItemsKey])

  const displaySubtotal = secureOrderBackendEnabled && serverQuote
    ? Number(serverQuote.subtotal || 0)
    : total
  const displayDeliveryFee = secureOrderBackendEnabled && serverQuote
    ? Number(serverQuote.deliveryFee || 0)
    : deliveryFee
  const finalTotal = secureOrderBackendEnabled && serverQuote
    ? Number(serverQuote.total || 0)
    : total + (deliveryFee ?? 0)

  async function confirmar(event) {
    event.preventDefault()
    setErro('')

    if (!usuario) {
      setErro('Faça login para finalizar o pedido.')
      return
    }
    if (!usuario.emailVerified) {
      setErro('Verifique seu e-mail antes de finalizar o pedido.')
      return
    }
    if (!lista.length) {
      setErro('Seu carrinho está vazio.')
      return
    }
    if (!usuario.endereco?.trim() || !usuario.numero?.trim() || !usuario.bairro?.trim() || !usuario.telefone?.trim()) {
      setErro('Complete telefone e endereço no perfil antes de finalizar o pedido.')
      return
    }
    if (method === 'card-demo' && !cardDemoEnabled) {
      setErro('Pagamento por cartão demonstrativo está desativado nesta versão.')
      return
    }
    if (method === 'card-demo' && (form.numero.replace(/\D/g, '').length < 13 || !form.validade || form.cvv.length < 3 || !form.nome.trim())) {
      setErro('Preencha corretamente os dados do cartão.')
      return
    }

    try {
      setEnviando(true)

      if (secureOrderBackendEnabled) {
        if (method !== 'cash-on-delivery') {
          throw new Error('O backend seguro aceita somente pagamento na entrega nesta etapa.')
        }

        const pedido = await createSecureOrder({
          items: backendItems,
          paymentMethod: 'cash-on-delivery',
        })

        setDeliveryFee(Number(pedido.deliveryFee || 0))
        setServerQuote(pedido)
        limpar()
        navigate('/acompanhamento', { state: { pedidoId: pedido.id }, replace: true })
        return
      }

      const currentDeliveryFee = await calculateDeliveryFee(usuario.bairro, total)
      const currentFinalTotal = total + currentDeliveryFee
      setDeliveryFee(currentDeliveryFee)

      const pagamento = method === 'cash-on-delivery'
        ? { metodo: 'Pagamento na entrega', referencia: `entrega-${Date.now()}`, status: 'pending_delivery' }
        : { metodo: 'Cartão (demonstração)', referencia: `demo-${Date.now()}`, status: 'demo_approved' }

      const pedido = await createOrder({
        userId: usuario.uid,
        subtotal: total,
        deliveryFee: currentDeliveryFee,
        total: currentFinalTotal,
        itens: lista.map((item) => ({
          id: item.produto.id,
          nome: item.produto.nome,
          quantidade: item.quantidade,
          precoUnitario: precoUnitario(item),
          personalizacao: item.personalizacao,
        })),
        cliente: {
          nome: usuario.nome,
          email: usuario.email,
          telefone: usuario.telefone,
        },
        entrega: {
          endereco: usuario.endereco,
          numero: usuario.numero,
          bairro: usuario.bairro,
          complemento: usuario.complemento,
        },
        pagamento,
      })

      setForm({ numero: '', validade: '', cvv: '', nome: '' })
      limpar()
      navigate('/acompanhamento', { state: { pedidoId: pedido.id }, replace: true })
    } catch (error) {
      setErro(error.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AppScreen>
      <TopBar titulo="Pagamento" perfil />
      <div className="page-heading">
        <span className="eyebrow">FINALIZAR PEDIDO</span>
        <h1>Pagamento seguro</h1>
        <p>{secureOrderBackendEnabled
          ? 'Preço, estoque e entrega são conferidos novamente pelo servidor antes de criar o pedido.'
          : cardDemoEnabled
            ? 'O cartão online está em modo de demonstração. Dados sensíveis não são salvos.'
            : 'Nesta versão pública, o pagamento é feito na entrega. O cartão online só será liberado após integração com um gateway seguro.'}</p>
      </div>
      <form className="light-card payment-card" onSubmit={confirmar}>
        <div className="payment-methods" role="radiogroup" aria-label="Forma de pagamento">
          {cardDemoEnabled ? (
            <label className={method === 'card-demo' ? 'is-selected' : ''}>
              <input type="radio" name="payment-method" value="card-demo" checked={method === 'card-demo'} onChange={(e) => setMethod(e.target.value)} />
              <span>💳 Cartão online</span><small>Demonstração</small>
            </label>
          ) : null}
          <label className={method === 'cash-on-delivery' ? 'is-selected' : ''}>
            <input type="radio" name="payment-method" value="cash-on-delivery" checked={method === 'cash-on-delivery'} onChange={(e) => setMethod(e.target.value)} />
            <span>🏍️ Pagar na entrega</span><small>Máquina/dinheiro</small>
          </label>
        </div>

        <div className="payment-total payment-total--stacked">
          <div><span>Subtotal</span><strong>{formatarMoeda(displaySubtotal)}</strong></div>
          <div><span>Entrega</span><strong>{loadingFee ? 'Calculando...' : displayDeliveryFee === null ? '—' : displayDeliveryFee ? formatarMoeda(displayDeliveryFee) : 'Grátis'}</strong></div>
          <div className="payment-grand-total"><span>Total</span><strong>{formatarMoeda(finalTotal)}</strong></div>
        </div>
        {secureOrderBackendEnabled && serverQuote ? <p className="privacy-badge">Valores confirmados pelo servidor • BRL</p> : null}
        {feeError ? <p className="form-error dark-error" role="alert">{feeError}</p> : null}

        {method === 'card-demo' && cardDemoEnabled ? (
          <>
            <div className="payment-title">
              <div><span>💳</span><strong>Cartão de crédito</strong></div>
              <div className="card-brands"><span>VISA</span><span>mastercard</span></div>
            </div>
            <div className="privacy-badge">Pagamento demonstrativo. Número do cartão e CVV ficam somente na memória desta tela e não são salvos.</div>
            <label>Número do cartão</label>
            <input inputMode="numeric" autoComplete="cc-number" value={form.numero} onChange={(e) => setForm({ ...form, numero: formatarNumeroCartao(e.target.value) })} placeholder="0000 0000 0000 0000" />
            <div className="payment-grid">
              <div>
                <label>Validade</label>
                <input autoComplete="cc-exp" value={form.validade} onChange={(e) => setForm({ ...form, validade: formatarValidade(e.target.value) })} placeholder="MM/AA" />
              </div>
              <div>
                <label>CVV</label>
                <input inputMode="numeric" autoComplete="cc-csc" value={form.cvv} onChange={(e) => setForm({ ...form, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="000" />
              </div>
            </div>
            <label>Nome no cartão</label>
            <input autoComplete="cc-name" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Seu nome" />
          </>
        ) : (
          <div className="privacy-badge">O pedido será preparado normalmente e a empresa verá que o pagamento deve ser cobrado no momento da entrega.</div>
        )}

        {usuario && (
          <div className="delivery-summary light-summary">
            <strong>Entrega:</strong>
            <span>{usuario.endereco}, {usuario.numero} • {usuario.bairro}</span>
          </div>
        )}
        {erro && <p className="form-error dark-error" role="alert">{erro}</p>}
        <button className="btn btn-primary" disabled={enviando || loadingFee || displayDeliveryFee === null || Boolean(feeError) || (secureOrderBackendEnabled && !serverQuote)} type="submit">{enviando ? 'Confirmando...' : 'Confirmar pedido'}</button>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/pedido')}>Voltar</button>
      </form>
    </AppScreen>
  )
}
