import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import ProductGrid from '../components/ProductGrid.jsx'
import BottomActions from '../components/BottomActions.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { pizzas } from '../data/produtos.js'
import { useUser } from '../context/UserContext.jsx'
import { useCatalog } from '../hooks/useCatalog.js'

export default function Pizzas() {
  const navigate = useNavigate()
  const { usuario } = useUser()
  const [busca, setBusca] = useState('')
  const catalog = useCatalog(pizzas)
  const filtradas = useMemo(
    () => catalog.filter((pizza) => pizza.nome.toLowerCase().includes(busca.toLowerCase())),
    [catalog, busca],
  )

  return (
    <AppScreen className="screen-with-nav menu-screen">
      <TopBar titulo="PratoPronto" voltar={false} carrinho />
      <section className="catalog-surface">
        <div className="catalog-heading">
          <small>Olá, {usuario?.nome?.split(' ')[0] || 'cliente'} 👋</small>
          <h1>O que vai pedir hoje?</h1>
        </div>
        {!usuario?.emailVerified ? (
          <div className="verify-banner">📧 Verifique seu e-mail para manter sua conta protegida. O link foi enviado no cadastro.</div>
        ) : null}
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pizza..." />
        </label>
        <div className="category-tabs" role="tablist" aria-label="Categorias">
          <button className="is-active" role="tab" aria-selected="true">🍕 Pizzas</button>
          <button role="tab" aria-selected="false" onClick={() => navigate('/bebidas')}>🥤 Bebidas</button>
        </div>
        <div className="section-heading"><h2>Pizzas favoritas</h2><span>{filtradas.length} opções</span></div>
        <ProductGrid produtos={filtradas} />
        <BottomActions>
          <button className="btn btn-secondary" onClick={() => navigate('/bebidas')}>Ver bebidas</button>
          <button className="btn btn-primary" onClick={() => navigate('/pedido')}>Ver pedido</button>
        </BottomActions>
        {usuario?.admin ? <button className="btn btn-primary wide-button" onClick={() => navigate('/empresa')}>Área da empresa</button> : null}
        <button className="btn ghost-button wide-button" onClick={() => navigate('/perfil')}>Meu perfil</button>
      </section>
      <BottomNav />
    </AppScreen>
  )
}
