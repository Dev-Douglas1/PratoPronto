import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'

export default function ProtectedRoute({ children }) {
  const { autenticado, loading, usuario } = useUser()

  if (loading) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando...</div></div></div>
  }

  if (!autenticado) return <Navigate to="/login" replace />
  if (!usuario?.emailVerified) return <Navigate to="/verificar-email" replace />

  return children
}
