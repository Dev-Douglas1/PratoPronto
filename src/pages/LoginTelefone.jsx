import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import { useUser } from '../context/UserContext.jsx'
import { accountDestination } from '../utils/access.js'
import { phoneInput } from '../shared/input-policy.js'

export default function LoginTelefone() {
  const navigate = useNavigate()
  const { enviarCodigoTelefone, confirmarCodigoTelefone, supabaseConfigured } = useUser()
  const [telefone, setTelefone] = useState('')
  const [codigo, setCodigo] = useState('')
  const [etapa, setEtapa] = useState('telefone')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function enviar(event) {
    event.preventDefault()
    if (ocupado) return
    setErro('')
    if (!supabaseConfigured) {
      setErro('O Supabase ainda não está configurado.')
      return
    }
    try {
      setOcupado(true)
      await enviarCodigoTelefone(telefone)
      setEtapa('codigo')
    } catch (error) {
      setErro(error.message)
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar(event) {
    event.preventDefault()
    if (ocupado) return
    setErro('')
    try {
      setOcupado(true)
      const conta = await confirmarCodigoTelefone(telefone, codigo)
      navigate(accountDestination(conta), { replace: true })
    } catch (error) {
      setErro(error.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <AppScreen className="centered-screen">
      <div className="login-wrapper">
        <BrandMark compact />
        <form className="login-card" onSubmit={etapa === 'telefone' ? enviar : confirmar}>
          <span className="eyebrow">LOGIN POR TELEFONE</span>
          <h2>{etapa === 'telefone' ? 'Receba um código por SMS' : 'Digite o código recebido'}</h2>

          <label htmlFor="phone-login">Telefone com DDD</label>
          <input
            id="phone-login"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={telefone}
            onChange={(event) => {
              setTelefone(phoneInput(event.target.value).slice(0, 11))
              if (erro) setErro('')
            }}
            placeholder="41999999999"
            maxLength={11}
            disabled={ocupado || etapa === 'codigo'}
            required
          />

          {etapa === 'codigo' && <>
            <label htmlFor="phone-code">Código SMS</label>
            <input
              id="phone-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={codigo}
              onChange={(event) => setCodigo(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              disabled={ocupado}
              required
            />
          </>}

          {erro && <p className="form-error" role="alert">{erro}</p>}

          <button className="btn btn-primary" type="submit" disabled={ocupado || (etapa === 'codigo' && codigo.length !== 6)}>
            {ocupado ? 'Aguarde...' : etapa === 'telefone' ? 'Enviar código' : 'Confirmar e entrar'}
          </button>

          {etapa === 'codigo' && <button className="btn btn-secondary" type="button" disabled={ocupado} onClick={() => { setEtapa('telefone'); setCodigo(''); setErro('') }}>Trocar telefone</button>}
          <Link className="text-link" to="/login">Voltar para login por e-mail</Link>
        </form>
      </div>
    </AppScreen>
  )
}
