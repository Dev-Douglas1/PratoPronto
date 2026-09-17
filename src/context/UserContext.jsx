import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  EmailAuthProvider, getIdToken,
  onAuthStateChanged, reload, sendPasswordResetEmail, signInWithEmailAndPassword,
  signOut, reauthenticateWithCredential,
} from 'firebase/auth'
import { auth, authReady, firebaseConfigured } from '../firebase.js'
import {
  deleteUserData, getAdminStatus, getUserProfile, PRIVACY_POLICY_VERSION,
  saveUserProfile, TERMS_VERSION, updateUserProfile,
} from '../services/storage.js'
import { callIdentity } from '../services/identity.js'
import { registerPendingAccount } from '../services/registration.js'
import { refreshEmailVerification, sendVerificationLink } from '../services/email-verification.js'
import { criarErroFirebase } from '../utils/firebaseError.js'

const UserContext = createContext(null)
const pendingAccount = user => ({ uid: user.uid, email: user.email, nome: user.displayName || '', emailVerificado: false, admin: false })

async function readAccount(user) {
  if (!user.emailVerified) return pendingAccount(user)
  await getIdToken(user, true)
  const [profile, admin] = await Promise.all([getUserProfile(user.uid), getAdminStatus(user.uid)])
  return { ...profile, uid: user.uid, email: user.email, nome: profile?.nome || user.displayName || '', emailVerificado: true, admin }
}

export function UserProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [loading, setLoading] = useState(firebaseConfigured)
  const [verificacao, setVerificacao] = useState({ sent: false, error: '', retryAt: 0 })
  const [avisoLogin, setAvisoLogin] = useState('')
  const sendInFlight = useRef(null)
  const checkInFlight = useRef(null)
  const nextEmailAt = useRef({ uid: null, time: 0 })

  useEffect(() => {
    if (!firebaseConfigured || !auth) { setLoading(false); return undefined }
    let disposed = false, unsubscribe, generation = 0
    authReady.then(() => {
      if (disposed) return
      unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
        const current = ++generation
        if (!firebaseUser) { setUsuario(null); setLoading(false); return }
        try {
          await reload(firebaseUser)
          const account = await readAccount(firebaseUser)
          if (!disposed && current === generation && auth.currentUser?.uid === account.uid) setUsuario(account)
        } catch {
          if (!disposed && current === generation) { setUsuario(null); setAvisoLogin('Não foi possível carregar sua conta. Entre novamente em instantes.') }
        } finally { if (!disposed && current === generation) setLoading(false) }
      })
    }).catch(() => { if (!disposed) { setLoading(false); setAvisoLogin('Não foi possível iniciar uma sessão segura. Reabra o aplicativo.') } })
    // Discard the session even if the page enters the back/forward cache.
    const closeSession = () => {
      generation++
      setUsuario(null)
      signOut(auth).catch(() => undefined)
    }
    window.addEventListener('pagehide', closeSession)
    return () => { disposed = true; generation++; unsubscribe?.(); window.removeEventListener('pagehide', closeSession) }
  }, [])

  async function ready() {
    if (!firebaseConfigured || !auth) throw new Error('O login ainda não foi ativado pela empresa.')
    await authReady
  }

  async function enviarVerificacaoEmail() {
    if (!auth?.currentUser) throw new Error('Entre novamente para confirmar seu e-mail.')
    const uid = auth.currentUser.uid
    if (sendInFlight.current?.uid === uid) return sendInFlight.current.promise
    if (nextEmailAt.current.uid === uid && nextEmailAt.current.time > Date.now()) {
      setVerificacao(atual => ({ ...atual, retryAt: nextEmailAt.current.time }))
      throw new Error('Aguarde um minuto antes de reenviar o e-mail.')
    }
    nextEmailAt.current = { uid, time: Date.now() + 60000 }
    const promise = (async () => {
      try {
        const result = await sendVerificationLink(auth)
        if (result.verified) await conferirVerificacaoEmail()
        if (auth.currentUser?.uid === uid) setVerificacao({ ...result, error: '', retryAt: Date.now() + (result.retryAfterSeconds || 60) * 1000 })
        return result
      } catch (error) {
        const translated = criarErroFirebase(error)
        if (auth.currentUser?.uid === uid) setVerificacao({ sent: false, error: translated.message, retryAt: Date.now() + 60000 })
        throw translated
      }
    })()
    sendInFlight.current = { uid, promise }
    try { return await promise } finally {
      if (sendInFlight.current?.promise === promise) sendInFlight.current = null
    }
  }

  async function entrar(email, senha) {
    await ready()
    setAvisoLogin('')
    setVerificacao({ sent: false, error: '', retryAt: 0 })
    let user
    try {
      user = (await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), senha)).user
      await reload(user)
      const account = await readAccount(user)
      if (auth.currentUser?.uid !== account.uid) throw new Error('A sessão foi encerrada. Entre novamente.')
      setUsuario(account)
      if (!account.emailVerificado) {
        // Delivery errors remain visible on the blocking confirmation screen.
        await enviarVerificacaoEmail().catch(() => undefined)
      } else {
        try { await callIdentity('appLoginNotice') }
        catch { setAvisoLogin('Você entrou, mas não foi possível solicitar o aviso de login por e-mail. A empresa precisa verificar o serviço de envio.') }
      }
      if (auth.currentUser?.uid !== account.uid) throw new Error('A sessão foi encerrada. Entre novamente.')
      return account
    } catch (error) {
      if (user) { await signOut(auth).catch(() => undefined); setUsuario(null) }
      throw criarErroFirebase(error)
    }
  }

  async function cadastrar(dados) {
    await ready()
    setAvisoLogin('')
    setVerificacao({ sent: false, error: '', retryAt: 0 })
    let user
    try {
      user = await registerPendingAccount({
        auth, data: dados,
        saveProfile: async user => {
          // Passwords and verification links never enter a profile.
          await saveUserProfile(user.uid, {
            nome: dados.nome, email: user.email, telefone: dados.telefone,
            endereco: dados.endereco, numero: dados.numero, bairro: dados.bairro,
            cep: dados.cep, cidade: dados.cidade, uf: dados.uf, complemento: dados.complemento,
            aceitarMarketing: dados.aceitarMarketing, privacyPolicyVersion: PRIVACY_POLICY_VERSION,
            termsVersion: TERMS_VERSION, consentTimestamp: new Date().toISOString(),
          })
        },
      })
    } catch (error) {
      throw criarErroFirebase(error)
    }
    if (auth.currentUser?.uid !== user.uid) throw new Error('Sua sessão terminou. Entre novamente para confirmar seu e-mail.')
    const account = pendingAccount(user)
    setUsuario(account)
    // Keep a pending registration for retry; never grant access on send failure.
    await enviarVerificacaoEmail().catch(() => undefined)
    if (auth.currentUser?.uid !== user.uid) throw new Error('Sua sessão terminou. Entre novamente para confirmar seu e-mail.')
    return account
  }

  async function conferirVerificacaoEmail() {
    const user = auth?.currentUser
    if (!user) throw new Error('Sua sessão terminou. Entre novamente para confirmar seu e-mail.')
    if (checkInFlight.current?.uid === user.uid) return checkInFlight.current.promise
    const promise = (async () => {
      try {
        if (!await refreshEmailVerification(auth)) return null
        const account = await readAccount(user)
        if (auth.currentUser?.uid !== account.uid) throw new Error('Sua sessão terminou. Entre novamente.')
        setUsuario(account)
        setVerificacao({ sent: false, error: '', retryAt: 0 })
        return account
      } catch (error) { throw criarErroFirebase(error) }
    })()
    checkInFlight.current = { uid: user.uid, promise }
    try { return await promise } finally {
      if (checkInFlight.current?.promise === promise) checkInFlight.current = null
    }
  }

  async function atualizar(dados) {
    if (!usuario?.emailVerificado) throw new Error('Confirme seu e-mail antes de alterar o perfil.')
    try {
      const profile = await updateUserProfile(usuario.uid, dados)
      const finalUser = { ...usuario, ...profile, uid: usuario.uid, admin: usuario.admin, email: usuario.email, emailVerificado: true }
      setUsuario(finalUser)
      return finalUser
    } catch (error) { throw criarErroFirebase(error) }
  }
  async function sair() {
    setUsuario(null)
    setAvisoLogin('')
    setVerificacao({ sent: false, error: '', retryAt: 0 })
    if (auth) await signOut(auth)
  }
  async function enviarRecuperacaoSenha(email) {
    await ready()
    if (!email?.trim()) throw new Error('Digite o e-mail da sua conta.')
    try {
      auth.languageCode = 'pt-BR'
      await sendPasswordResetEmail(auth, email.trim().toLowerCase())
    } catch (error) {
      if (error?.code === 'auth/user-not-found') return
      throw criarErroFirebase(error)
    }
  }
  async function excluirConta(senha) {
    if (!auth?.currentUser || !usuario?.emailVerificado) throw new Error('Entre e confirme seu e-mail para continuar.')
    if (!senha) throw new Error('Digite sua senha para confirmar a exclusão.')
    try {
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, senha))
      await getIdToken(auth.currentUser, true)
      return await deleteUserData(auth.currentUser.uid)
    } catch (error) { throw criarErroFirebase(error) }
  }
  const value = useMemo(() => ({ usuario, loading, autenticado: usuario?.emailVerificado === true,
    firebaseConfigured, verificacao, avisoLogin, entrar, cadastrar, atualizar, sair,
    enviarRecuperacaoSenha, enviarVerificacaoEmail, conferirVerificacaoEmail, excluirConta,
  }), [usuario, loading, verificacao, avisoLogin])
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}
export function useUser() {
  const context = useContext(UserContext)
  if (!context) throw new Error('useUser deve ser usado dentro de UserProvider')
  return context
}
