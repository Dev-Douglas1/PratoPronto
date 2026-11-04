import React from 'react'
import { NavLink } from 'react-router-dom'
import '../styles/home.css'

export default function BottomNav({ totalCarrinho = 1 }) {
  return (
    <nav className="bottom-nav-container" aria-label="Navegação principal">
      <div className="bottom-nav-pill">
        <NavLink
          to="/pizzas"
          className={({ isActive }) =>
            `nav-item ${isActive ? 'active' : ''}`
          }
        >
          <span className="nav-icon">🍕</span>
          <span className="nav-label">Pizzas</span>
        </NavLink>

        <NavLink
          to="/bebidas"
          className={({ isActive }) =>
            `nav-item ${isActive ? 'active' : ''}`
          }
        >
          <span className="nav-icon">🥤</span>
          <span className="nav-label">Bebidas</span>
        </NavLink>

        <NavLink
          to="/carrinho"
          className={({ isActive }) =>
            `nav-item ${isActive ? 'active' : ''}`
          }
        >
          <div className="icon-badge-wrapper">
            <span className="nav-icon">🛒</span>
            {totalCarrinho > 0 && (
              <span className="cart-badge">{totalCarrinho}</span>
            )}
          </div>
          <span className="nav-label">Carrinho</span>
        </NavLink>

        <NavLink
          to="/pedidos"
          className={({ isActive }) =>
            `nav-item ${isActive ? 'active' : ''}`
          }
        >
          <span className="nav-icon">📋</span>
          <span className="nav-label">Pedidos</span>
        </NavLink>

        <NavLink
          to="/perfil"
          className={({ isActive }) =>
            `nav-item ${isActive ? 'active' : ''}`
          }
        >
          <span className="nav-icon">👤</span>
          <span className="nav-label">Perfil</span>
        </NavLink>
      </div>
    </nav>
  )
}