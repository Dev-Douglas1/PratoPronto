import PasswordField from '../components/PasswordField.jsx'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import { useUser } from '../context/UserContext.jsx'
import { accountDestination } from '../utils/access.js'

export default function Login() {
  const navigate = useNavigate()
  const { entrar, supabaseConfigured } = useUser()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleEntrar(event) {
    event.preventDefault()
    setErro('')

    if (!supabaseConfigured) {
      setErro('Configure o Supabase no arquivo .env antes de usar contas reais.')
      return
    }

    if (!usuario.trim() || !senha) {
      setErro('Preencha o e-mail e a senha.')
      return
    }

    try {
      setEnviando(true)
      const conta = await entrar(usuario, senha)
      setSenha('')
      navigate(accountDestination(conta), { replace: true })
    } catch (error) {
      setErro(error.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AppScreen className="centered-screen">
      <div className="login-wrapper">
        <BrandMark compact />
        <form className="login-card" onSubmit={handleEntrar}>
          <span className="eyebrow">BEM-VINDO DE VOLTA</span>
          <h2>Entre para fazer seu pedido</h2>
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            type="email"
            maxLength={254}
            required
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Seu e-mail"
            autoComplete="username"
          />
          <label htmlFor="login-senha">Senha</label>
          <PasswordField
            id="login-senha"
            required
            maxLength={4096}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            autoComplete="current-password"
          />
          <Link className="forgot-link" to="/recuperar-senha">Esqueci minha senha</Link>
          {erro && <p className="form-error" role="alert">{erro}</p>}
          <button className="btn btn-primary" type="submit" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
          <p className="auth-switch">Ainda não tem uma conta? <Link to="/cadastro">Cadastre-se</Link></p>
          <Link className="text-link" to="/demo/empresa/pedidos">Conhecer o painel da empresa</Link>
          <div className="legal-links">
            <Link to="/politica-de-privacidade">Política de Privacidade</Link>
            <Link to="/termos-de-uso">Termos de Uso</Link>
          </div>
          <small className="demo-note">🔒 Sua senha é protegida pelo serviço de autenticação e nunca fica salva no banco do PratoPronto.</small>
        </form>
      </div>
    </AppScreen>
  )
}
