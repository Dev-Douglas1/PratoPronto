import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import { useUser } from '../context/UserContext.jsx'
import { accountDestination } from '../utils/access.js'

export default function VerificarEmail() {
  const navigate = useNavigate()
  const { usuario, verificacao, enviarVerificacaoEmail, confirmarCodigoEmail, sair } = useUser()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [agora, setAgora] = useState(Date.now())
  const segundos = Math.max(0, Math.ceil((verificacao.retryAt - agora) / 1000))

  useEffect(() => {
    const interval = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  async function confirmar(event) {
    event.preventDefault()
    if (ocupado) return

    const token = codigo.replace(/\D/g, '')
    if (!/^\d{6}$/.test(token)) {
      setErro('Digite os 6 números do código enviado ao seu e-mail.')
      return
    }

    try {
      setErro('')
      setOcupado('confirmando')
      const conta = await confirmarCodigoEmail(token)
      navigate(accountDestination(conta), { replace: true })
    } catch (error) {
      setErro(error.message)
    } finally {
      setOcupado('')
    }
  }

  async function reenviar() {
    if (ocupado || segundos > 0) return
    try {
      setErro('')
      setOcupado('enviando')
      await enviarVerificacaoEmail()
      setAgora(Date.now())
    } catch (error) {
      setErro(error.message)
    } finally {
      setOcupado('')
    }
  }

  if (usuario?.emailVerificado) return <Navigate to={accountDestination(usuario)} replace />

  return (
    <AppScreen>
      <div className="page-heading">
        <span className="eyebrow">CONFIRMAÇÃO DO CADASTRO</span>
        <h1>Digite o código do e-mail</h1>
        <p>Use o código de 6 números enviado pelo PratoPronto para liberar sua conta.</p>
      </div>

      <section className="light-card verification-card" aria-label="Confirmação de e-mail" aria-busy={Boolean(ocupado)}>
        <span className="verification-icon" aria-hidden="true">✉</span>
        <p className="verification-address">{usuario?.email}</p>

        {verificacao.sent && (
          <p className="success-note" role="status">
            Código enviado. Confira também a caixa de spam.
          </p>
        )}

        <form onSubmit={confirmar}>
          <label htmlFor="codigo-email">Código de verificação</label>
          <input
            id="codigo-email"
            name="codigo-email"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={codigo}
            onChange={(event) => {
              setCodigo(event.target.value.replace(/\D/g, '').slice(0, 6))
              if (erro) setErro('')
            }}
            placeholder="000000"
            aria-describedby="codigo-ajuda"
            disabled={Boolean(ocupado)}
            required
          />
          <small className="field-help" id="codigo-ajuda">
            Digite somente os 6 números do e-mail mais recente.
          </small>

          {(erro || verificacao.error) && (
            <p className="form-error dark-error" role="alert">
              {erro || verificacao.error}
            </p>
          )}

          <button className="btn btn-primary" type="submit" disabled={Boolean(ocupado) || codigo.length !== 6}>
            {ocupado === 'confirmando' ? 'Confirmando...' : 'Confirmar código'}
          </button>
        </form>

        <button className="btn btn-secondary" disabled={Boolean(ocupado) || segundos > 0} type="button" onClick={reenviar}>
          {ocupado === 'enviando'
            ? 'Enviando código...'
            : segundos > 0
              ? `Reenviar código em ${segundos}s`
              : verificacao.sent
                ? 'Reenviar código'
                : 'Enviar código de confirmação'}
        </button>

        <p className="verification-help">
          Se o código expirou ou não chegou, aguarde o contador e solicite outro. Somente o código mais recente deve ser usado.
        </p>

        <button
          className="btn ghost-button"
          type="button"
          disabled={Boolean(ocupado)}
          onClick={async () => {
            await sair()
            navigate('/login', { replace: true })
          }}
        >
          Sair / usar outro e-mail
        </button>
      </section>
    </AppScreen>
  )
}
