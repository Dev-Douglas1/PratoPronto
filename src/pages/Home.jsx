import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'

export default function Home() {
  const navigate = useNavigate()

  return (
    <AppScreen className="centered-screen">
      <div className="brand-block">
        <h1>PratoPronto</h1>
        <div className="pacman-logo" aria-label="Logo PratoPronto" />
        <button className="btn btn-primary" onClick={() => navigate('/login')}>
          Entrar
        </button>
      </div>
    </AppScreen>
  )
}
