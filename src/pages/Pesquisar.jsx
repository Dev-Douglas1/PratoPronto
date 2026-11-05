import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { searchMarketplace } from '../services/marketplace.js'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'
import { isMainDish, isBeverage, isDessert } from '../shared/catalog-category.js'

const filters = [
  { id: 'todos', label: 'Tudo' },
  { id: 'pratos', label: 'Pratos' },
  { id: 'bebidas', label: 'Bebidas' },
  { id: 'sobremesas', label: 'Sobremesas' },
]

function matchesCategory(product, filter) {
  if (filter === 'todos') return true
  if (filter === 'pratos') return isMainDish(product)
  if (filter === 'bebidas') return isBeverage(product)
  return isDessert(product)
}

function storePath(companyId) {
  return companyId === DEFAULT_COMPANY_ID ? '/pratos' : '/loja/' + encodeURIComponent(companyId)
}

function productPath(product) {
  return '/produto/' + encodeURIComponent(product.companyId) + '/' + encodeURIComponent(product.id)
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Pesquisar() {
  const [term, setTerm] = useState('')
  const [filter, setFilter] = useState('todos')
  const [results, setResults] = useState({ companies: [], products: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let active = true
    const query = term.trim()
    if (query.length < 2) {
      setResults({ companies: [], products: [] })
      setLoading(false)
      setError('')
      return () => { active = false }
    }

    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const data = await searchMarketplace(query)
        if (active) setResults({ companies: data?.companies || [], products: data?.products || [] })
      } catch {
        if (active) {
          setResults({ companies: [], products: [] })
          setError('Não foi possível realizar a pesquisa. Verifique sua conexão e tente novamente.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }, 300)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [term, retryKey])

  const products = useMemo(
    () => results.products.filter(product => matchesCategory(product, filter)).slice(0, 40),
    [results.products, filter],
  )

  function clearSearch() {
    setTerm('')
    setFilter('todos')
    setResults({ companies: [], products: [] })
    setError('')
  }

  return (
    <AppScreen className="screen-with-nav">
      <TopBar titulo="Pesquisar" voltar={false} />
      <main className="catalog-surface search-page">
        <div className="catalog-heading">
          <small>ENCONTRE O QUE PROCURA</small>
          <h1>Pesquisar</h1>
          <p>Busque pratos, bebidas, sobremesas ou estabelecimentos.</p>
        </div>

        <div className="search-input-wrap">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={term} onChange={event => setTerm(event.target.value)}
              placeholder="Digite um produto ou loja..." aria-label="Pesquisar produtos e lojas"
              autoComplete="off" enterKeyHint="search" />
          </label>
          {term && <button className="search-clear" type="button" onClick={clearSearch} aria-label="Limpar pesquisa">Limpar</button>}
        </div>

        <div className="category-tabs search-category-tabs" role="group" aria-label="Filtrar resultados por categoria">
          {filters.map(item => (
            <button key={item.id} type="button" className={filter === item.id ? 'is-active' : ''}
              aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
          ))}
        </div>

        {term.trim().length < 2 ? (
          <div className="search-empty">
            <strong>O que você deseja encontrar?</strong>
            <p>Digite pelo menos 2 caracteres para pesquisar no marketplace.</p>
          </div>
        ) : loading ? (
          <p role="status" className="search-feedback">Pesquisando no PratoPronto…</p>
        ) : error ? (
          <div className="search-empty" role="alert">
            <strong>Não foi possível pesquisar</strong>
            <p>{error}</p>
            <button className="search-retry" type="button" onClick={() => setRetryKey(value => value + 1)}>Tentar novamente</button>
          </div>
        ) : (
          <>
            <p className="search-summary" aria-live="polite">
              {results.companies.length} {results.companies.length === 1 ? 'estabelecimento' : 'estabelecimentos'} · {products.length} {products.length === 1 ? 'produto' : 'produtos'}
            </p>

            <div className="section-heading"><h2>Estabelecimentos</h2><span>{results.companies.length}</span></div>
            <div className="search-company-list">
              {results.companies.map(company => (
                <Link className="search-company-item" key={company.id} to={storePath(company.id)}>
                  <span className="search-result-icon" aria-hidden="true">⌂</span>
                  <span><strong>{company.name}</strong><small>Ver estabelecimento e cardápio</small></span><b aria-hidden="true">›</b>
                </Link>
              ))}
              {!results.companies.length && <p className="search-feedback">Nenhum estabelecimento correspondente.</p>}
            </div>

            <div className="section-heading"><h2>Produtos</h2><span>{products.length}</span></div>
            <div className="search-product-list">
              {products.map(product => (
                <Link className="search-product-item" key={(product.companyId || '') + ':' + product.id} to={productPath(product)}>
                  {product.imagem
                    ? <img src={product.imagem} alt="" loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/icons/app-icon.svg' }} />
                    : <span className="search-result-icon" aria-hidden="true">🍽️</span>}
                  <span className="search-product-copy">
                    <strong>{product.nome}</strong>
                    <small>{product.companyName || 'Estabelecimento'} · {product.categoria || 'Produto'}</small>
                    <b>{money(product.preco)}</b>
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              ))}
              {!products.length && <p className="search-feedback">Nenhum produto encontrado nessa categoria.</p>}
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </AppScreen>
  )
}
