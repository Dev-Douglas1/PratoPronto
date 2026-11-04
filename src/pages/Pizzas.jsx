import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import StoreInfo from '../components/StoreInfo.jsx'
import CatalogResults from '../components/CatalogResults.jsx'
import BottomActions from '../components/BottomActions.jsx'
import BottomNav from '../components/BottomNav.jsx'
import useCatalog from '../hooks/useCatalog.js'
import { isMainDish } from '../shared/catalog-category.js'

export default function Pizzas() {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [somenteOfertas, setSomenteOfertas] = useState(false)
  const { catalog, loading, error, confirmed, retry } = useCatalog()

  const filtradas = useMemo(
    () => catalog.filter((produto) =>
      isMainDish(produto)
      && produto.nome.toLowerCase().includes(busca.toLowerCase())
      && (!confirmed || !somenteOfertas || produto.ofertaAtiva),
    ),
    [busca, catalog, somenteOfertas, confirmed],
  )

  return (
    <AppScreen className="screen-with-nav menu-screen">
      <TopBar titulo="PratoPronto" voltar={false} carrinho perfil />
      <section className="catalog-surface" aria-labelledby="catalog-title">
        <div className="catalog-heading">
          <small>Sabores preparados pelas lojas parceiras</small>
          <h1 id="catalog-title">O que vai pedir hoje?</h1>
          <p>Encontre seu próximo prato favorito.</p>
        </div>

        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar pratos..."
            aria-label="Buscar pratos e pizzas"
          />
        </label>

        <div className="category-tabs" role="tablist" aria-label="Categorias do cardápio">
          <button className="is-active" type="button" role="tab" aria-selected="true">
            🍽️ Pratos
          </button>
          <button type="button" role="tab" aria-selected="false" onClick={() => navigate('/bebidas')}>
            🥤 Bebidas
          </button>
          <button type="button" role="tab" aria-selected="false" onClick={() => navigate('/sobremesas')}>
            🍰 Sobremesas
          </button>
        </div>

        <button
          className="offer-filter"
          type="button"
          disabled={!confirmed}
          aria-pressed={confirmed && somenteOfertas}
          onClick={() => setSomenteOfertas((value) => !value)}
        >
          {confirmed && somenteOfertas ? '✓ Mostrando ofertas · ver todos' : 'Ver produtos em oferta'}
        </button>

        <div className="section-heading">
          <h2>Pratos disponíveis</h2>
          <span>{filtradas.length} opções</span>
        </div>

        <StoreInfo />
        <CatalogResults
          produtos={filtradas}
          loading={loading}
          error={error}
          retry={retry}
          confirmed={confirmed}
        />

        <BottomActions>
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/bebidas')}>
            Ver bebidas
          </button>
          <button className="btn btn-primary" type="button" onClick={() => navigate('/carrinho')}>
            Ver pedido
          </button>
        </BottomActions>
      </section>
      <BottomNav />
    </AppScreen>
  )
}
