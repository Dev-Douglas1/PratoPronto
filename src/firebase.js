import { getApps, initializeApp } from 'firebase/app'
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { startPrivateSession } from './services/auth-session.js'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,

  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,

  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID,

  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,

  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,

  appId:
    import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
)

const app = firebaseConfigured
  ? getApps()[0] ?? initializeApp(firebaseConfig)
  : null

const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY

function configureAppCheck() {
  if (!app || !appCheckSiteKey || typeof window === 'undefined') return null

  try {
    return initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  } catch (error) {
    if (error?.code === 'appCheck/already-initialized') return null
    throw error
  }
}

export const appCheck = configureAppCheck()

export const auth =
  app ? getAuth(app) : null

// Clear legacy persistent sessions before any account can appear in the UI.
// New credentials live only in this running page, not in browser storage.
export const authReady = auth
  ? startPrivateSession(auth)
  : Promise.resolve()
// The provider and explicit sign-in calls surface failures; avoid an unhandled
// rejection while the React bundle is still loading.
authReady.catch(() => undefined)

export const db =
  app ? getFirestore(app) : null

export default app
