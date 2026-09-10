import { getApps, initializeApp } from 'firebase/app'
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
)

if (!firebaseConfigured) {
  console.warn('[PratoPronto] Firebase não configurado neste ambiente. Login, pedidos e área da empresa ficarão indisponíveis.')
}

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

    // App Check é uma camada adicional. Uma configuração incorreta não deve
    // impedir a interface inteira de abrir e produzir uma tela preta.
    console.error('[PratoPronto] Não foi possível iniciar o Firebase App Check.', error)
    return null
  }
}

export const appCheck = configureAppCheck()

export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const functions = app ? getFunctions(app) : null

export default app
