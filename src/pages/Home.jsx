import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'
import InstallApp from '../components/InstallApp.jsx'
import { searchMarketplace } from '../services/marketplace.js'
import { formatarMoeda as money } from '../utils/moeda.js'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'

export default function Home() {
  const { autenticado } = useUser()
  const { staffCompanies, pilotProfile } = useCompany()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState({ companies: [], products: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const term = search.trim()
    if (term.length < 2) { setResults({ companies: [], products: [] }); setError(''); return }
    let live = true
    const timer = setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const value = await searchMarketplace(term)
        if (live) setResults(value)
      } catch {
        if (live) setError('Não foi possível pesquisar empresas agora.')
      } finally { if (live) setLoading(false) }
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [search])

  return (
    <AppScreen className="home-screen">
      <header className="home-status">
        <span><i /> PRATOPRONTO</span>
        <small>Empresas e pedidos pelo celular</small>
      </header>

      <div className="home-hero">
        <BrandMark />
        <span className="eyebrow">ENCONTRE SUA PRÓXIMA REFEIÇÃO</span>
        <h1>Empresas perto de você.<br /><em>Pedido pronto.</em></h1>
        <p>Pesquise pelo nome da empresa ou pelo prato. Cada loja administra seu próprio cardápio, equipe e entregas.</p>

        <label className="search-box marketplace-search">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar empresa ou prato..." aria-label="Buscar empresa ou prato" />
        </label>

        {loading && <div className="light-card" role="status">Pesquisando…</div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {search.trim().length >= 2 && !loading && !error && <section className="marketplace-results" aria-label="Resultados da busca">
          <div className="section-heading"><h2>Empresas</h2><span>{results.companies.length}</span></div>
          <div className="marketplace-company-grid">
            {results.companies.map(company => <Link className="light-card marketplace-company-card" key={company.id} to={company.id === DEFAULT_COMPANY_ID ? '/pizzas' : '/loja/' + company.id}><strong>{company.name}</strong><small>Ver cardápio →</small></Link>)}
            {!results.companies.length && <p className="muted">Nenhuma empresa com esse nome.</p>}
          </div>
          <div className="section-heading"><h2>Pratos</h2><span>{results.products.length}</span></div>
          <div className="marketplace-product-list">
            {results.products.slice(0, 30).map(product => <Link className="light-card marketplace-product-result" key={(product.companyId || '') + ':' + product.id} to={product.companyId === DEFAULT_COMPANY_ID ? '/pizzas' : '/loja/' + product.companyId}>
              <span>{product.imagem ? <img src={product.imagem} alt="" width="56" height="56" loading="lazy" /> : '🍽️'}</span>
              <div><strong>{product.nome}</strong><small>{product.companyName || product.companyId} · {product.categoria || 'Prato'} · {product.preco ? money(Number(product.preco)) : 'Preço na loja'}</small></div>
            </Link>)}
            {!results.products.length && <p className="muted">Nenhum prato encontrado.</p>}
          </div>
        </section>}

        <div className="home-actions">
          <Link className="btn btn-primary" to={autenticado ? '/pizzas' : '/login'}>
            {autenticado ? 'Abrir PratoPronto' : 'Entrar e pedir'}
            <span aria-hidden="true">→</span>
          </Link>
          {!autenticado && <Link className="btn btn-outline" to="/cadastro">Criar minha conta</Link>}
          {autenticado && <Link className="btn btn-outline" to="/empresa/nova">Cadastrar uma empresa</Link>}
          {!!staffCompanies.length && <Link className="btn btn-outline" to="/empresa/pedidos">Área da empresa</Link>}
          {autenticado && <Link className="btn btn-outline" to="/piloto">{pilotProfile ? 'Área Piloto Parceiro' : 'Quero ser Piloto Parceiro'}</Link>}
          {!autenticado && <Link className="btn btn-outline" to="/demo/empresa/pedidos">Conhecer a área da empresa 2.0 →</Link>}
        </div>

        <div className="service-highlights">
          <div><strong>🏪</strong><span><b>Várias empresas</b><small>Cardápios e equipes separados</small></span></div>
          <div><strong>🛵</strong><span><b>Piloto Parceiro</b><small>Entrega confirmada por senha</small></span></div>
        </div>

        <div className="legal-links centered-links">
          <Link to="/politica-de-privacidade">Política de Privacidade</Link>
          <Link to="/termos-de-uso">Termos de Uso</Link>
        </div>
        <InstallApp />
      </div>
    </AppScreen>
  )
}
