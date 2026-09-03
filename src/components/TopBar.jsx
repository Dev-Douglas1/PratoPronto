import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'

export default function TopBar({ titulo, voltar = true, carrinho = false, perfil = false }) {
  const navigate = useNavigate()
  const { quantidadeTotal } = useCart()

  return (
    <header className="topbar">
      {voltar ? (
        <button className="icon-button" onClick={() => navigate(-1)} aria-label="Voltar">
          ←
        </button>
      ) : (
        <span />
      )}

      <div className="title-pill">{titulo}</div>

      {carrinho ? (
        <button
          className="icon-button cart-button"
          onClick={() => navigate('/pedido')}
          aria-label="Abrir pedido"
        >
          🛒
          {quantidadeTotal > 0 && <span className="cart-count">{quantidadeTotal}</span>}
        </button>
      ) : perfil ? (
        <button className="icon-button" onClick={() => navigate('/perfil')} aria-label="Abrir perfil">
          ☺
        </button>
      ) : (
        <span />
      )}
    </header>
  )
}
