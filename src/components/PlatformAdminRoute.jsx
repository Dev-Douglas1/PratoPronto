import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'

export default function PlatformAdminRoute({ children }) {
  const { usuario, loading: userLoading } = useUser()
  const { platformAdmin, loading } = useCompany()

  if (userLoading || loading) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando...</div></div></div>
  }
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.emailVerificado !== true) return <Navigate to="/verificar-email" replace />
  if (!platformAdmin) return <Navigate to="/perfil" replace />
  return children
}
