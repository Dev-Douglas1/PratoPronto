import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/supabase'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'

import '../styles/home.css'; // Mantenha o seu ficheiro de estilos de login
export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // Login com E-mail e Senha
  async function handleEmailLogin(e) {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = getSupabase()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('Erro de Autenticação:', error)
        alert(`Falha no login: ${error.message}`)
        return
      }

      if (data?.session) {
        navigate('/pizzas')
      }
    } catch (err) {
      console.error('Erro de execução:', err)
      alert(`Erro no app: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Login com Google
  async function handleGoogleLogin() {
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/pizzas`,
        },
      })

      if (error) {
        console.error('Erro Google Auth:', error)
        alert(`Erro ao conectar com Google: ${error.message}`)
      }
    } catch (err) {
      console.error('Erro de execução:', err)
      alert(`Erro no app: ${err.message}`)
    }
  }

  return (
    <AppScreen className="login-screen">
      <div className="login-container">
        <BrandMark />
        <span className="eyebrow">BEM-VINDO DE VOLTA</span>
        <h1>Entre para fazer seu pedido</h1>

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

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'A entrar...' : 'Entrar'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-outline"
          onClick={handleGoogleLogin}
          style={{ marginTop: '12px', width: '100%' }}
        >
          Continuar com Google
        </button>

        <div className="login-footer-links">
          <p>
            Ainda não tem uma conta? <Link to="/cadastro">Cadastre-se</Link>
          </p>
        </div>
      </div>
    </AppScreen>
  )
}