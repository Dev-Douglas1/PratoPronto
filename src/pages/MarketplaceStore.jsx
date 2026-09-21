import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import ProductGrid from '../components/ProductGrid.jsx'
import BottomActions from '../components/BottomActions.jsx'
import useStorefront from '../hooks/useStorefront.js'
import { subscribeCompany, subscribeCompanyProducts } from '../services/marketplace.js'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'

export default function MarketplaceStore() {
  const { companyId } = useParams()
  const [company, setCompany] = useState(null)
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const { store, loading: storeLoading, error: storeError } = useStorefront(companyId)

  if (companyId === DEFAULT_COMPANY_ID) return <Navigate to="/pizzas" replace />

  useEffect(() => subscribeCompany(companyId, setCompany, err => setError(err.message || 'Esta empresa não está disponível.')), [companyId])
  useEffect(() => subscribeCompanyProducts(companyId, setProducts, err => setError(err.message || 'Não foi possível carregar o cardápio.')), [companyId])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return products
      .filter(item => item.disponivel !== false)
      .filter(item => !needle || [item.nome, item.descricao, item.categoria].some(value => String(value || '').toLowerCase().includes(needle)))
      .map(item => ({ ...item, companyId, imagem: item.imagem || '/icons/app-icon.svg' }))
  }, [products, search, companyId])

  return <AppScreen className="menu-screen marketplace-store">
    <TopBar titulo={company?.name || store?.name || 'Empresa'} carrinho />
    <section className="catalog-surface">
      <div className="catalog-heading">
        <small>LOJA NO PRATOPRONTO</small>
        <h1>{company?.name || store?.name || 'Carregando empresa…'}</h1>
        <p>{store?.open ? 'Recebendo pedidos agora.' : 'Consulte o cardápio. Novos pedidos podem estar pausados neste momento.'}</p>
      </div>
      <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar prato nesta empresa..." /></label>
      {(error || storeError) && <p className="form-error" role="alert">{error || storeError}</p>}
      {!storeLoading && store && <div className="light-card"><strong>{store.name}</strong>{store.address && <p>{store.address.endereco}, {store.address.numero} · {store.address.bairro} · {store.address.cidade}/{store.address.uf}</p>}<small>Previsão informada: {store.estimateMinutes || '—'} min</small></div>}
      {company?.active === false && <p className="catalog-notice">Esta empresa está pausada e não recebe pedidos agora.</p>}
      <ProductGrid produtos={filtered} readOnly={!store?.open || company?.active === false} />
      <BottomActions>
        <Link className="btn btn-secondary" to="/">Buscar outra empresa</Link>
        <Link className="btn btn-primary" to="/pedido">Ver carrinho</Link>
      </BottomActions>
    </section>
  </AppScreen>
}
