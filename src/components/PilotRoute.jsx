import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'

export default function PilotRoute({ children }) {
  const { usuario, loading } = useUser()
  if (loading) return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando...</div></div></div>
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.emailVerificado !== true) return <Navigate to="/verificar-email" replace />
  return children
}
