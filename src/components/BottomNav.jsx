import React from 'react'
import { NavLink } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { useFavorites } from '../context/FavoritesContext.jsx'

export default function BottomNav() {
  const { quantidadeTotal = 0 } = useCart()
  const { favoriteCount = 0 } = useFavorites()
  const items = [
    { to: '/pratos', label: 'Pratos', icon: '🍽️' },
    { to: '/pesquisar', label: 'Pesquisar', icon: '⌕' },
    { to: '/favoritos', label: 'Favoritos', icon: '♡', favorites: true },
    { to: '/carrinho', label: 'Carrinho', icon: '🛒', cart: true },
    { to: '/perfil', label: 'Perfil', icon: '👤' },
  ]
  return (
    <nav className="bottom-nav-container" aria-label="Navegação principal">
      <div className="bottom-nav-pill">
        {items.map(item => (
          <NavLink key={item.to} to={item.to} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="icon-badge-wrapper">
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.cart && quantidadeTotal > 0 && <span className="cart-badge" aria-label={quantidadeTotal + ' itens no carrinho'}>{quantidadeTotal}</span>}
              {item.favorites && favoriteCount > 0 && <span className="cart-badge" aria-label={favoriteCount + ' favoritos'}>{favoriteCount}</span>}
            </span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
