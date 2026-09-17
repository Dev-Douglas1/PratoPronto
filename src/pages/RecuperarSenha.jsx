import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import { useUser } from '../context/UserContext.jsx'

export default function RecuperarSenha() {
  const { enviarRecuperacaoSenha, firebaseConfigured } = useUser()
  const [email, setEmail] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(event) {
    event.preventDefault()
    setErro('')
    setMensagem('')

    if (!firebaseConfigured) {
      setErro('Configure o Firebase antes de recuperar a senha.')
      return
    }

    try {
      setEnviando(true)
      await enviarRecuperacaoSenha(email)
      setMensagem('Se existir uma conta com esse e-mail, o Firebase enviará as instruções de recuperação.')
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
        <form className="login-card" onSubmit={enviar}>
          <span className="eyebrow">RECUPERAR ACESSO</span>
          <h2>Redefina sua senha</h2>
          <p className="auth-description">Informe o e-mail cadastrado. O link seguro será enviado pelo serviço de autenticação.</p>
          <label htmlFor="recovery-email">E-mail</label>
          <input
            id="recovery-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="voce@email.com"
            required
          />
          {mensagem && <p className="success-note">{mensagem}</p>}
          {erro && <p className="form-error" role="alert">{erro}</p>}
          <button className="btn btn-primary" disabled={enviando} type="submit">
            {enviando ? 'Enviando...' : 'Enviar link seguro'}
          </button>
          <Link className="text-link" to="/login">Voltar para o login</Link>
        </form>
      </div>
    </AppScreen>
  )
}
