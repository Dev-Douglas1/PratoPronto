import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import { useUser } from '../context/UserContext.jsx'

export default function Login() {
  const navigate = useNavigate()
  const { entrar, recuperarSenha, firebaseConfigured } = useUser()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleEntrar(event) {
    event.preventDefault()
    setErro('')
    setMensagem('')

    if (!firebaseConfigured) {
      setErro('Configure o Firebase no arquivo .env antes de usar contas reais.')
      return
    }

    if (!usuario.trim() || !senha.trim()) {
      setErro('Preencha o e-mail e a senha.')
      return
    }

    try {
      setEnviando(true)
      const conta = await entrar(usuario, senha)
      if (!conta?.emailVerified) {
        navigate('/verificar-email', { replace: true })
        return
      }
      navigate(conta?.adminCandidate ? '/empresa' : '/pizzas', { replace: true })
    } catch (error) {
      setErro(error.message)
    } finally {
      setEnviando(false)
    }
  }

  async function handleRecuperarSenha() {
    setErro('')
    setMensagem('')
    try {
      await recuperarSenha(usuario)
      setMensagem('Link de recuperação enviado. Confira sua caixa de entrada e o spam.')
    } catch (error) {
      setErro(error.message)
    }
  }

  return (
    <AppScreen className="centered-screen">
      <div className="login-wrapper">
        <BrandMark compact />
        <form className="login-card" onSubmit={handleEntrar}>
          <span className="eyebrow">BEM-VINDO DE VOLTA</span>
          <h2>Entre no PratoPronto</h2>
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            type="email"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Seu e-mail"
            autoComplete="username"
          />
          <label htmlFor="login-senha">Senha</label>
          <input
            id="login-senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            autoComplete="current-password"
          />
          <button className="text-action" type="button" onClick={handleRecuperarSenha}>Esqueci minha senha</button>
          {erro && <p className="form-error" role="alert">{erro}</p>}
          {mensagem && <p className="form-success" role="status">{mensagem}</p>}
          <button className="btn btn-primary" type="submit" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
          <p className="auth-switch">Ainda não tem uma conta? <Link to="/cadastro">Cadastre-se</Link></p>
          <div className="legal-links">
            <Link to="/politica-de-privacidade">Política de Privacidade</Link>
            <Link to="/termos-de-uso">Termos de Uso</Link>
          </div>
          <small className="demo-note">🔒 Sua senha é protegida pelo Firebase Authentication e não fica salva no banco do PratoPronto.</small>
        </form>
      </div>
    </AppScreen>
  )
}
