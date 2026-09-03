import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatarMoeda } from '../utils/moeda.js'
import { formatarNumeroCartao, formatarValidade } from '../utils/cartao.js'
import { useUser } from '../context/UserContext.jsx'
import { createOrder } from '../services/storage.js'

export default function Pagamento() {
  const navigate = useNavigate()
  const { lista, total, limpar } = useCart()
  const { usuario } = useUser()
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
    if (form.numero.replace(/\D/g, '').length < 13 || !form.validade || form.cvv.length < 3 || !form.nome.trim()) {
      setErro('Preencha corretamente os dados do cartão.')
      return
    }

    try {
      setEnviando(true)

      // IMPORTANTE: nesta versão o pagamento é apenas simulado.
      // Em produção, envie os dados do cartão DIRETAMENTE ao gateway de pagamento
      // (ex.: Mercado Pago/Stripe) e salve apenas o identificador/token retornado.
      // Nunca salve número completo do cartão, CVV ou senha no Firestore.
      const pedido = await createOrder({
        userId: usuario.uid,
        total,
        itens: lista.map(({ produto, quantidade }) => ({
          id: produto.id,
          nome: produto.nome,
          quantidade,
          precoUnitario: produto.preco,
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
        pagamento: {
          metodo: 'Cartão (simulado)',
          referencia: `demo-${Date.now()}`,
        },
      })

      setForm({ numero: '', validade: '', cvv: '', nome: '' })
      limpar()
      navigate('/acompanhamento', { state: { pedidoId: pedido.id } })
    } catch (error) {
      setErro(error.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AppScreen>
      <TopBar titulo="Pagamento:" perfil />
      <form className="light-card payment-card" onSubmit={confirmar}>
        <div className="card-brands"><span>VISA</span><span>Mastercard</span></div>
        <div className="privacy-badge">Pagamento demonstrativo. Número do cartão e CVV ficam somente na memória desta tela e não são salvos.</div>
        <label>Total</label>
        <input value={formatarMoeda(total)} disabled />
        <label>Nº cartão</label>
        <input
          inputMode="numeric"
          autoComplete="cc-number"
          value={form.numero}
          onChange={(e) => setForm({ ...form, numero: formatarNumeroCartao(e.target.value) })}
          placeholder="0000 0000 0000 0000"
        />
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
        {usuario && (
          <div className="delivery-summary light-summary">
            <strong>Entrega:</strong>
            <span>{usuario.endereco}, {usuario.numero} • {usuario.bairro}</span>
          </div>
        )}
        {erro && <p className="form-error dark-error">{erro}</p>}
        <button className="btn btn-primary" disabled={enviando} type="submit">{enviando ? 'Confirmando...' : 'Confirmar'}</button>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/pedido')}>Cancelar</button>
      </form>
    </AppScreen>
  )
}
