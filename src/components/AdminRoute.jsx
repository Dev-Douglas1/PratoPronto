import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'

export default function AdminRoute({ children }) {
  const { usuario, loading: userLoading } = useUser()
  const { staffCompanies, loading, error } = useCompany()

  if (userLoading || loading) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando...</div></div></div>
  }

  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.emailVerificado !== true) return <Navigate to="/verificar-email" replace />

  if (!staffCompanies.length) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card"><h1>Acesso da empresa</h1><p>{error || 'Esta conta ainda não faz parte da equipe de nenhuma empresa.'}</p><a className="btn btn-primary" href="/">Voltar ao início</a></div></div></div>
  }

  return children
}
