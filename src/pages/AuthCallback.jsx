import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import { useUser } from '../context/UserContext.jsx'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { finalizarOAuth } = useUser()
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true

    async function concluir() {
      try {
        const params = new URLSearchParams(window.location.search)
        const providerError = params.get('error_description') || params.get('error')
        if (providerError) throw new Error(providerError.replace(/\+/g, ' '))

        const code = params.get('code')
        if (!code) throw new Error('O Google retornou sem o código de autorização. Verifique a URL de retorno OAuth no Supabase e tente novamente.')

        // detectSessionInUrl=true faz a troca PKCE uma única vez na inicialização
        // do cliente; esta tela aguarda a sessão persistida pelo próprio SDK.
        const conta = await finalizarOAuth()
        if (ativo) navigate(conta?.emailVerificado === true ? '/pratos' : '/verificar-email', { replace: true })
      } catch (error) {
        if (ativo) setErro(error?.message || 'Não foi possível concluir o login com Google.')
      }
    }

    concluir()
    return () => { ativo = false }
  }, [finalizarOAuth, navigate])

  return (
    <AppScreen className="centered-screen">
      <div className="login-wrapper">
        <div className="login-card">
          <span className="eyebrow">LOGIN COM GOOGLE</span>
          <h2>{erro ? 'Não foi possível entrar' : 'Concluindo seu acesso...'}</h2>
          {!erro && <p role="status">Validando sua sessão e preparando sua conta...</p>}
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
