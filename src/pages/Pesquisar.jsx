import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { searchMarketplace } from '../services/marketplace.js'

const filters = [
  { id: 'todos', label: 'Tudo' },
  { id: 'pratos', label: 'Pratos' },
  { id: 'bebidas', label: 'Bebidas' },
  { id: 'sobremesas', label: 'Sobremesas' },
]

function matchesCategory(product, filter) {
  if (filter === 'todos') return true
  const category = String(product.categoria || '').trim().toLocaleLowerCase('pt-BR')
  if (filter === 'pratos') {
    return product.personalizavel === true || /prato|refei|pizza|massa|lanche|comida/.test(category)
  }
  if (filter === 'bebidas') return /bebida|drink|suco|refrigerante/.test(category)
  return /sobremesa|dessert|doce|bolo|sorvete/.test(category)
}

export default function Pesquisar() {
  const [term, setTerm] = useState('')
  const [filter, setFilter] = useState('todos')
  const [results, setResults] = useState({ companies: [], products: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
        if (active) setResults(data)
      } catch {
        if (active) setError('Não foi possível realizar a pesquisa. Tente novamente.')
      } finally {
        if (active) setLoading(false)
      }
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [term])

  const products = useMemo(
    () => results.products.filter(product => matchesCategory(product, filter)),
    [results.products, filter],
  )
  const companies = results.companies

  return (
    <AppScreen className="screen-with-nav">
      <TopBar titulo="Pesquisar" voltar={false} />
      <main className="catalog-surface search-page">
        <div className="catalog-heading">
          <small>ENCONTRE O QUE PROCURA</small>
          <h1>Pesquisar</h1>
          <p>Busque pratos, bebidas, sobremesas ou estabelecimentos.</p>
        </div>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            autoFocus
            type="search"
            value={term}
            onChange={event => setTerm(event.target.value)}
            placeholder="Digite um produto ou loja..."
            aria-label="Pesquisar produtos e lojas"
          />
        </label>
        <div className="category-tabs search-category-tabs" role="group" aria-label="Filtrar resultados">
          {filters.map(item => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? 'is-active' : ''}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {term.trim().length < 2 ? (
          <div className="search-empty">
            <strong>O que você deseja encontrar?</strong>
            <p>Digite pelo menos 2 caracteres para pesquisar no marketplace.</p>
          </div>
        ) : loading ? (
          <p role="status" className="search-feedback">Pesquisando...</p>
        ) : error ? (
          <p className="form-error dark-error" role="alert">{error}</p>
        ) : (
          <>
            <div className="section-heading"><h2>Estabelecimentos</h2><span>{companies.length}</span></div>
            <div className="search-company-list">
              {companies.map(company => (
                <Link className="search-company-item" key={company.id} to={'/loja/' + company.id}>
                  <span className="search-result-icon">⌂</span>
                  <span><strong>{company.name}</strong><small>Ver estabelecimento e cardápio</small></span>
                  <b aria-hidden="true">›</b>
                </Link>
              ))}
              {!companies.length && <p className="search-feedback">Nenhum estabelecimento encontrado.</p>}
            </div>
            <div className="section-heading"><h2>Produtos</h2><span>{products.length}</span></div>
            <div className="search-product-list">
              {products.slice(0, 40).map(product => (
                <Link className="search-product-item" key={(product.companyId || '') + ':' + product.id} to={'/loja/' + product.companyId}>
                  {product.imagem ? <img src={product.imagem} alt="" loading="lazy"/> : <span className="search-result-icon">🍽️</span>}
                  <span className="search-product-copy">
                    <strong>{product.nome}</strong>
                    <small>{product.companyName || 'Estabelecimento'} · {product.categoria || 'Produto'}</small>
                    <b>{Number(product.preco || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b>
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
