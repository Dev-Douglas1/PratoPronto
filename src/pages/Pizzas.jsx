import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import ProductGrid from '../components/ProductGrid.jsx'
import BottomActions from '../components/BottomActions.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { pizzas } from '../data/produtos.js'
import { useUser } from '../context/UserContext.jsx'

export default function Pizzas() {
  const navigate = useNavigate()
  const { usuario } = useUser()
  const [busca, setBusca] = useState('')
  const filtradas = useMemo(
    () => pizzas.filter((pizza) => pizza.nome.toLowerCase().includes(busca.toLowerCase())),
    [busca],
  )

  return (
    <AppScreen className="screen-with-nav">
      <TopBar titulo="PratoPronto" voltar={false} carrinho />
      <div className="catalog-heading">
        <small>Olá, {usuario?.nome?.split(' ')[0] || 'cliente'} 👋</small>
        <h1>O que vai pedir hoje?</h1>
      </div>
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
      <button className="btn ghost-button wide-button" onClick={() => navigate('/perfil')}>Meu perfil</button>
      <BottomNav />
    </AppScreen>
  )
}
