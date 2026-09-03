import { NavLink } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'

const items = [
  { to: '/pizzas', icon: '🍕', label: 'Pizzas' },
  { to: '/bebidas', icon: '🥤', label: 'Bebidas' },
  { to: '/pedido', icon: '🛒', label: 'Pedido', cart: true },
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
