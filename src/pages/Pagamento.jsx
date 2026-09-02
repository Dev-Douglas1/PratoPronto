import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatarMoeda } from '../utils/moeda.js'
import { formatarNumeroCartao, formatarValidade } from '../utils/cartao.js'

export default function Pagamento() {
  const navigate = useNavigate()
  const { total } = useCart()
  const [form, setForm] = useState({ numero: '', validade: '', cvv: '', nome: '' })
  const [erro, setErro] = useState('')

  function confirmar(event) {
    event.preventDefault()
    if (!form.numero || !form.validade || form.cvv.length < 3 || !form.nome.trim()) {
      setErro('Preencha corretamente os dados do cartão.')
      return
    }
    navigate('/acompanhamento')
  }

  return (
    <AppScreen>
      <TopBar titulo="Pagamento:" />
      <form className="light-card payment-card" onSubmit={confirmar}>
        <div className="card-brands"><span>VISA</span><span>Mastercard</span></div>
        <label>Total</label>
        <input value={formatarMoeda(total)} disabled />
        <label>Nº cartão</label>
        <input
          value={form.numero}
          onChange={(e) => setForm({ ...form, numero: formatarNumeroCartao(e.target.value) })}
          placeholder="0000 0000 0000 0000"
        />
        <div className="payment-grid">
          <div>
            <label>Validade</label>
            <input value={form.validade} onChange={(e) => setForm({ ...form, validade: formatarValidade(e.target.value) })} placeholder="MM/AA" />
          </div>
          <div>
            <label>CVV</label>
            <input value={form.cvv} onChange={(e) => setForm({ ...form, cvv: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="000" />
          </div>
        </div>
        <label>Nome no cartão</label>
        <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Seu nome" />
        {erro && <p className="form-error dark-error">{erro}</p>}
        <button className="btn btn-primary" type="submit">Confirmar</button>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/pedido')}>Cancelar</button>
      </form>
    </AppScreen>
  )
}
