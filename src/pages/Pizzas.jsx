import React from 'react'
import AppScreen from '../components/AppScreen.jsx'
import BottomNav from '../components/BottomNav.jsx'
import '../styles/home.css'

export default function Pizzas() {
  return (
    <AppScreen className="app-screen">
      {/* Top Bar da App */}
      <header className="app-topbar">
        <div className="brand-logo">
          <span className="logo-icon">🟡</span>
          <strong>PratoPronto</strong>
        </div>
      </header>

      {/* Cartão de Conteúdo Branco Principal */}
      <main className="main-content-card">
        <span className="eyebrow" style={{ color: '#888' }}>
          Olá, Douglas 👋
        </span>
        <h1 style={{ fontSize: '22px', margin: '4px 0 16px 0' }}>
          O que vai pedir hoje?
        </h1>

        {/* Input de Busca */}
        <div className="search-box">
          <input type="text" placeholder="🔍 Buscar pizza..." />
        </div>

        {/* Status de Horário */}
        <div className="subtle-status-banner">
          <strong>Fechado neste horário</strong>
          <div>/ · Previsão de 45 min</div>
        </div>

        {/* Grelha de Produtos */}
        <section className="products-grid">
          {/* Ficha da Pizza */}
          <div className="product-card">
            <span className="tag-fresh">Feita na hora</span>
            <h3>4 Queijos</h3>
          </div>
        </section>
      </main>

      {/* Menu Flutuante no Fundo */}
      <BottomNav totalCarrinho={1} />
    </AppScreen>
  )
}