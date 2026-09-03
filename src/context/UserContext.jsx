import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  reauthenticateWithCredential,
} from 'firebase/auth'
import { auth, firebaseConfigured } from '../firebase.js'
import {
  deleteUserData,
  getUserProfile,
  PRIVACY_POLICY_VERSION,
  saveUserProfile,
  TERMS_VERSION,
  updateUserProfile,
} from '../services/storage.js'
import { criarErroFirebase } from '../utils/firebaseError.js'

const UserContext = createContext(null)

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
        const profile = await getUserProfile(firebaseUser.uid)
        setUsuario({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          nome: profile?.nome || firebaseUser.displayName || '',
          ...profile,
        })
      } catch {
        setUsuario({ uid: firebaseUser.uid, email: firebaseUser.email, nome: firebaseUser.displayName || '' })
      } finally {
        setLoading(false)
      }
    })
  }, [])

  async function entrar(email, senha) {
    if (!firebaseConfigured || !auth) throw new Error('Firebase não configurado.')
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), senha)
      const profile = await getUserProfile(credential.user.uid)
      const finalUser = {
        uid: credential.user.uid,
        email: credential.user.email,
        nome: profile?.nome || credential.user.displayName || '',
        ...profile,
      }
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

      // A senha nunca é enviada ao Firestore. Ela é processada apenas pelo
      // Firebase Authentication, que mantém a credencial protegida.
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
      const finalUser = { uid: novoUsuario.uid, ...profile }
      setUsuario(finalUser)
      return finalUser
    } catch (error) {
      // Evita conta incompleta caso a gravação do perfil falhe depois que o
      // usuário foi criado no Authentication.
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
