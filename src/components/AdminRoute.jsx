import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'

export default function AdminRoute({ children }) {
  const { autenticado, loading, usuario } = useUser()

  if (loading) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando área da empresa...</div></div></div>
  }

  if (!autenticado) return <Navigate to="/login" replace />

  if (usuario?.adminAccessError && !usuario?.adminCandidate) {
    return (
      <div className="app-shell">
        <div className="app-screen centered-screen">
          <section className="light-card login-card" style={{ width: 'min(100%, 460px)' }} role="alert">
            <span className="eyebrow">ÁREA DA EMPRESA</span>
            <h2>Não foi possível confirmar seu acesso</h2>
            <p>{usuario.adminAccessError}</p>
            <p className="privacy-badge">Seu perfil não foi rebaixado. O PratoPronto apenas não conseguiu consultar a autorização administrativa neste momento.</p>
            <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
          </section>
        </div>
      </div>
    )
  }

  if (!usuario?.adminCandidate) return <Navigate to="/pizzas" replace />
  if (!usuario?.emailVerified) return <Navigate to="/verificar-email" replace />
  if (!usuario?.admin) return <Navigate to="/pizzas" replace />

  return children
}
