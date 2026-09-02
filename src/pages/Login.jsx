import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import { firebaseConfigured } from '../firebase.js'

export default function Login() {
  const navigate = useNavigate()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')

  function entrar(event) {
    event.preventDefault()
    if (!usuario.trim() || !senha.trim()) {
      setErro('Preencha o usuário/e-mail e a senha.')
      return
    }
    navigate('/pizzas')
  }

  return (
    <AppScreen className="centered-screen">
      <div className="login-wrapper">
        <div className="avatar-placeholder" />
        <form className="login-card" onSubmit={entrar}>
          <h2>faça seu login</h2>
          <div className="social-row" aria-label="Login social ilustrativo">
            <span>G</span><span>f</span><span>𝕏</span>
          </div>

          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Usuário ou @email"
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

          <button className="btn btn-primary" type="submit">entrar</button>
          <Link className="text-link" to="/cadastro">Criar uma conta</Link>
          {!firebaseConfigured && (
            <small className="demo-note">Modo demonstração: Firebase ainda não configurado.</small>
          )}
        </form>
      </div>
    </AppScreen>
  )
}
