import { getIdTokenResult, reload, sendEmailVerification } from 'firebase/auth'

function requireSession(auth, user) {
  if (!user || auth?.currentUser?.uid !== user.uid) {
    const error = new Error('Entre novamente para confirmar seu e-mail.')
    error.code = 'auth/user-token-expired'
    throw error
  }
}

export async function refreshEmailVerification(auth) {
  const user = auth?.currentUser
  requireSession(auth, user)
  await reload(user)
  requireSession(auth, user)
  if (!user.emailVerified) return false
  // Refresh the signed claim used by Firestore; a local flag or button alone
  // must never grant access to a pending account.
  const { claims } = await getIdTokenResult(user, true)
  requireSession(auth, user)
  return claims.email_verified === true && claims.email === user.email
}

export async function sendVerificationLink(auth) {
  const user = auth?.currentUser
  requireSession(auth, user)
  if (await refreshEmailVerification(auth)) return { verified: true, sent: false }
  requireSession(auth, user)
  auth.languageCode = 'pt-BR'
  // Use Firebase's hosted action handler and default sender. No custom email
  // domain, Cloud Function, client-generated code or return URL is required.
  await sendEmailVerification(user)
  requireSession(auth, user)
  return { sent: true, retryAfterSeconds: 60 }
}
