import PasswordField from '../components/PasswordField.jsx'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import { useUser } from '../context/UserContext.jsx'
import { accountDestination } from '../utils/access.js'

const LOGIN_ATTEMPTS_KEY = 'pratopronto:login-attempts'
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_LOCK_MS = 15 * 60 * 1000

function readLoginGuard() {
  try {
    const value = JSON.parse(sessionStorage.getItem(LOGIN_ATTEMPTS_KEY) || '{}')
    return { attempts: Number.isInteger(value.attempts) ? value.attempts : 0, lockedUntil: Number.isFinite(value.lockedUntil) ? value.lockedUntil : 0 }
  } catch { return { attempts: 0, lockedUntil: 0 } }
}

function isWrongPassword(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'invalid_credentials' || message.includes('invalid login credentials') || message.includes('invalid email or password')
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { entrar, entrarComGoogle, supabaseConfigured } = useUser()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [google, setGoogle] = useState(false)
  const [guard, setGuard] = useState(readLoginGuard)
  const [now, setNow] = useState(Date.now())
  const remainingSeconds = Math.max(0, Math.ceil((guard.lockedUntil - now) / 1000))
  const loginLocked = remainingSeconds > 0

  useEffect(() => {
    if (!guard.lockedUntil) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [guard.lockedUntil])

  useEffect(() => {
    if (guard.lockedUntil && guard.lockedUntil <= now) {
      const reset = { attempts: 0, lockedUntil: 0 }
      sessionStorage.removeItem(LOGIN_ATTEMPTS_KEY)
      setGuard(reset)
    }
  }, [guard.lockedUntil, now])

  async function handleEntrar(event) {
    event.preventDefault()
    setErro('')
    if (loginLocked) {
      setErro('Muitas tentativas. Aguarde ' + remainingSeconds + ' segundos para tentar novamente.')
      return
    }

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
      sessionStorage.removeItem(LOGIN_ATTEMPTS_KEY)
      setGuard({ attempts: 0, lockedUntil: 0 })
      setSenha('')
      navigate(accountDestination(conta), { replace: true })
    } catch (error) {
      if (isWrongPassword(error)) {
        const attempts = guard.attempts + 1
        const next = attempts >= MAX_LOGIN_ATTEMPTS
          ? { attempts: 0, lockedUntil: Date.now() + LOGIN_LOCK_MS }
          : { attempts, lockedUntil: 0 }
        sessionStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(next))
        setGuard(next)
        setNow(Date.now())
        setErro(next.lockedUntil
          ? 'Limite de 5 tentativas incorretas atingido. O acesso por senha ficará temporariamente bloqueado por 15 minutos neste navegador.'
          : 'E-mail ou senha incorretos. Restam ' + (MAX_LOGIN_ATTEMPTS - attempts) + ' tentativas antes do bloqueio temporário.')
      } else if (error?.status === 429 || error?.code === 'over_request_rate_limit') {
        setErro('Muitas solicitações de autenticação. Aguarde alguns minutos e tente novamente.')
      } else {
        setErro(error.message)
      }
    } finally {
      setEnviando(false)
    }
  }

  async function handleGoogle() {
    if (google || enviando) return
    setErro('')
    if (!supabaseConfigured) {
      setErro('Configure o Supabase antes de usar o login com Google.')
      return
    }
    try {
      setGoogle(true)
      await entrarComGoogle()
    } catch (error) {
      setErro(error.message)
      setGoogle(false)
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
          {location.state?.message && <p className="success-note" role="status">{location.state.message}</p>}
          {erro && <p className="form-error" role="alert">{erro}</p>}
          <button className="btn btn-primary" type="submit" disabled={enviando || google || loginLocked}>
            {loginLocked ? 'Aguarde ' + remainingSeconds + 's' : enviando ? 'Entrando...' : 'Entrar'}
          </button>
          <button className="btn btn-secondary" type="button" disabled={enviando || google} onClick={handleGoogle}>
            {google ? 'Abrindo Google...' : 'Continuar com Google'}
          </button>
          <Link className="btn btn-secondary" to="/login-telefone">Entrar com telefone</Link>
          <p className="auth-switch">Ainda não tem uma conta? <Link to="/cadastro">Cadastre-se</Link></p>
          <Link className="text-link" to="/demo/empresa/pedidos">Conhecer o painel da empresa</Link>
          <div className="legal-links">
            <Link to="/politica-de-privacidade">Política de Privacidade</Link>
            <Link to="/termos-de-uso">Termos de Uso</Link>
          </div>
          <small className="demo-note">🔒 Após 5 senhas incorretas, o login por senha fica temporariamente bloqueado neste navegador. O Supabase também aplica limites de requisições no servidor.</small>
        </form>
      </div>
    </AppScreen>
  )
}
