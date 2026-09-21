import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'

export default function PilotRoute({ children }) {
  const { usuario, loading: userLoading } = useUser()
  const { pilotCompanies, loading } = useCompany()

  if (userLoading || loading) return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando...</div></div></div>
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.emailVerificado !== true) return <Navigate to="/verificar-email" replace />
  if (!pilotCompanies.length) return <div className="app-shell"><div className="app-screen"><div className="light-card"><h1>Piloto Parceiro</h1><p>Sua conta ainda não foi adicionada como piloto por nenhuma empresa.</p><a className="btn btn-primary" href="/">Voltar ao início</a></div></div></div>
  return children
}
