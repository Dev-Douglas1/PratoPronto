import { inMemoryPersistence, setPersistence, signOut } from 'firebase/auth'

export async function startPrivateSession(auth) {
  await setPersistence(auth, inMemoryPersistence)
  // Remove a session restored from an older version before UI authorization.
  await signOut(auth)
}
