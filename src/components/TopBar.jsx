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

      <div className="title-pill">
        <span className="mini-brand" aria-hidden="true" />
        <span>{titulo}</span>
      </div>

      {carrinho ? (
        <button
          className="icon-button cart-button"
          onClick={() => navigate('/pedido')}
          aria-label="Abrir pedido"
        >
          <span aria-hidden="true">🛒</span>
          {quantidadeTotal > 0 && <span className="cart-count">{quantidadeTotal}</span>}
        </button>
      ) : perfil ? (
        <button className="icon-button" onClick={() => navigate('/perfil')} aria-label="Abrir perfil">
          <span className="profile-icon" aria-hidden="true" />
        </button>
      ) : (
        <span />
      )}
    </header>
  )
}
