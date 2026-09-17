import StoreInfo from '../components/StoreInfo.jsx'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import CatalogResults from '../components/CatalogResults.jsx'
import BottomActions from '../components/BottomActions.jsx'
import BottomNav from '../components/BottomNav.jsx'
import useCatalog from '../hooks/useCatalog.js'

export default function Bebidas() {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [somenteOfertas, setSomenteOfertas] = useState(false)
  const { catalog, loading, error, confirmed, retry } = useCatalog()
  const filtradas = useMemo(
    () => catalog.filter((bebida) => !bebida.personalizavel && bebida.nome.toLowerCase().includes(busca.toLowerCase()) && (!confirmed || !somenteOfertas || bebida.ofertaAtiva)),
    [busca, catalog, somenteOfertas, confirmed],
  )

  return (
    <AppScreen className="screen-with-nav menu-screen">
      <TopBar titulo="PratoPronto" carrinho />
      <section className="catalog-surface">
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
        <button className="offer-filter" type="button" disabled={!confirmed} aria-pressed={confirmed && somenteOfertas} onClick={() => setSomenteOfertas(value => !value)}>{confirmed && somenteOfertas ? '✓ Mostrando ofertas · ver todos' : 'Ver produtos em oferta'}</button>
        <div className="section-heading"><h2>Bebidas</h2><span>{filtradas.length} opções</span></div>
        <StoreInfo />
        <CatalogResults produtos={filtradas} loading={loading} error={error} retry={retry} confirmed={confirmed} />
        <BottomActions>
          <button className="btn btn-secondary" onClick={() => navigate('/pizzas')}>Ver pizzas</button>
          <button className="btn btn-primary" onClick={() => navigate('/pedido')}>Ver pedido</button>
        </BottomActions>
        <button className="btn ghost-button wide-button" onClick={() => navigate('/perfil')}>Meu perfil</button>
      </section>
      <BottomNav />
    </AppScreen>
  )
}
