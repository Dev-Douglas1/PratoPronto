import { NavLink } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'

const items = [
  { to: '/', icon: '⌂', label: 'Início', end: true },
  { to: '/pesquisar', icon: '⌕', label: 'Pesquisar' },
  { to: '/pedido', icon: '🛒', label: 'Carrinho', cart: true },
  { to: '/acompanhamento', icon: '▤', label: 'Pedidos' },
  { to: '/perfil', icon: '●', label: 'Perfil' },
]

export default function BottomNav() {
  const { quantidadeTotal } = useCart()

  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
        >
          <span className="bottom-nav__icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
          {item.cart && quantidadeTotal > 0 && (
            <span className="bottom-nav__count">{quantidadeTotal}</span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
