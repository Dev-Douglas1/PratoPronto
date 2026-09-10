import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getIdTokenResult,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth, firebaseConfigured } from '../firebase.js'
import {
  deleteUserData,
  getAdminAccess,
  getUserProfile,
  PRIVACY_POLICY_VERSION,
  saveUserProfile,
  TERMS_VERSION,
  updateUserProfile,
} from '../services/storage.js'
import { criarErroFirebase } from '../utils/firebaseError.js'

const UserContext = createContext(null)

async function usarSessaoDoNavegador() {
  if (!auth) return
  await setPersistence(auth, browserSessionPersistence)
}

function adminErrorMessage(error) {
  const code = String(error?.code || '')
  if (code.includes('permission-denied')) {
    return 'Não foi possível consultar sua permissão de empresa. Verifique App Check e as regras do Firestore.'
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return 'Não foi possível consultar sua permissão de empresa por falha de conexão.'
  }
  return error?.message || 'Não foi possível consultar sua permissão de empresa.'
}

async function getAdminIdentity(firebaseUser) {
  let admin = null
  let adminAccessError = ''

  try {
    admin = await getAdminAccess(firebaseUser.uid)
  } catch (error) {
    adminAccessError = adminErrorMessage(error)
    console.error('[PratoPronto] Falha ao consultar admins/{uid}.', error)
  }

  const tokenResult = await getIdTokenResult(firebaseUser).catch((error) => {
    console.error('[PratoPronto] Falha ao consultar claims administrativas.', error)
    return null
  })

  const claimAdmin = tokenResult?.claims?.restaurant_admin === true
  const documentAdmin = admin?.role === 'restaurant_admin'

  return {
    admin,
    adminCandidate: claimAdmin || documentAdmin,
    adminAccessError,
  }
}

async function buildUser(firebaseUser) {
  const profile = await getUserProfile(firebaseUser.uid).catch(() => null)
  const { admin, adminCandidate, adminAccessError } = await getAdminIdentity(firebaseUser)
  const isAdmin = Boolean(firebaseUser.emailVerified && adminCandidate)

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    nome: profile?.nome || firebaseUser.displayName || '',
    emailVerified: firebaseUser.emailVerified,
    ...profile,
    adminCandidate,
    adminAccessError,
    admin: isAdmin,
    role: isAdmin ? 'restaurant_admin' : 'customer',
    permissions: isAdmin ? (admin?.permissions ?? []) : [],
  }
}

export function UserProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [loading, setLoading] = useState(firebaseConfigured)

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setLoading(false)
      return undefined
    }

    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUsuario(null)
        setLoading(false)
        return
      }

      try {
        setUsuario(await buildUser(firebaseUser))
      } catch (error) {
        console.error('[PratoPronto] Não foi possível carregar completamente a sessão.', error)
        setUsuario({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          nome: firebaseUser.displayName || '',
          emailVerified: firebaseUser.emailVerified,
          adminCandidate: false,
          adminAccessError: 'Não foi possível carregar completamente sua sessão. Atualize a página e tente novamente.',
          admin: false,
          role: 'customer',
          permissions: [],
        })
      } finally {
        setLoading(false)
      }
    })
  }, [])

  async function entrar(email, senha) {
    if (!firebaseConfigured || !auth) throw new Error('Firebase não configurado.')
    try {
      await usarSessaoDoNavegador()
      const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), senha)
      const finalUser = await buildUser(credential.user)
      setUsuario(finalUser)
      return finalUser
    } catch (error) {
      throw criarErroFirebase(error)
    }
  }

  async function cadastrar(dados) {
    if (!firebaseConfigured || !auth) throw new Error('Firebase não configurado.')
    let novoUsuario = null

    try {
      await usarSessaoDoNavegador()
      const credential = await createUserWithEmailAndPassword(
        auth,
        dados.email.trim().toLowerCase(),
        dados.senha,
      )
      novoUsuario = credential.user

      await updateProfile(novoUsuario, { displayName: dados.nome.trim() })
      await sendEmailVerification(novoUsuario)

      const profile = await saveUserProfile(novoUsuario.uid, {
        nome: dados.nome,
        email: credential.user.email,
        telefone: dados.telefone,
        endereco: dados.endereco,
        numero: dados.numero,
        bairro: dados.bairro,
        complemento: dados.complemento,
        aceitarMarketing: dados.aceitarMarketing,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        termsVersion: TERMS_VERSION,
        consentTimestamp: new Date().toISOString(),
      })

      const finalUser = {
        uid: novoUsuario.uid,
        ...profile,
        emailVerified: novoUsuario.emailVerified,
        adminCandidate: false,
        adminAccessError: '',
        admin: false,
        role: 'customer',
        permissions: [],
      }
      setUsuario(finalUser)
      return finalUser
    } catch (error) {
      if (novoUsuario && auth.currentUser?.uid === novoUsuario.uid) {
        try {
          await deleteUser(novoUsuario)
        } catch {
          await signOut(auth).catch(() => undefined)
        }
      }
      throw criarErroFirebase(error)
    }
  }

  async function atualizar(dados) {
    if (!usuario?.uid) throw new Error('Usuário não autenticado.')
    try {
      const profile = await updateUserProfile(usuario.uid, {
        nome: dados.nome,
        telefone: dados.telefone,
        endereco: dados.endereco,
        numero: dados.numero,
        bairro: dados.bairro,
        complemento: dados.complemento,
        aceitarMarketing: Boolean(dados.aceitarMarketing),
      })
      const finalUser = { ...usuario, ...profile }
      setUsuario(finalUser)
      return finalUser
    } catch (error) {
      throw criarErroFirebase(error)
    }
  }

  async function recuperarSenha(email) {
    if (!firebaseConfigured || !auth) throw new Error('Firebase não configurado.')
    if (!email?.trim()) throw new Error('Digite seu e-mail primeiro.')
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase())
    } catch (error) {
      throw criarErroFirebase(error)
    }
  }

  async function reenviarVerificacao() {
    if (!auth?.currentUser) throw new Error('Usuário não autenticado.')
    try {
      await sendEmailVerification(auth.currentUser)
    } catch (error) {
      throw criarErroFirebase(error)
    }
  }

  async function atualizarSessao() {
    if (!auth?.currentUser) throw new Error('Usuário não autenticado.')
    try {
      await reload(auth.currentUser)
      await auth.currentUser.getIdToken(true)
      const finalUser = await buildUser(auth.currentUser)
      setUsuario(finalUser)
      return finalUser
    } catch (error) {
      throw criarErroFirebase(error)
    }
  }

  async function sair() {
    if (auth) await signOut(auth)
    setUsuario(null)
  }

  async function excluirConta(senha) {
    if (!auth?.currentUser) throw new Error('Usuário não autenticado.')
    if (usuario?.adminCandidate) {
      throw new Error('Contas empresariais não podem ser excluídas pelo aplicativo. Revogue primeiro o acesso administrativo em ambiente seguro.')
    }
    if (!senha) throw new Error('Digite sua senha para confirmar a exclusão.')
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, senha)
      await reauthenticateWithCredential(auth.currentUser, credential)
      const uid = auth.currentUser.uid
      await deleteUserData(uid)
      await deleteUser(auth.currentUser)
      setUsuario(null)
    } catch (error) {
      throw criarErroFirebase(error)
    }
  }

  const value = useMemo(
    () => ({
      usuario,
      loading,
      autenticado: Boolean(usuario),
      firebaseConfigured,
      entrar,
      cadastrar,
      atualizar,
      recuperarSenha,
      reenviarVerificacao,
      atualizarSessao,
      sair,
      excluirConta,
    }),
    [usuario, loading],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) throw new Error('useUser deve ser usado dentro de UserProvider')
  return context
}
