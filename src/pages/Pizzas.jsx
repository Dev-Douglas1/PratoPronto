import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import CatalogResults from '../components/CatalogResults.jsx'
import BottomActions from '../components/BottomActions.jsx'
import BottomNav from '../components/BottomNav.jsx'
import useCatalog from '../hooks/useCatalog.js'
import { isMainDish, matchesProductSearch } from '../shared/catalog-category.js'

export default function Pizzas() {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [somenteOfertas, setSomenteOfertas] = useState(false)
  const { catalog, companyCount, loading, error, confirmed, retry } = useCatalog()

  const filtradas = useMemo(
    () => catalog.filter(produto =>
      isMainDish(produto)
      && matchesProductSearch(produto, busca)
      && (!somenteOfertas || (confirmed && produto.ofertaAtiva)),
    ),
    [busca, catalog, somenteOfertas, confirmed],
  )

  return (
    <AppScreen className="screen-with-nav menu-screen">
      <TopBar titulo="PratoPronto" voltar={false} carrinho perfil />
      <main className="catalog-surface" aria-labelledby="catalog-title">
        <div className="catalog-heading">
          <small>Cardápios das lojas parceiras</small>
          <h1 id="catalog-title">O que vai pedir hoje?</h1>
          <p>Explore pratos preparados pelas lojas disponíveis na sua região.</p>
        </div>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={busca} onChange={event => setBusca(event.target.value)}
            placeholder="Buscar prato ou estabelecimento..." aria-label="Buscar pratos e estabelecimentos" />
        </label>
        <nav className="category-tabs" aria-label="Categorias do cardápio">
          <button className="is-active" type="button" aria-current="page">🍽️ Pratos</button>
          <button type="button" onClick={() => navigate('/bebidas')}>🥤 Bebidas</button>
          <button type="button" onClick={() => navigate('/sobremesas')}>🍰 Sobremesas</button>
        </nav>
        <button className="offer-filter" type="button" disabled={!confirmed || loading}
          aria-pressed={somenteOfertas} onClick={() => setSomenteOfertas(value => !value)}>
          {somenteOfertas ? '✓ Mostrando ofertas · ver todos' : 'Ver produtos em oferta'}
        </button>
        <div className="section-heading">
          <h2>Pratos disponíveis</h2>
          <span>{loading ? 'Carregando…' : filtradas.length + ' opções'}</span>
        </div>
        <p className="catalog-partner-count" aria-live="polite">
          {companyCount > 0 ? companyCount + (companyCount === 1 ? ' loja parceira' : ' lojas parceiras') : ''}
        </p>
        <CatalogResults produtos={filtradas} loading={loading} error={error} retry={retry} confirmed={confirmed} />
        <BottomActions>
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/bebidas')}>Ver bebidas</button>
          <button className="btn btn-primary" type="button" onClick={() => navigate('/carrinho')}>Ver pedido</button>
        </BottomActions>
      </main>
      <BottomNav />
    </AppScreen>
  )
}
