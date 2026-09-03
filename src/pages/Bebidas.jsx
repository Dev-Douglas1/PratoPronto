import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import ProductGrid from '../components/ProductGrid.jsx'
import BottomActions from '../components/BottomActions.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { bebidas } from '../data/produtos.js'

export default function Bebidas() {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const filtradas = useMemo(
    () => bebidas.filter((bebida) => bebida.nome.toLowerCase().includes(busca.toLowerCase())),
    [busca],
  )

  return (
    <AppScreen className="screen-with-nav">
      <TopBar titulo="PratoPronto" carrinho />
      <div className="catalog-heading">
        <small>Geladas e prontas para acompanhar</small>
        <h1>Escolha sua bebida</h1>
      </div>
      <label className="search-box">
        <span aria-hidden="true">⌕</span>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar bebida..." />
      </label>
      <div className="category-tabs" role="tablist" aria-label="Categorias">
        <button role="tab" aria-selected="false" onClick={() => navigate('/pizzas')}>🍕 Pizzas</button>
        <button className="is-active" role="tab" aria-selected="true">🥤 Bebidas</button>
      </div>
      <div className="section-heading"><h2>Bebidas</h2><span>{filtradas.length} opções</span></div>
      <ProductGrid produtos={filtradas} />
      <BottomActions>
        <button className="btn btn-secondary" onClick={() => navigate('/pizzas')}>Ver pizzas</button>
        <button className="btn btn-primary" onClick={() => navigate('/pedido')}>Ver pedido</button>
      </BottomActions>
      <button className="btn ghost-button wide-button" onClick={() => navigate('/perfil')}>Meu perfil</button>
      <BottomNav />
    </AppScreen>
  )
}
