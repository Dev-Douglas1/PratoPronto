import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'

export default function AdminRoute({ children }) {
  const { usuario, loading } = useUser()

  if (loading) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando...</div></div></div>
  }

  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.emailVerificado !== true) return <Navigate to="/verificar-email" replace />
  if (!usuario.admin) return <div className="app-shell"><div className="app-screen"><div className="light-card"><h1>Acesso da empresa</h1><p>Esta conta ainda não tem permissão para gerenciar o restaurante. O responsável precisa autorizar seu usuário.</p><a className="btn btn-primary" href="/pizzas">Voltar ao cardápio</a></div></div></div>
  return children
}
