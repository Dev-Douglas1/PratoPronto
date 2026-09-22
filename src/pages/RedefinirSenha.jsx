import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import PasswordField from '../components/PasswordField.jsx'
import { getSupabase, supabaseConfigured } from '../lib/supabase.js'
import { validatePassword } from '../shared/input-policy.js'
import { traduzirErroSupabase } from '../utils/supabaseError.js'

export default function RedefinirSenha() {
  const navigate = useNavigate()
  const [pronto, setPronto] = useState(false)
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let ativo = true

    async function preparar() {
      if (!supabaseConfigured) {
        if (ativo) setErro('O serviço de autenticação ainda não está configurado.')
        return
      }

      const supabase = getSupabase()
      try {
        let { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        const code = new URLSearchParams(window.location.search).get('code')
        if (!sessionData.session && code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          sessionData = data
          window.history.replaceState({}, document.title, window.location.pathname)
        }

        if (!sessionData.session) {
          throw new Error('Este link de recuperação é inválido ou expirou. Solicite um novo e-mail.')
        }

        if (ativo) setPronto(true)
      } catch (error) {
        if (ativo) setErro(traduzirErroSupabase(error))
      }
    }

    preparar()
    return () => { ativo = false }
  }, [])

  async function salvar(event) {
    event.preventDefault()
    if (salvando || !pronto) return
    setErro('')

    try {
      validatePassword(senha)
      if (senha !== confirmarSenha) throw new Error('As duas senhas precisam ser iguais.')

      setSalvando(true)
      const supabase = getSupabase()
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error

      await supabase.auth.signOut()
      navigate('/login', {
        replace: true,
        state: { message: 'Senha alterada com sucesso. Entre novamente com a nova senha.' },
      })
    } catch (error) {
      setErro(traduzirErroSupabase(error))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <AppScreen className="centered-screen">
      <div className="login-wrapper">
        <BrandMark compact />
        <form className="login-card" onSubmit={salvar}>
          <span className="eyebrow">NOVA SENHA</span>
          <h2>Crie uma nova senha</h2>
          <p className="auth-description">
            Use de 6 a 12 caracteres, com minúscula, maiúscula e número. O símbolo é opcional.
          </p>

          {!pronto && !erro && <p className="success-note">Validando seu link seguro...</p>}

          {pronto && (
            <>
              <label htmlFor="nova-senha">Nova senha</label>
              <PasswordField
                id="nova-senha"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                maxLength={12}
                required
                disabled={salvando}
              />

              <label htmlFor="confirmar-nova-senha">Confirmar nova senha</label>
              <PasswordField
                id="confirmar-nova-senha"
                value={confirmarSenha}
                onChange={(event) => setConfirmarSenha(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                maxLength={12}
                required
                disabled={salvando}
              />

              <button className="btn btn-primary" type="submit" disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </>
          )}

          {erro && <p className="form-error" role="alert">{erro}</p>}
          <Link className="text-link" to="/recuperar-senha">Solicitar outro link</Link>
          <Link className="text-link" to="/login">Voltar para o login</Link>
        </form>
      </div>
    </AppScreen>
  )
}
