import { createUserWithEmailAndPassword, deleteUser, signOut, updateProfile } from 'firebase/auth'

import { validateName, validatePassword, validatePhone } from '../../functions/src/input-policy.js'

export async function registerPendingAccount({ auth, data, saveProfile }) {
  // Firebase Authentication creates a pending account. Its own email service
  // sends the confirmation link; registration does not call the Resend backend.
  validateName(data.nome)
  validatePhone(data.telefone)
  validatePassword(data.senha)
  let user
  try {
    user = (await createUserWithEmailAndPassword(auth, data.email.trim().toLowerCase(), data.senha)).user
    await updateProfile(user, { displayName: data.nome.trim() })
    await saveProfile(user)
    return user
  } catch (error) {
    if (user && auth.currentUser?.uid === user.uid) {
      try { await deleteUser(user) } catch { await signOut(auth).catch(() => undefined) }
    }
    throw error
  }
}
