import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'

export default function ProtectedRoute({ children }) {
  const { autenticado, loading } = useUser()

  if (loading) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando...</div></div></div>
  }

  return autenticado ? children : <Navigate to="/login" replace />
}
