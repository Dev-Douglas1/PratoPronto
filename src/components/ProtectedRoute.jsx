import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'

export function AccessGate({ children, usuario, loading, allowUnverified = false }) {

  if (loading) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando...</div></div></div>
  }

  if (!usuario) return <Navigate to="/login" replace />
  if (!allowUnverified && usuario.emailVerificado !== true) return <Navigate to="/verificar-email" replace />
  return children
}

export default function ProtectedRoute(props) {
  const { usuario, loading } = useUser()
  return <AccessGate {...props} usuario={usuario} loading={loading} />
}
