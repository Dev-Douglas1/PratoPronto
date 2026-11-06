import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import { useUser } from '../context/UserContext.jsx'
import '../styles/auth.css'

export default function VerificarEmail() {
  const navigate = useNavigate()
  const { usuario, sair, confirmarCodigoEmail, enviarVerificacaoEmail } = useUser()

  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [tempoRestante, setTempoRestante] = useState(30)

  const emailUsuario = usuario?.email || sessionStorage.getItem('pratopronto:pending-email') || ''

  useEffect(() => {
    if (tempoRestante > 0) {
      const timer = setTimeout(() => setTempoRestante(prev => prev - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [tempoRestante])

  async function handleVerificar(e) {
    e.preventDefault()
    if (!/^\d{6}$/.test(codigo)) {
      setErro('Digite o código completo de 6 dígitos.')
      return
    }

    setErro('')
    setSucesso('')
    setEnviando(true)

    try {
      if (verificarCodigo) {
        await verificarCodigo(codigo)
      }
      navigate('/pizzas', { replace: true })
    } catch (error) {
      setErro(error.message || 'Código inválido ou expirado.')
    } finally {
      setEnviando(false)
    }
  }

  async function handleReenviar() {
    if (tempoRestante > 0) return
    setErro('')
    setSucesso('')

    try {
      if (reenviarCodigo) {
        await reenviarCodigo(emailUsuario)
      }
      setSucesso('Novo código enviado para o seu e-mail!')
      setTempoRestante(60)
    } catch (error) {
      setErro(error.message || 'Erro ao reenviar o código.')
    }
  }

  async function handleSair() {
    await sair()
    navigate('/login')
  }

  return (
    <AppScreen className="auth-page">
      <div className="auth-header">
        <span className="hero-tagline" style={{ margin: '0 0 6px 0', textAlign: 'left' }}>
          CONFIRMAÇÃO DO CADASTRO
        </span>
        <h1 className="auth-title">Digite o código do e-mail</h1>
        <p className="auth-subtitle">
          Use o código de 6 números enviado pelo PratoPronto para liberar sua conta.
        </p>
      </div>

      <form onSubmit={handleVerificar} noValidate>
        <div className="form-card">
          {/* Badge estilizado para o e-mail */}
          <div className="email-badge-container">
            <span className="email-badge">
              ✉️ {emailUsuario}
            </span>
            <small className="field-help" style={{ textAlign: 'center', marginTop: '8px' }}>
              Código enviado. Confira também a caixa de spam.
            </small>
          </div>

          {/* Campo de Código PIN */}
          <div className="input-group">
            <label htmlFor="codigo" style={{ textAlign: 'center' }}>
              Código de verificação
            </label>
            <input
              id="codigo"
              name="codigo"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="otp-input"
              autoComplete="one-time-code"
              autoFocus
              disabled={enviando}
            />
            <small className="field-help" style={{ textAlign: 'center' }}>
              Digite somente os 6 números do e-mail mais recente.
            </small>
          </div>

          {erro && <p className="form-error dark-error" role="alert">⚠️ {erro}</p>}
          {sucesso && <p className="form-success" role="alert">✅ {sucesso}</p>}

          {/* Grupo de Botões Organizado */}
          <div className="btn-group">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={enviando || !/^\d{6}$/.test(codigo)}
            >
              {enviando ? 'A verificar...' : 'Confirmar código'}
            </button>

            <button
              className="btn btn-outline"
              type="button"
              onClick={handleReenviar}
              disabled={tempoRestante > 0}
            >
              {tempoRestante > 0
                ? `Enviar código de confirmação em ${tempoRestante}s`
                : 'Enviar código de confirmação'}
            </button>

            <button
              className="btn btn-outline"
              type="button"
              onClick={handleSair}
              style={{ opacity: 0.75 }}
            >
              Sair / usar outro e-mail
            </button>
          </div>
        </div>
      </form>
    </AppScreen>
  )
}