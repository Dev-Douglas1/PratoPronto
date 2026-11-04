import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import { useUser } from '../context/UserContext.jsx'
import { accountDestination } from '../utils/access.js'

// Compartilha a conclusão entre a montagem dupla do React StrictMode.
// Assim, a segunda execução do efeito pode concluir a navegação sem trocar
// duas vezes o mesmo código PKCE.
let oauthCompletionPromise = null

export default function AuthCallback() {
  const navigate = useNavigate()
  const { finalizarOAuth } = useUser()
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true

    async function concluir() {
      try {
        const code = new URLSearchParams(window.location.search).get('code')
        if (!oauthCompletionPromise) {
          oauthCompletionPromise = finalizarOAuth(code).finally(() => {
            // Mantém a promise concluída durante a montagem atual; ela é
            // substituída apenas quando o usuário iniciar outro OAuth.
          })
        }

        const conta = await oauthCompletionPromise
        if (ativo) navigate(accountDestination(conta), { replace: true })
      } catch (error) {
        oauthCompletionPromise = null
        if (ativo) setErro(error?.message || 'Não foi possível concluir o login com Google.')
      }
    }

    concluir()
    return () => { ativo = false }
  }, [finalizarOAuth, navigate])

  return (
    <AppScreen className="centered-screen">
      <div className="login-wrapper">
        <BrandMark compact />
        <div className="login-card">
          <span className="eyebrow">LOGIN COM GOOGLE</span>
          <h2>{erro ? 'Não foi possível entrar' : 'Concluindo seu acesso...'}</h2>
          {erro && <><p className="form-error" role="alert">{erro}</p><Link className="btn btn-primary" to="/login">Voltar ao login</Link></>}
        </div>
      </div>
    </AppScreen>
  )
}
