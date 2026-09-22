import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase, supabaseConfigured } from '../lib/supabase.js'
import {
  deleteUserData, getAdminStatus, getUserProfile, PRIVACY_POLICY_VERSION,
  TERMS_VERSION, updateUserProfile,
} from '../services/storage.js'
import { normalizePhone, validateCep, validateName, validatePassword, validatePhone } from '../shared/input-policy.js'
import { criarErroSupabase } from '../utils/supabaseError.js'

const UserContext = createContext(null)
const PENDING_EMAIL_KEY = 'pratopronto:pending-email'

function verified(user) {
  return Boolean(user?.email_confirmed_at || user?.phone_confirmed_at || user?.confirmed_at)
}

function brazilPhone(value) {
  const digits = normalizePhone(value)
  if (!/^[1-9][0-9]{9,10}$/.test(digits)) throw new Error('Informe um telefone com DDD e 10 ou 11 números.')
  return { digits, e164: '+55' + digits }
}

function pendingAccount(userOrEmail) {
  const user = typeof userOrEmail === 'string' ? null : userOrEmail
  const email = typeof userOrEmail === 'string' ? userOrEmail : user?.email
  return {
    uid: user?.id || '',
    email: email || '',
    nome: user?.user_metadata?.nome || '',
    emailVerificado: false,
    admin: false,
  }
}

async function readAccount(user) {
  if (!verified(user)) return pendingAccount(user)
  const [profile, admin] = await Promise.all([
    getUserProfile(user.id),
    getAdminStatus(user.id).catch(() => false),
  ])
  return {
    ...profile,
    uid: user.id,
    email: user.email || profile?.email || '',
    nome: profile?.nome || user.user_metadata?.nome || user.user_metadata?.name || user.user_metadata?.full_name || '',
    emailVerificado: true,
    admin,
  }
}

export function UserProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [loading, setLoading] = useState(supabaseConfigured)
  const [verificacao, setVerificacao] = useState({ sent: false, error: '', retryAt: 0 })
  const [avisoLogin, setAvisoLogin] = useState('')
  const sendInFlight = useRef(null)
  const checkInFlight = useRef(null)
  const nextEmailAt = useRef({ email: null, time: 0 })

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return undefined }
    const supabase = getSupabase()
    let alive = true
    let generation = 0

    async function applySession(session) {
      const current = ++generation
      const user = session?.user
      if (!user) {
        if (alive && current === generation) {
          const pendingEmail = sessionStorage.getItem(PENDING_EMAIL_KEY)
          setUsuario(pendingEmail ? pendingAccount(pendingEmail) : null)
          setLoading(false)
        }
        return
      }
      try {
        const account = await readAccount(user)
        if (alive && current === generation) {
          setUsuario(account)
          if (account.emailVerificado) sessionStorage.removeItem(PENDING_EMAIL_KEY)
        }
      } catch {
        if (alive && current === generation) {
          setUsuario(null)
          setAvisoLogin('Não foi possível carregar sua conta no Supabase. Entre novamente em instantes.')
        }
      } finally {
        if (alive && current === generation) setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data }) => applySession(data.session)).catch(() => {
      if (alive) { setLoading(false); setAvisoLogin('Não foi possível iniciar a sessão segura.') }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => applySession(session))
    })
    return () => { alive = false; generation++; listener.subscription.unsubscribe() }
  }, [])

  function ready() {
    if (!supabaseConfigured) throw new Error('O Supabase ainda não foi configurado no ambiente.')
    return getSupabase()
  }

  async function enviarVerificacaoEmail() {
    const supabase = ready()
    const email = usuario?.email?.trim().toLowerCase()
    if (!email) throw new Error('Informe o e-mail da conta para reenviar a confirmação.')
    if (sendInFlight.current?.email === email) return sendInFlight.current.promise
    if (nextEmailAt.current.email === email && nextEmailAt.current.time > Date.now()) {
      setVerificacao(current => ({ ...current, retryAt: nextEmailAt.current.time }))
      throw new Error('Aguarde um minuto antes de reenviar o e-mail.')
    }
    nextEmailAt.current = { email, time: Date.now() + 60000 }
    const promise = (async () => {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      })
      if (error) throw error
      const result = { sent: true, retryAfterSeconds: 60 }
      setVerificacao({ ...result, error: '', retryAt: Date.now() + 60000 })
      return result
    })().catch(error => {
      const translated = criarErroSupabase(error)
      setVerificacao({ sent: false, error: translated.message, retryAt: Date.now() + 60000 })
      throw translated
    })
    sendInFlight.current = { email, promise }
    try { return await promise } finally {
      if (sendInFlight.current?.promise === promise) sendInFlight.current = null
    }
  }

  async function entrar(email, senha) {
    const supabase = ready()
    const normalized = email.trim().toLowerCase()
    setAvisoLogin('')
    setVerificacao({ sent: false, error: '', retryAt: 0 })
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password: senha })
    if (error) {
      if (String(error.message).toLowerCase().includes('email not confirmed')) {
        sessionStorage.setItem(PENDING_EMAIL_KEY, normalized)
        const account = pendingAccount(normalized)
        setUsuario(account)
        await supabase.auth.resend({ type: 'signup', email: normalized }).catch(() => undefined)
        return account
      }
      throw criarErroSupabase(error)
    }
    const account = await readAccount(data.user)
    setUsuario(account)
    return account
  }


  async function entrarComGoogle() {
    const supabase = ready()
    setAvisoLogin('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      },
    })
    if (error) throw criarErroSupabase(error)
  }

  async function finalizarOAuth(code) {
    const supabase = ready()
    if (!code) throw new Error('O Google não retornou um código de autenticação válido.')
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw criarErroSupabase(error)
    const user = data.user || data.session?.user
    if (!user) throw new Error('Não foi possível concluir o login com Google.')
    const account = await readAccount(user)
    setUsuario(account)
    return account
  }

  async function enviarCodigoTelefone(telefone) {
    const supabase = ready()
    const { e164 } = brazilPhone(telefone)
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 })
    if (error) throw criarErroSupabase(error)
    return { sent: true, phone: e164 }
  }

  async function confirmarCodigoTelefone(telefone, codigo) {
    const supabase = ready()
    const { e164 } = brazilPhone(telefone)
    const token = String(codigo || '').replace(/\D/g, '')
    if (!/^\d{6}$/.test(token)) throw new Error('Digite o código de 6 números enviado por SMS.')

    const { data, error } = await supabase.auth.verifyOtp({
      phone: e164,
      token,
      type: 'sms',
    })
    if (error) throw criarErroSupabase(error)
    const user = data.user || data.session?.user
    if (!user) throw new Error('Não foi possível concluir o login por telefone.')
    const account = await readAccount(user)
    setUsuario(account)
    return account
  }

  async function cadastrar(dados) {
    const supabase = ready()
    validateName(dados.nome)
    validatePhone(dados.telefone)
    validateCep(dados.cep)
    validatePassword(dados.senha)
    const email = dados.email.trim().toLowerCase()
    const metadata = {
      nome: dados.nome.trim(),
      telefone: String(dados.telefone).replace(/\D/g, ''),
      endereco: dados.endereco.trim(),
      numero: dados.numero.trim(),
      bairro: dados.bairro.trim(),
      complemento: dados.complemento.trim(),
      cep: String(dados.cep || '').replace(/\D/g, ''),
      cidade: dados.cidade.trim(),
      uf: dados.uf.trim().toUpperCase(),
      aceitar_marketing: Boolean(dados.aceitarMarketing),
      privacy_policy_version: PRIVACY_POLICY_VERSION,
      terms_version: TERMS_VERSION,
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password: dados.senha,
      options: {
        data: metadata,
      },
    })
    if (error) throw criarErroSupabase(error)
    if (!data.user) throw new Error('O Supabase não retornou a conta criada.')
    sessionStorage.setItem(PENDING_EMAIL_KEY, email)
    const account = verified(data.user) ? await readAccount(data.user) : pendingAccount(data.user)
    setUsuario(account)
    setVerificacao({ sent: !verified(data.user), error: '', retryAt: Date.now() + 60000 })
    return account
  }

  async function confirmarCodigoEmail(codigo) {
    const supabase = ready()
    const email = usuario?.email?.trim().toLowerCase()
    const token = String(codigo || '').replace(/\D/g, '')
    if (!email) throw new Error('Informe o e-mail da conta para confirmar o cadastro.')
    if (!/^\d{6}$/.test(token)) throw new Error('Digite o código de 6 números enviado ao seu e-mail.')

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })
    if (error) throw criarErroSupabase(error)
    if (!data.user || !verified(data.user)) throw new Error('Não foi possível confirmar este código. Solicite um novo e tente novamente.')

    const account = await readAccount(data.user)
    setUsuario(account)
    sessionStorage.removeItem(PENDING_EMAIL_KEY)
    setVerificacao({ sent: false, error: '', retryAt: 0 })
    return account
  }

  async function conferirVerificacaoEmail() {
    const supabase = ready()
    const key = usuario?.uid || usuario?.email || 'pending'
    if (checkInFlight.current?.key === key) return checkInFlight.current.promise
    const promise = (async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) return null
      const { data, error } = await supabase.auth.getUser()
      if (error) throw error
      if (!data.user || !verified(data.user)) return null
      const account = await readAccount(data.user)
      setUsuario(account)
      sessionStorage.removeItem(PENDING_EMAIL_KEY)
      setVerificacao({ sent: false, error: '', retryAt: 0 })
      return account
    })().catch(error => { throw criarErroSupabase(error) })
    checkInFlight.current = { key, promise }
    try { return await promise } finally {
      if (checkInFlight.current?.promise === promise) checkInFlight.current = null
    }
  }

  async function atualizar(dados) {
    if (!usuario?.uid || !usuario.emailVerificado) throw new Error('Confirme seu e-mail antes de alterar o perfil.')
    validateName(dados.nome)
    validatePhone(dados.telefone)
    validateCep(dados.cep)
    try {
      const profile = await updateUserProfile(usuario.uid, dados)
      const finalUser = { ...usuario, ...profile, uid: usuario.uid, email: usuario.email, emailVerificado: true }
      setUsuario(finalUser)
      return finalUser
    } catch (error) { throw criarErroSupabase(error) }
  }

  async function sair() {
    setUsuario(null)
    setAvisoLogin('')
    setVerificacao({ sent: false, error: '', retryAt: 0 })
    sessionStorage.removeItem(PENDING_EMAIL_KEY)
    if (supabaseConfigured) await getSupabase().auth.signOut()
  }

  async function enviarRecuperacaoSenha(email) {
    const supabase = ready()
    const normalized = email?.trim().toLowerCase()
    if (!normalized) throw new Error('Digite o e-mail da sua conta.')
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo: window.location.origin + '/redefinir-senha',
    })
    if (error) throw criarErroSupabase(error)
  }

  async function excluirConta(senha) {
    const supabase = ready()
    if (!usuario?.emailVerificado || !usuario.email) throw new Error('Entre e confirme seu e-mail para continuar.')
    if (!senha) throw new Error('Digite sua senha para confirmar a exclusão.')
    const { error } = await supabase.auth.signInWithPassword({ email: usuario.email, password: senha })
    if (error) throw criarErroSupabase(error)
    try {
      await deleteUserData()
      await sair()
      return true
    } catch (error2) { throw criarErroSupabase(error2) }
  }

  const value = useMemo(() => ({
    usuario, loading, autenticado: usuario?.emailVerificado === true,
    supabaseConfigured, verificacao, avisoLogin, entrar, entrarComGoogle, finalizarOAuth,
    enviarCodigoTelefone, confirmarCodigoTelefone, cadastrar, atualizar, sair,
    enviarRecuperacaoSenha, enviarVerificacaoEmail, confirmarCodigoEmail, conferirVerificacaoEmail, excluirConta,
  }), [usuario, loading, verificacao, avisoLogin])

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) throw new Error('useUser deve ser usado dentro de UserProvider')
  return context
}
