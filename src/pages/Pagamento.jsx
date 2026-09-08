import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatarMoeda } from '../utils/moeda.js'
import { formatarNumeroCartao, formatarValidade } from '../utils/cartao.js'
import { useUser } from '../context/UserContext.jsx'
import { createOrder } from '../services/storage.js'

export default function Pagamento() {
  const navigate = useNavigate()
  const location = useLocation()
  const { lista, total, limpar, precoUnitario } = useCart()
  const { usuario } = useUser()
  const deliveryFee = Math.max(0, Number(location.state?.deliveryFee || 0))
  const finalTotal = total + deliveryFee
  const [method, setMethod] = useState('card-demo')
  const [form, setForm] = useState({ numero: '', validade: '', cvv: '', nome: '' })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function confirmar(event) {
    event.preventDefault()
    setErro('')

    if (!usuario) {
      setErro('Faça login para finalizar o pedido.')
      return
    }
    if (!lista.length) {
      setErro('Seu carrinho está vazio.')
      return
    }
    if (method === 'card-demo' && (form.numero.replace(/\D/g, '').length < 13 || !form.validade || form.cvv.length < 3 || !form.nome.trim())) {
      setErro('Preencha corretamente os dados do cartão.')
      return
    }

    try {
      setEnviando(true)
      const pagamento = method === 'cash-on-delivery'
        ? { metodo: 'Pagamento na entrega', referencia: `entrega-${Date.now()}`, status: 'pending_delivery' }
        : { metodo: 'Cartão (demonstração)', referencia: `demo-${Date.now()}`, status: 'demo_approved' }

      const pedido = await createOrder({
        userId: usuario.uid,
        subtotal: total,
        deliveryFee,
        total: finalTotal,
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
        <p>O cartão online ainda está em modo de demonstração. Dados sensíveis não são salvos.</p>
      </div>
      <form className="light-card payment-card" onSubmit={confirmar}>
        <div className="payment-methods" role="radiogroup" aria-label="Forma de pagamento">
          <label className={method === 'card-demo' ? 'is-selected' : ''}>
            <input type="radio" name="payment-method" value="card-demo" checked={method === 'card-demo'} onChange={(e) => setMethod(e.target.value)} />
            <span>💳 Cartão online</span><small>Demonstração</small>
          </label>
          <label className={method === 'cash-on-delivery' ? 'is-selected' : ''}>
            <input type="radio" name="payment-method" value="cash-on-delivery" checked={method === 'cash-on-delivery'} onChange={(e) => setMethod(e.target.value)} />
            <span>🏍️ Pagar na entrega</span><small>Máquina/dinheiro</small>
          </label>
        </div>

        <div className="payment-total payment-total--stacked">
          <div><span>Subtotal</span><strong>{formatarMoeda(total)}</strong></div>
          <div><span>Entrega</span><strong>{deliveryFee ? formatarMoeda(deliveryFee) : 'Grátis'}</strong></div>
          <div className="payment-grand-total"><span>Total</span><strong>{formatarMoeda(finalTotal)}</strong></div>
        </div>

        {method === 'card-demo' ? (
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
        <button className="btn btn-primary" disabled={enviando} type="submit">{enviando ? 'Confirmando...' : 'Confirmar pedido'}</button>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/pedido')}>Voltar</button>
      </form>
    </AppScreen>
  )
}
