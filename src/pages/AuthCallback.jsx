import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import { useUser } from '../context/UserContext.jsx'
import { accountDestination } from '../utils/access.js'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { finalizarOAuth } = useUser()
  const [erro, setErro] = useState('')
  const iniciado = useRef(false)

  useEffect(() => {
    if (iniciado.current) return undefined
    iniciado.current = true
    let ativo = true
    async function concluir() {
      try {
        const code = new URLSearchParams(window.location.search).get('code')
        const conta = await finalizarOAuth(code)
        if (ativo) navigate(accountDestination(conta), { replace: true })
      } catch (error) {
        if (ativo) setErro(error.message)
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
          {erro && <p className="form-error" role="alert">{erro}</p>}
        </div>
      </div>
    </AppScreen>
  )
}
