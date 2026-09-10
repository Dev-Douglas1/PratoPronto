import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import { useUser } from '../context/UserContext.jsx'

export default function VerificarEmail() {
  const navigate = useNavigate()
  const {
    autenticado,
    loading,
    usuario,
    reenviarVerificacao,
    atualizarSessao,
    sair,
  } = useUser()
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [processando, setProcessando] = useState(false)

  if (loading) {
    return <div className="app-shell"><div className="app-screen"><div className="light-card">Carregando...</div></div></div>
  }

  if (!autenticado) return <Navigate to="/login" replace />
  if (usuario?.emailVerified) {
    return <Navigate to={usuario?.adminCandidate ? '/empresa' : '/pizzas'} replace />
  }

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

  async function confirmar() {
    try {
      setErro('')
      setMensagem('')
      setProcessando(true)
      const conta = await atualizarSessao()
      if (!conta?.emailVerified) {
        setErro('O Firebase ainda não confirmou seu e-mail. Abra o link recebido e tente novamente.')
        return
      }
      navigate(conta?.adminCandidate ? '/empresa' : '/pizzas', { replace: true })
    } catch (error) {
      setErro(error.message)
    } finally {
      setProcessando(false)
    }
  }

  async function trocarConta() {
    await sair()
    navigate('/login', { replace: true })
  }

  return (
    <AppScreen className="centered-screen">
      <div className="login-wrapper">
        <BrandMark compact />
        <section className="login-card" aria-labelledby="verify-email-title">
          <span className="eyebrow">PROTEÇÃO DA CONTA</span>
          <h2 id="verify-email-title">Verifique seu e-mail</h2>
          <p>
            Enviamos um link de confirmação para <strong>{usuario?.email}</strong>. O cardápio, pedidos e dados da conta ficam bloqueados até a confirmação.
          </p>
          <p className="privacy-badge">Depois de clicar no link recebido, volte aqui e confirme a verificação.</p>

          {mensagem && <p className="form-success" role="status">{mensagem}</p>}
          {erro && <p className="form-error" role="alert">{erro}</p>}

          <button className="btn btn-primary" type="button" disabled={processando} onClick={confirmar}>
            {processando ? 'Verificando...' : 'Já verifiquei meu e-mail'}
          </button>
          <button className="btn btn-secondary" type="button" disabled={processando} onClick={reenviar}>
            Reenviar e-mail de verificação
          </button>
          <button className="text-action" type="button" disabled={processando} onClick={trocarConta}>
            Sair e usar outra conta
          </button>
        </section>
      </div>
    </AppScreen>
  )
}
