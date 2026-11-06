import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import AddressSelector from '../components/AddressSelector.jsx'
import AddressModal from '../components/AddressModal.jsx'
import StoreFeed from '../components/StoreFeed.jsx'

import useNearbyStores from '../hooks/useNearbyStores.js'
import useAuth from '../hooks/useAuth.js'
import { useCompany } from '../context/CompanyContext.jsx'

import { searchMarketplace } from '../services/marketplace.js'
import { formatarMoeda as money } from '../utils/moeda.js'

import '../styles/home.css'

function readSavedAddress() {
  try {
    const saved = localStorage.getItem('pratopronto_endereco')
    const address = saved ? JSON.parse(saved) : null
    return address && typeof address === 'object' && !Array.isArray(address)
      ? address
      : null
  } catch {
    return null
  }
}

function storePath(companyId) {
  return companyId ? `/loja/${encodeURIComponent(companyId)}` : null
}

export default function Home() {
  const { user, autenticado, usuario } = useAuth()
  const { staffCompanies = [], pilotProfile } = useCompany()

  const [enderecoAtivo, setEnderecoAtivo] = useState(readSavedAddress)
  const [modalEnderecoAberto, setModalEnderecoAberto] = useState(false)
  const { empresas, loading: loadingStores, erro: errorStores, recarregar } =
    useNearbyStores(enderecoAtivo)

  const [search, setSearch] = useState('')
  const [results, setResults] = useState({ companies: [], products: [] })
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [errorSearch, setErrorSearch] = useState('')

  useEffect(() => {
    const term = search.trim()
    if (term.length < 2) {
      setResults({ companies: [], products: [] })
      setErrorSearch('')
      setLoadingSearch(false)
      return undefined
    }

    let active = true
    const timer = setTimeout(async () => {
      setLoadingSearch(true)
      setErrorSearch('')
      try {
        const value = await searchMarketplace(term)
        if (active) {
          setResults({
            companies: Array.isArray(value?.companies) ? value.companies : [],
            products: Array.isArray(value?.products) ? value.products : [],
          })
        }
      } catch {
        if (active) {
          setResults({ companies: [], products: [] })
          setErrorSearch('Não foi possível pesquisar empresas agora.')
        }
      } finally {
        if (active) setLoadingSearch(false)
      }
    }, 300)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [search])

  function selecionarEndereco(endereco) {
    setEnderecoAtivo(endereco)
    try {
      localStorage.setItem('pratopronto_endereco', JSON.stringify(endereco))
    } catch {
      // A seleção continua válida durante a sessão atual.
    }
    setModalEnderecoAberto(false)
  }

  const mostrandoResultados = search.trim().length >= 2

  return (
    <AppScreen className="home-screen">
      <header className="home-status" aria-label="Endereço de entrega">
        {Boolean(user || enderecoAtivo) && (
          <AddressSelector
            enderecoAtual={enderecoAtivo}
            onClick={() => setModalEnderecoAberto(true)}
          />
        )}
      </header>

      <main className="home-main">
        <section className="home-hero" aria-labelledby="home-title">
          <BrandMark />
          <p className="eyebrow">ENCONTRE A SUA PRÓXIMA REFEIÇÃO</p>
          <h1 id="home-title">
            Empresas perto de si.
            <br />
            <em>Pedido pronto.</em>
          </h1>
          <p className="home-description">
            Pesquise pelo nome da empresa ou pelo prato. Cada loja administra
            o seu próprio cardápio, equipa e entregas.
          </p>

          <form
            className="search-box marketplace-search"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar empresa ou prato..."
              aria-label="Buscar empresas ou pratos"
              autoComplete="off"
            />
          </form>

          {loadingSearch && <p className="light-card home-search-status" role="status">A pesquisar…</p>}
          {errorSearch && <p className="form-error" role="alert">{errorSearch}</p>}

          {mostrandoResultados && !loadingSearch && !errorSearch && (
            <section className="marketplace-results" aria-label="Resultados da pesquisa" aria-live="polite">
              <section className="home-result-section" aria-labelledby="home-companies-title">
                <div className="section-heading">
                  <h2 id="home-companies-title">Empresas</h2>
                  <span>{results.companies.length}</span>
                </div>
                <div className="marketplace-company-grid">
                  {results.companies.map((company) => {
                    const destination = storePath(company.id)
                    return destination ? (
                      <Link className="light-card marketplace-company-card" key={company.id} to={destination}>
                        <strong>{company.name || 'Empresa'}</strong>
                        <small>Ver cardápio →</small>
                      </Link>
                    ) : null
                  })}
                  {!results.companies.length && <p className="muted">Nenhuma empresa com esse nome.</p>}
                </div>
              </section>

              <section className="home-result-section" aria-labelledby="home-products-title">
                <div className="section-heading">
                  <h2 id="home-products-title">Pratos</h2>
                  <span>{results.products.length}</span>
                </div>
                <div className="marketplace-product-list">
                  {results.products.slice(0, 30).map((product) => {
                    const destination = storePath(product.companyId)
                    const price = product.preco
                    const numericPrice = price !== null && price !== undefined && price !== ''
                      ? Number(price)
                      : null
                    const priceLabel = numericPrice !== null && Number.isFinite(numericPrice)
                      ? money(numericPrice)
                      : 'Preço na loja'
                    const content = (
                      <>
                        <span className="marketplace-product-image" aria-hidden="true">
                          {product.imagem
                            ? <img src={product.imagem} alt="" width="56" height="56" loading="lazy" />
                            : '🍽️'}
                        </span>
                        <span className="marketplace-product-copy">
                          <strong>{product.nome || 'Produto'}</strong>
                          <small>
                            {product.companyName || 'Empresa'} · {product.categoria || 'Prato'} · {priceLabel}
                          </small>
                        </span>
                      </>
                    )
                    return destination ? (
                      <Link className="light-card marketplace-product-result" key={`${product.companyId}:${product.id}`} to={destination}>
                        {content}
                      </Link>
                    ) : (
                      <article className="light-card marketplace-product-result" key={product.id}>
                        {content}
                      </article>
                    )
                  })}
                  {!results.products.length && <p className="muted">Nenhum prato encontrado.</p>}
                </div>
              </section>
            </section>
          )}

          {!mostrandoResultados && (
            <section className="home-store-section" aria-label="Empresas disponíveis">
              <StoreFeed
                empresas={empresas}
                loading={loadingStores}
                erro={errorStores}
                onRecarregar={recarregar}
              />
            </section>
          )}

          <nav className="home-actions" aria-label="Ações principais">
            <Link className="btn btn-primary" to={autenticado ? '/pratos' : '/login'}>
              {autenticado ? 'Abrir PratoPronto' : 'Entrar e pedir'}
              <span aria-hidden="true">→</span>
            </Link>
            {!autenticado && <Link className="btn btn-outline" to="/cadastro">Criar a minha conta</Link>}
            {autenticado && <Link className="btn btn-outline" to="/empresa/nova">Cadastrar uma empresa</Link>}
            {staffCompanies.length > 0 && <Link className="btn btn-outline" to="/empresa/pedidos">Área da empresa</Link>}
            {autenticado && pilotProfile && <Link className="btn btn-outline" to="/piloto">Área Piloto Parceiro</Link>}
          </nav>

          <section className="service-highlights" aria-label="Vantagens do PratoPronto">
            <article className="service-highlight-card">
              <span className="service-highlight-icon" aria-hidden="true">🏪</span>
              <span className="service-highlight-copy">
                <strong>Várias empresas</strong>
                <small>Cardápios e equipas separados</small>
              </span>
            </article>
            <article className="service-highlight-card">
              <span className="service-highlight-icon" aria-hidden="true">🛵</span>
              <span className="service-highlight-copy">
                <strong>Piloto Parceiro</strong>
                <small>Entrega confirmada por código</small>
              </span>
            </article>
          </section>
        </section>
      </main>

      <footer className="home-footer">
        <nav className="legal-links centered-links" aria-label="Informações legais">
          <Link to="/politica-de-privacidade">Política de Privacidade</Link>
          <Link to="/termos-de-uso">Termos de Uso</Link>
        </nav>
      </footer>

      <AddressModal
        isOpen={modalEnderecoAberto}
        onClose={() => setModalEnderecoAberto(false)}
        usuarioId={usuario?.uid || usuario?.id}
        onSelectAddress={selecionarEndereco}
      />
    </AppScreen>
  )
}
