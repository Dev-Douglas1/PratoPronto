import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'

export default function PilotRoute({ children }) {
  const { usuario, loading: userLoading } = useUser()
  const { pilotProfile, loading: companyLoading } = useCompany()

  if (userLoading || companyLoading) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando...</div></div></div>
  }
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.emailVerificado !== true) return <Navigate to="/verificar-email" replace />
  if (!pilotProfile) return <Navigate to="/perfil" replace />
  return children
}
