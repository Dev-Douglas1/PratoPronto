import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/supabase'
import { useUser } from '../context/UserContext.jsx'
import AppScreen from '../components/AppScreen.jsx'
import '../styles/login.css'

const MAX_ATTEMPTS = 5
const LOCKOUT_TIME_MS = 15 * 60 * 1000 // 15 minutos

export default function Login() {
  const navigate = useNavigate()
  const { entrarComGoogle } = useUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [lockoutTimer, setLockoutTimer] = useState(0)

  // Verifica bloqueio por e-mail ao alterar o campo de e-mail
  useEffect(() => {
    checkLockout(email)
  }, [email])

  // Regressão do timer de bloqueio
  useEffect(() => {
    let interval = null
    if (lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [lockoutTimer])

  function getStorageKey(targetEmail) {
    return `login_attempts_${targetEmail.trim().toLowerCase()}`
  }

  function checkLockout(targetEmail) {
    if (!targetEmail) {
      setLockoutTimer(0)
      return false
    }
    const key = getStorageKey(targetEmail)
    const record = JSON.parse(localStorage.getItem(key) || '{}')

    if (record.lockUntil && Date.now() < record.lockUntil) {
      const remainingSecs = Math.ceil((record.lockUntil - Date.now()) / 1000)
      setLockoutTimer(remainingSecs)
      return true
    } else {
      setLockoutTimer(0)
      return false
    }
  }

  function registerFailedAttempt(targetEmail) {
    const key = getStorageKey(targetEmail)
    const record = JSON.parse(localStorage.getItem(key) || '{ "count": 0 }')
    const newCount = (record.count || 0) + 1

    if (newCount >= MAX_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_TIME_MS
      localStorage.setItem(key, JSON.stringify({ count: newCount, lockUntil }))
      setLockoutTimer(LOCKOUT_TIME_MS / 1000)
      alert('Número máximo de tentativas excedido! Conta temporariamente bloqueada por 15 minutos.')
    } else {
      localStorage.setItem(key, JSON.stringify({ count: newCount }))
      alert(`Falha no login. Tentativa ${newCount} de ${MAX_ATTEMPTS}.`)
    }
  }

  function resetAttempts(targetEmail) {
    const key = getStorageKey(targetEmail)
    localStorage.removeItem(key)
  }

  async function handleEmailLogin(e) {
    e.preventDefault()

    if (checkLockout(email)) {
      alert(`Muitas tentativas incorretas. Aguarde ${Math.ceil(lockoutTimer / 60)} minuto(s) para tentar novamente.`)
      return
    }

    setLoading(true)

    try {
      const supabase = getSupabase()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('Erro de Autenticação:', error)
        registerFailedAttempt(email)
        return
      }

      if (data?.session) {
        resetAttempts(email)
        navigate('/pratos')
      }
    } catch (err) {
      console.error('Erro de execução:', err)
      alert(`Erro no app: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    try {
      // Reutiliza o fluxo OAuth centralizado, que retorna para /auth/callback
      // e finaliza a sessão/perfil antes de liberar as rotas protegidas.
      await entrarComGoogle()
    } catch (err) {
      console.error('Erro Google Auth:', err)
      alert(`Erro ao conectar com Google: ${err.message}`)
      setGoogleLoading(false)
    }
  }

  return (
    <AppScreen className="login-screen">
      <div className="login-container">
        <span className="eyebrow">BEM-VINDO DE VOLTA</span>
        <h1>Entre para fazer seu pedido</h1>

        {lockoutTimer > 0 && (
          <div style={{ background: '#ffeeee', color: '#cc0000', padding: '12px', borderRadius: '12px', marginBottom: '16px', fontSize: '13px', textAlign: 'center', fontWeight: 'bold' }}>
            Acesso bloqueado por segurança. Tente novamente em {Math.floor(lockoutTimer / 60)}m {lockoutTimer % 60}s.
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              placeholder="Seu e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || lockoutTimer > 0}
          >
            {loading ? 'A entrar...' : lockoutTimer > 0 ? 'Bloqueado' : 'Entrar'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-outline"
          onClick={handleGoogleLogin}
          disabled={loading || googleLoading}
          style={{ marginTop: '12px', width: '100%' }}
        >
          {googleLoading ? 'Conectando ao Google...' : 'Continuar com Google'}
        </button>

        <div className="login-footer-links">
          <p>
            <Link to="/login-telefone">Entrar com telefone</Link>
          </p>
          <p>
            Ainda não tem uma conta? <Link to="/cadastro">Cadastre-se</Link>
          </p>
        </div>
      </div>
    </AppScreen>
  )
}