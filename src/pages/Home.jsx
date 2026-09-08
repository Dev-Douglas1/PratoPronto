import { Link } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import { useUser } from '../context/UserContext.jsx'

export default function Home() {
  const { autenticado } = useUser()

  return (
    <AppScreen className="home-screen">
      <header className="home-status">
        <span><i /> ABERTO AGORA</span>
        <small>Entrega estimada: 35–50 min</small>
      </header>

      <div className="home-hero">
        <BrandMark />
        <span className="eyebrow">SUA FOME NÃO ESPERA</span>
        <h1>Pizza quente.<br /><em>Pedido pronto.</em></h1>
        <p>Escolha seus sabores, monte o pedido e acompanhe tudo pelo celular.</p>

        <div className="home-actions">
          <Link className="btn btn-primary" to={autenticado ? '/pizzas' : '/login'}>
            {autenticado ? 'Abrir cardápio' : 'Entrar e pedir'}
            <span aria-hidden="true">→</span>
          </Link>
          {!autenticado && <Link className="btn btn-outline" to="/cadastro">Criar minha conta</Link>}
        </div>

        <div className="service-highlights">
          <div><strong>🍕</strong><span><b>Feita na hora</b><small>Ingredientes selecionados</small></span></div>
          <div><strong>⚡</strong><span><b>Pedido rápido</b><small>Do forno até você</small></span></div>
        </div>

        <div className="legal-links centered-links">
          <Link to="/politica-de-privacidade">Política de Privacidade</Link>
          <Link to="/termos-de-uso">Termos de Uso</Link>
        </div>
      </div>
    </AppScreen>
  )
}
