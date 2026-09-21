import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import { useUser } from '../context/UserContext.jsx'
import { accountDestination } from '../utils/access.js'

export default function VerificarEmail() {
  const navigate = useNavigate()
  const { usuario, verificacao, enviarVerificacaoEmail, conferirVerificacaoEmail, sair } = useUser()
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [agora, setAgora] = useState(Date.now())
  const busy = useRef(false)
  const mounted = useRef(false)
  const lastCheck = useRef(0)
  const check = useRef(conferirVerificacaoEmail)
  check.current = conferirVerificacaoEmail
  const segundos = Math.max(0, Math.ceil((verificacao.retryAt - agora) / 1000))
  useEffect(() => { const interval = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(interval) }, [])

  const conferir = useCallback(async (automatico = false) => {
    if (busy.current || (automatico && Date.now() - lastCheck.current < 5000)) return
    busy.current = true
    lastCheck.current = Date.now()
    setErro('')
    setOcupado('conferindo')
    try {
      const conta = await check.current()
      if (!mounted.current) return
      if (conta?.emailVerificado) navigate(accountDestination(conta), { replace: true })
      else if (!automatico) setErro('Seu e-mail ainda não foi confirmado. Toque no link recebido e depois tente novamente aqui.')
    } catch (error) { if (mounted.current) setErro(error.message) }
    finally {
      busy.current = false
      if (mounted.current) setOcupado('')
    }
  }, [navigate])

  useEffect(() => {
    mounted.current = true
    const aoVoltar = () => { if (document.visibilityState === 'visible') conferir(true) }
    // Ao voltar do app de e-mail, a sessão do Supabase é conferida uma vez.
    // O app não concede acesso com uma confirmação apenas local.
    aoVoltar()
    window.addEventListener('focus', aoVoltar)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      mounted.current = false
      window.removeEventListener('focus', aoVoltar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [usuario?.uid, conferir])

  async function reenviar() {
    if (busy.current || segundos > 0) return
    busy.current = true
    try {
      setErro(''); setOcupado('enviando')
      await enviarVerificacaoEmail()
      if (mounted.current) setAgora(Date.now())
    } catch (error) { if (mounted.current) setErro(error.message) }
    finally { busy.current = false; if (mounted.current) setOcupado('') }
  }
  if (usuario?.emailVerificado) return <Navigate to={accountDestination(usuario)} replace />
  return (
    <AppScreen>
      <div className="page-heading">
        <span className="eyebrow">CONFIRMAÇÃO DO CADASTRO</span>
        <h1>Confirme seu e-mail</h1>
        <p>Falta só confirmar que este e-mail é seu para liberar o acesso.</p>
      </div>
      <section className="light-card verification-card" aria-label="Confirmação de e-mail" aria-busy={Boolean(ocupado)}>
        <span className="verification-icon" aria-hidden="true">✉</span>
        <p className="verification-address">{usuario?.email}</p>
        {verificacao.sent && <p className="success-note" role="status">E-mail de confirmação enviado. Confira também a caixa de spam.</p>}
        {!verificacao.sent && !verificacao.error && <p>Solicite o e-mail pelo botão abaixo para receber seu link.</p>}
        <ol className="verification-steps">
          <li>Abra sua caixa de e-mail.</li>
          <li>Toque no link de confirmação do PratoPronto.</li>
          <li>Volte ao app para continuar.</li>
        </ol>
        <p>Ao voltar, conferimos a confirmação automaticamente. Você também pode usar o botão abaixo.</p>
        {(erro || verificacao.error) && <p className="form-error dark-error" role="alert">{erro || verificacao.error}</p>}
        <button className="btn btn-primary" type="button" disabled={Boolean(ocupado)} onClick={() => conferir(false)}>
          {ocupado === 'conferindo' ? 'Conferindo confirmação...' : 'Já confirmei meu e-mail'}
        </button>
        <button className="btn btn-secondary" disabled={Boolean(ocupado) || segundos > 0} type="button" onClick={reenviar}>
          {ocupado === 'enviando' ? 'Enviando e-mail...' : segundos > 0 ? `Reenviar e-mail em ${segundos}s` : verificacao.sent ? 'Reenviar e-mail' : 'Enviar e-mail de confirmação'}
        </button>
        <p className="verification-help">Se o link expirou, solicite outro e-mail. Se fechar o app, entre com sua senha para continuar de onde parou.</p>
        <button className="btn ghost-button" type="button" disabled={Boolean(ocupado)} onClick={async () => { await sair(); navigate('/login', { replace: true }) }}>Sair / usar outro e-mail</button>
      </section>
    </AppScreen>
  )
}
