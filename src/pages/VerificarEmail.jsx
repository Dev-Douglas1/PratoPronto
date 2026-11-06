import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import { useUser } from '../context/UserContext.jsx'
import '../styles/auth.css'

const RESEND_COOLDOWN_SECONDS = 60

export default function VerificarEmail() {
  const navigate = useNavigate()
  const {
    user,
    usuario,
    sair,
    confirmarCodigoEmail,
    enviarVerificacaoEmail,
    verificacao,
  } = useUser()

  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [tempoRestante, setTempoRestante] = useState(RESEND_COOLDOWN_SECONDS)

  const emailUsuario = user?.email || usuario?.email || ''
  const codigoValido = /^\d{6}$/.test(codigo)

  useEffect(() => {
    if (tempoRestante <= 0) return undefined
    const timer = window.setTimeout(() => {
      setTempoRestante(atual => Math.max(0, atual - 1))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [tempoRestante])

  async function handleVerificar(event) {
    event.preventDefault()
    if (!codigoValido || enviando) {
      setErro('Digite o código completo de 6 dígitos.')
      return
    }
    if (!emailUsuario) {
      setErro('Não foi possível identificar o e-mail deste cadastro. Entre novamente.')
      return
    }

    setErro('')
    setSucesso('')
    setEnviando(true)
    try {
      await confirmarCodigoEmail(codigo)
      navigate('/pratos', { replace: true })
    } catch (error) {
      setErro(error.message || 'Código inválido ou expirado. Solicite um novo código.')
    } finally {
      setEnviando(false)
    }
  }

  async function handleReenviar() {
    if (tempoRestante > 0 || enviando) return
    if (!emailUsuario) {
      setErro('Não foi possível identificar o e-mail deste cadastro. Entre novamente.')
      return
    }

    setErro('')
    setSucesso('')
    setEnviando(true)
    try {
      await enviarVerificacaoEmail()
      setSucesso('Solicitação aceita. Confira sua caixa de entrada e a pasta de spam.')
      setTempoRestante(RESEND_COOLDOWN_SECONDS)
    } catch (error) {
      setErro(error.message || 'Não foi possível reenviar o código.')
      if (verificacao?.retryAt) {
        setTempoRestante(Math.max(0, Math.ceil((verificacao.retryAt - Date.now()) / 1000)))
      }
    } finally {
      setEnviando(false)
    }
  }

  async function handleSair() {
    await sair()
    navigate('/login', { replace: true })
  }

  return (
    <AppScreen className="auth-page">
      <div className="auth-header">
        <span className="hero-tagline" style={{ margin: '0 0 6px 0', textAlign: 'left' }}>
          CONFIRMAÇÃO DO CADASTRO
        </span>
        <h1 className="auth-title">Digite o código do e-mail</h1>
        <p className="auth-subtitle">
          Informe o código de 6 dígitos enviado para confirmar seu cadastro.
        </p>
      </div>

      <form onSubmit={handleVerificar} noValidate>
        <div className="form-card">
          <div className="email-badge-container">
            {emailUsuario ? (
              <span className="email-badge">{emailUsuario}</span>
            ) : (
              <span className="field-help">E-mail do cadastro não disponível.</span>
            )}
            <small className="field-help" style={{ display: 'block', textAlign: 'center', marginTop: '8px' }}>
              Confira também as pastas de spam e promoções.
            </small>
          </div>

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
              onChange={event => {
                setCodigo(event.target.value.replace(/\D/g, '').slice(0, 6))
                setErro('')
              }}
              placeholder="000000"
              className="otp-input"
              autoComplete="one-time-code"
              autoFocus
              disabled={enviando}
              aria-describedby="codigo-ajuda"
            />
            <small id="codigo-ajuda" className="field-help" style={{ textAlign: 'center' }}>
              Digite os 6 números do e-mail mais recente.
            </small>
          </div>

          {erro && <p className="form-error dark-error" role="alert">{erro}</p>}
          {sucesso && <p className="form-success" role="status">{sucesso}</p>}

          <div className="btn-group">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={enviando || !codigoValido || !emailUsuario}
            >
              {enviando ? 'Verificando...' : 'Confirmar código'}
            </button>

            <button
              className="btn btn-outline"
              type="button"
              onClick={handleReenviar}
              disabled={enviando || tempoRestante > 0 || !emailUsuario}
            >
              {tempoRestante > 0
                ? `Reenviar código em ${tempoRestante}s`
                : 'Reenviar código'}
            </button>

            <button
              className="btn btn-outline"
              type="button"
              onClick={handleSair}
              disabled={enviando}
            >
              Sair e usar outro e-mail
            </button>
          </div>
        </div>
      </form>
    </AppScreen>
  )
}
