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

  useEffect(() => subscribeCompany(companyId, setCompany, err => setError(err.message || 'Esta empresa não está disponível.')), [companyId])
  useEffect(() => subscribeCompanyProducts(companyId, setProducts, err => setError(err.message || 'Não foi possível carregar o cardápio.')), [companyId])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return products
      .filter(item => item.disponivel !== false)
      .filter(item => !needle || [item.nome, item.descricao, item.categoria].some(value => String(value || '').toLowerCase().includes(needle)))
      .map(item => ({ ...item, companyId, imagem: item.imagem || '/icons/app-icon.svg' }))
  }, [products, search, companyId])

  if (companyId === DEFAULT_COMPANY_ID) return <Navigate to="/pratos" replace />

  return <AppScreen className="menu-screen marketplace-store">
    <TopBar titulo={company?.name || store?.name || 'Empresa'} carrinho />
    <section className="catalog-surface">
      <section className="public-store-profile">
        <div className="public-store-cover" style={store?.coverUrl ? { backgroundImage: 'linear-gradient(90deg,rgba(24,21,18,.72),rgba(24,21,18,.12)),url("' + store.coverUrl + '")' } : undefined}>
          <span className={'public-store-status ' + (store?.open ? 'is-open' : 'is-closed')}>{store?.open ? 'Aberta agora' : 'Fechada'}</span>
        </div>
        <div className="public-store-identity">
          <img className="public-store-logo" src={store?.logoUrl || company?.logoUrl || '/icons/app-icon.svg'} alt={'Logo de ' + (company?.name || store?.name || 'empresa')} onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/icons/app-icon.svg' }} />
          <div className="public-store-title"><small>{store?.category || company?.category || 'Restaurante'}</small><h1>{store?.name || company?.name || 'Carregando empresa…'}</h1><p>{store?.description || company?.description || 'Conheça nosso cardápio e faça seu pedido.'}</p></div>
        </div>
        <div className="public-store-meta">
          {store?.address && <span>{[store.address.endereco,store.address.numero,store.address.bairro,store.address.cidade,store.address.uf].filter(Boolean).join(' · ')}</span>}
          {store?.estimateMinutes && <span>Entrega estimada: {store.estimateMinutes} min</span>}
          {(store?.whatsapp || company?.whatsapp) && <a href={'https://wa.me/' + String(store?.whatsapp || company.whatsapp).replace(/\D/g,'')} target="_blank" rel="noreferrer">WhatsApp</a>}
          {(store?.instagram || company?.instagram) && <a href={'https://instagram.com/' + String(store?.instagram || company.instagram).replace(/^@/,'')} target="_blank" rel="noreferrer">Instagram</a>}
        </div>
      </section>
      <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar prato nesta empresa..." /></label>
      {(error || storeError) && <p className="form-error" role="alert">{error || storeError}</p>}
      {!storeLoading && store && <div className="light-card"><strong>{store.name}</strong>{store.address && <p>{store.address.endereco}, {store.address.numero} · {store.address.bairro} · {store.address.cidade}/{store.address.uf}</p>}<small>Previsão informada: {store.estimateMinutes || '—'} min</small></div>}
      {company?.active === false && <p className="catalog-notice">Esta empresa está pausada e não recebe pedidos agora.</p>}
      <ProductGrid produtos={filtered} readOnly={!store?.open || company?.active === false} />
      <BottomActions>
        <Link className="btn btn-secondary" to="/">Buscar outra empresa</Link>
        <Link className="btn btn-primary" to="/carrinho">Ver carrinho</Link>
      </BottomActions>
    </section>
  </AppScreen>
}
