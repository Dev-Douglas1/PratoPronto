import { getToken } from 'firebase/app-check'
import { appCheck, auth } from '../firebase.js'

export const secureOrderBackendEnabled = import.meta.env.VITE_SECURE_ORDER_BACKEND === 'true'
const apiBaseUrl = String(import.meta.env.VITE_SECURE_ORDER_API_URL || '').replace(/\/+$/, '')
const QUOTA_BLOCK_KEY = 'pratopronto_worker_quota_block_until'

function nextCloudflareReset() {
  const now = new Date()
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0,
  ))
}

function readQuotaBlockUntil() {
  if (typeof window === 'undefined') return null
  try {
    const value = Number(window.localStorage.getItem(QUOTA_BLOCK_KEY) || 0)
    if (!Number.isFinite(value) || value <= Date.now()) {
      window.localStorage.removeItem(QUOTA_BLOCK_KEY)
      return null
    }
    return new Date(value)
  } catch {
    return null
  }
}

function saveQuotaBlockUntil(date) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(QUOTA_BLOCK_KEY, String(date.getTime()))
  } catch {
    // Se o navegador bloquear localStorage, o próprio backend ainda falhará fechado.
  }
}

function quotaMessage(until) {
  const formatted = until.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `Compras temporariamente bloqueadas porque o limite diário do backend foi atingido. Tente novamente após ${formatted}. O cardápio continua disponível normalmente.`
}

function apiError(message, code, status, blockedUntil = null) {
  const error = new Error(message)
  error.code = code
  error.status = status
  error.blockedUntil = blockedUntil
  return error
}

export function getPurchaseQuotaBlock() {
  const blockedUntil = readQuotaBlockUntil()
  return blockedUntil
    ? { blocked: true, until: blockedUntil, message: quotaMessage(blockedUntil) }
    : { blocked: false, until: null, message: '' }
}

function requireApi() {
  if (!apiBaseUrl) {
    throw new Error('Backend seguro não configurado. Defina VITE_SECURE_ORDER_API_URL antes de ativá-lo.')
  }
  if (!auth?.currentUser) throw new Error('Faça login novamente para continuar.')

  const quotaBlock = getPurchaseQuotaBlock()
  if (quotaBlock.blocked) {
    throw apiError(quotaBlock.message, 'quota-exhausted', 503, quotaBlock.until)
  }
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

function looksLikeCloudflareQuota(response, rawBody) {
  const errorType = response.headers.get('cf-error-type') || ''
  const body = String(rawBody || '').toLowerCase()
  return errorType === '1027'
    || body.includes('error 1027')
    || body.includes('worker exceeded free tier daily request limit')
    || body.includes('exceeded free tier daily request limit')
}

async function callApi(path, payload) {
  requireApi()

  let response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: await requestHeaders(),
      body: JSON.stringify(payload),
    })
  } catch {
    throw apiError(
      'O serviço seguro de pedidos está indisponível no momento. A compra não foi enviada. Tente novamente em alguns instantes.',
      'backend-unavailable',
      503,
    )
  }

  const rawBody = await response.text().catch(() => '')
  let result = {}
  try {
    result = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    result = {}
  }

  if (!response.ok) {
    if (looksLikeCloudflareQuota(response, rawBody)) {
      const blockedUntil = nextCloudflareReset()
      saveQuotaBlockUntil(blockedUntil)
      throw apiError(quotaMessage(blockedUntil), 'quota-exhausted', response.status, blockedUntil)
    }

    if (response.status === 429) {
      throw apiError(
        'Muitas tentativas de compra foram feitas em pouco tempo. Aguarde alguns minutos e tente novamente.',
        'rate-limited',
        429,
      )
    }

    throw apiError(
      result?.error?.message || 'Não foi possível validar o pedido no servidor. A compra não foi enviada.',
      result?.error?.code || 'backend-error',
      response.status,
    )
  }
  return result
}

export async function createSecureOrder({ items, observacao = '', paymentMethod = 'cash-on-delivery' }) {
  return callApi('/orders', {
    itens: items,
    observacao,
    paymentMethod,
  })
}
