import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'

export default function AdminRoute({ children }) {
  const { autenticado, loading, usuario } = useUser()

  if (loading) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando área da empresa...</div></div></div>
  }

  if (!autenticado) return <Navigate to="/login" replace />
  if (!usuario?.admin) return <Navigate to="/pizzas" replace />
  return children
}
