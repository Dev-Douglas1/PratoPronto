import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import { useUser } from '../context/UserContext.jsx'

export default function Login() {
  const navigate = useNavigate()
  const { entrar, firebaseConfigured } = useUser()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleEntrar(event) {
    event.preventDefault()
    setErro('')

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
      await entrar(usuario, senha)
      navigate('/pizzas')
    } catch (error) {
      setErro(error.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AppScreen className="centered-screen">
      <div className="login-wrapper">
        <div className="avatar-placeholder" />
        <form className="login-card" onSubmit={handleEntrar}>
          <h2>faça seu login</h2>
          <input
            type="email"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Seu e-mail"
            autoComplete="username"
          />
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            autoComplete="current-password"
          />
          {erro && <p className="form-error">{erro}</p>}
          <button className="btn btn-primary" type="submit" disabled={enviando}>
            {enviando ? 'entrando...' : 'entrar'}
          </button>
          <Link className="text-link" to="/cadastro">Criar uma conta</Link>
          <div className="legal-links">
            <Link to="/politica-de-privacidade">Política de Privacidade</Link>
            <Link to="/termos-de-uso">Termos de Uso</Link>
          </div>
          <small className="demo-note">Senha gerenciada pelo Firebase Authentication. O PratoPronto não salva sua senha no banco do aplicativo.</small>
        </form>
      </div>
    </AppScreen>
  )
}
