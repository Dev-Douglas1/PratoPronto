import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import { useUser } from '../context/UserContext.jsx'
import { accountDestination } from '../utils/access.js'

// Evita trocar duas vezes o mesmo código PKCE durante o React StrictMode.
let oauthCompletion = { code: null, promise: null }

export default function AuthCallback() {
  const navigate = useNavigate()
  const { finalizarOAuth } = useUser()
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    let timeoutId

    async function concluir() {
      try {
        const params = new URLSearchParams(window.location.search)
        const providerError = params.get('error_description') || params.get('error')
        if (providerError) throw new Error(providerError.replace(/\+/g, ' '))

        const code = params.get('code')
        if (!oauthCompletion.promise || oauthCompletion.code !== code) {
          oauthCompletion = {
            code,
            promise: Promise.race([
              finalizarOAuth(code),
              new Promise((_, reject) => {
                timeoutId = window.setTimeout(
                  () => reject(new Error('A confirmação do Google demorou mais que o esperado. Volte ao login e tente novamente.')),
                  20000,
                )
              }),
            ]).finally(() => window.clearTimeout(timeoutId)),
          }
        }

        const conta = await oauthCompletion.promise
        if (ativo) navigate(accountDestination(conta), { replace: true })
      } catch (error) {
        oauthCompletion = { code: null, promise: null }
        if (ativo) setErro(error?.message || 'Não foi possível concluir o login com Google.')
      }
    }

    concluir()
    return () => { ativo = false; window.clearTimeout(timeoutId) }
  }, [finalizarOAuth, navigate])

  return (
    <AppScreen className="centered-screen">
      <div className="login-wrapper">
        <BrandMark compact showTagline={false} />
        <div className="login-card">
          <span className="eyebrow">LOGIN COM GOOGLE</span>
          <h2>{erro ? 'Não foi possível entrar' : 'Concluindo seu acesso...'}</h2>
          {!erro && <p role="status">Estamos validando sua sessão. Isso deve levar apenas alguns segundos.</p>}
          {erro && (
            <>
              <p className="form-error" role="alert">{erro}</p>
              <Link className="btn btn-primary" to="/login">Voltar ao login</Link>
            </>
          )}
        </div>
      </div>
    </AppScreen>
  )
}
