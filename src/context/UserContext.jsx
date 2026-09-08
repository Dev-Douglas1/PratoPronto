import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth, firebaseConfigured } from '../firebase.js'
import {
  deleteUserData,
  ensureTestAdminAccess,
  getAdminAccess,
  getUserProfile,
  PRIVACY_POLICY_VERSION,
  saveUserProfile,
  TERMS_VERSION,
  TEST_ADMIN_EMAIL,
  updateUserProfile,
} from '../services/storage.js'
import { criarErroFirebase } from '../utils/firebaseError.js'

const UserContext = createContext(null)

function candidatoAdmin(firebaseUser, admin) {
  return admin?.role === 'restaurant_admin' || firebaseUser?.email?.toLowerCase() === TEST_ADMIN_EMAIL
}

function adminPermitido(firebaseUser, admin) {
  return Boolean(firebaseUser?.emailVerified && candidatoAdmin(firebaseUser, admin))
}

async function buildUser(firebaseUser) {
  const profile = await getUserProfile(firebaseUser.uid).catch(() => null)
  let admin = await getAdminAccess(firebaseUser.uid).catch(() => null)

  if (!admin && firebaseUser.emailVerified && firebaseUser.email?.toLowerCase() === TEST_ADMIN_EMAIL) {
    admin = await ensureTestAdminAccess(firebaseUser.uid, firebaseUser.email).catch(() => null)
  }

  const adminCandidate = candidatoAdmin(firebaseUser, admin)
  const isAdmin = adminPermitido(firebaseUser, admin)

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    nome: profile?.nome || firebaseUser.displayName || '',
    emailVerified: firebaseUser.emailVerified,
    ...profile,
    adminCandidate,
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
      } catch {
        const adminCandidate = firebaseUser.email?.toLowerCase() === TEST_ADMIN_EMAIL
        const isAdmin = Boolean(firebaseUser.emailVerified && adminCandidate)
        setUsuario({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          nome: firebaseUser.displayName || '',
          emailVerified: firebaseUser.emailVerified,
          adminCandidate,
          admin: isAdmin,
          role: isAdmin ? 'restaurant_admin' : 'customer',
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
      const credential = await createUserWithEmailAndPassword(
        auth,
        dados.email.trim().toLowerCase(),
        dados.senha,
      )
      novoUsuario = credential.user

      await updateProfile(novoUsuario, { displayName: dados.nome.trim() })

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

      await sendEmailVerification(novoUsuario).catch(() => undefined)
      const adminCandidate = novoUsuario.email?.toLowerCase() === TEST_ADMIN_EMAIL
      const finalUser = {
        uid: novoUsuario.uid,
        ...profile,
        emailVerified: novoUsuario.emailVerified,
        adminCandidate,
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
