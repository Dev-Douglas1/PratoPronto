import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'

export default function Home() {
  const navigate = useNavigate()

  return (
    <AppScreen className="centered-screen">
      <div className="brand-block">
        <h1>PratoPronto</h1>
        <div className="pacman-logo" aria-label="Logo PratoPronto" />
        <p className="intro-text">Peça pizzas e bebidas com acompanhamento simples, cadastro e privacidade respeitando a LGPD.</p>
        <button className="btn btn-primary" onClick={() => navigate('/login')}>
          Entrar
        </button>
        <div className="legal-links centered-links">
          <Link to="/politica-de-privacidade">Política de Privacidade</Link>
          <Link to="/termos-de-uso">Termos de Uso</Link>
        </div>
      </div>
    </AppScreen>
  )
}
