import { getToken } from 'firebase/app-check'
import { appCheck, auth } from '../firebase.js'

export const secureOrderBackendEnabled = import.meta.env.VITE_SECURE_ORDER_BACKEND === 'true'
const apiBaseUrl = String(import.meta.env.VITE_SECURE_ORDER_API_URL || '').replace(/\/+$/, '')

function requireApi() {
  if (!apiBaseUrl) {
    throw new Error('Backend seguro não configurado. Defina VITE_SECURE_ORDER_API_URL antes de ativá-lo.')
  }
  if (!auth?.currentUser) throw new Error('Faça login novamente para continuar.')
}

async function requestHeaders() {
  requireApi()
  const idToken = await auth.currentUser.getIdToken()
  const headers = {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  }

  if (appCheck) {
    const appCheckToken = await getToken(appCheck, false)
    if (appCheckToken?.token) headers['X-Firebase-AppCheck'] = appCheckToken.token
  }
  return headers
}

async function callApi(path, payload) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result?.error?.message || 'Não foi possível validar o pedido no servidor.')
  }
  return result
}

export async function quoteSecureOrder(items) {
  return callApi('/quote', { itens: items })
}

export async function createSecureOrder({ items, observacao = '', paymentMethod = 'cash-on-delivery' }) {
  return callApi('/orders', {
    itens: items,
    observacao,
    paymentMethod,
  })
}
