import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'

export default function AdminRoute({ children }) {
  const { autenticado, loading, usuario, reenviarVerificacao, atualizarSessao } = useUser()
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [processando, setProcessando] = useState(false)

  if (loading) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando área da empresa...</div></div></div>
  }

  if (!autenticado) return <Navigate to="/login" replace />
  if (!usuario?.adminCandidate) return <Navigate to="/pizzas" replace />

  if (!usuario?.emailVerified) {
    async function reenviar() {
      try {
        setErro('')
        setMensagem('')
        setProcessando(true)
        await reenviarVerificacao()
        setMensagem('E-mail de verificação reenviado. Confira a caixa de entrada e o spam.')
      } catch (error) {
        setErro(error.message)
      } finally {
        setProcessando(false)
      }
    }

    async function confirmarVerificacao() {
      try {
        setErro('')
        setMensagem('')
        setProcessando(true)
        const conta = await atualizarSessao()
        if (!conta?.emailVerified) {
          setErro('O Firebase ainda não confirmou a verificação. Abra o link enviado ao seu e-mail e tente novamente.')
        }
      } catch (error) {
        setErro(error.message)
      } finally {
        setProcessando(false)
      }
    }

    return (
      <div className="app-shell">
        <div className="app-screen centered-screen">
          <div className="light-card login-card" style={{ width: 'min(100%, 420px)' }}>
            <span className="eyebrow">ÁREA DA EMPRESA</span>
            <h2>Confirme o e-mail administrativo</h2>
            <p>A área empresarial continua ativa. Para proteger pedidos e dados dos clientes, confirme este e-mail antes de liberar o painel.</p>
            <p><strong>{usuario.email}</strong></p>
            {mensagem && <p className="success-note" role="status">{mensagem}</p>}
            {erro && <p className="form-error dark-error" role="alert">{erro}</p>}
            <button className="btn btn-primary" type="button" disabled={processando} onClick={confirmarVerificacao}>Já verifiquei meu e-mail</button>
            <button className="btn btn-secondary" type="button" disabled={processando} onClick={reenviar}>Reenviar e-mail de verificação</button>
          </div>
        </div>
      </div>
    )
  }

  if (!usuario?.admin) return <Navigate to="/pizzas" replace />
  return children
}
