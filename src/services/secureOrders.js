import { getToken } from 'firebase/app-check'
import { appCheck, auth } from '../firebase.js'

export const secureOrderBackendEnabled = import.meta.env.VITE_SECURE_ORDER_BACKEND === 'true'
const apiBaseUrl = String(import.meta.env.VITE_SECURE_ORDER_API_URL || '').replace(/\/+$/, '')
const QUOTA_BLOCK_KEY = 'pratopronto_worker_quota_block_until'
const CHECKOUT_ATTEMPT_KEY = 'pratopronto_checkout_attempt'
const REQUEST_TIMEOUT_MS = 20_000

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
  if (!appCheck) {
    throw apiError(
      'App Check não foi iniciado neste ambiente. Configure VITE_FIREBASE_APPCHECK_SITE_KEY e, em desenvolvimento, use o modo debug autorizado no Firebase.',
      'app-check-client-not-configured',
      503,
    )
  }

  const quotaBlock = getPurchaseQuotaBlock()
  if (quotaBlock.blocked) {
    throw apiError(quotaBlock.message, 'quota-exhausted', 503, quotaBlock.until)
  }
}

function randomAttemptKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()

  const bytes = new Uint8Array(24)
  globalThis.crypto?.getRandomValues?.(bytes)
  const fallback = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  if (fallback && !/^0+$/.test(fallback)) return fallback

  throw new Error('Seu navegador não oferece geração segura para confirmar a compra.')
}

function checkoutFingerprint(payload) {
  return JSON.stringify(payload)
}

function getOrCreateAttemptKey(payload) {
  const fingerprint = checkoutFingerprint(payload)
  if (typeof window !== 'undefined') {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY) || 'null')
      if (
        saved?.fingerprint === fingerprint
        && typeof saved?.key === 'string'
        && saved.key.length >= 20
        && Number(saved?.createdAt || 0) > Date.now() - 30 * 60 * 1000
      ) {
        return saved.key
      }
    } catch {
      // Uma sessão sem storage ainda pode comprar; apenas perde a recuperação de retry.
    }
  }

  const key = randomAttemptKey()
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify({
        fingerprint,
        key,
        createdAt: Date.now(),
      }))
    } catch {
      // O backend ainda garante idempotência dentro desta tentativa.
    }
  }
  return key
}

function clearAttemptKey() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(CHECKOUT_ATTEMPT_KEY)
  } catch {
    // Sem efeito na segurança do servidor.
  }
}

async function requestHeaders(idempotencyKey) {
  requireApi()
  const idToken = await auth.currentUser.getIdToken()
  const appCheckToken = await getToken(appCheck, false)
  if (!appCheckToken?.token) {
    throw apiError(
      'Não foi possível obter um token válido do App Check. A compra não foi enviada.',
      'app-check-token-unavailable',
      503,
    )
  }

  return {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
    'X-Firebase-AppCheck': appCheckToken.token,
  }
}

function looksLikeCloudflareQuota(response, rawBody) {
  const errorType = response.headers.get('cf-error-type') || ''
  const body = String(rawBody || '').toLowerCase()
  return errorType === '1027'
    || body.includes('error 1027')
    || body.includes('worker exceeded free tier daily request limit')
    || body.includes('exceeded free tier daily request limit')
}

async function callApi(path, payload, idempotencyKey) {
  requireApi()

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: await requestHeaders(idempotencyKey),
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
  } catch (error) {
    if (error?.code?.startsWith?.('app-check-') || error?.code?.startsWith?.('appCheck/')) throw error
    const timedOut = error?.name === 'AbortError'
    throw apiError(
      timedOut
        ? 'A confirmação segura demorou demais. A compra não será repetida automaticamente. Tente confirmar novamente; o servidor reconhecerá a mesma tentativa para evitar pedido duplicado.'
        : 'O serviço seguro de pedidos está indisponível no momento. A compra não foi enviada. Tente novamente em alguns instantes.',
      timedOut ? 'backend-timeout' : 'backend-unavailable',
      503,
    )
  } finally {
    window.clearTimeout(timeout)
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
        'Muitas tentativas de compra foram feitas em pouco tempo. Aguarde um minuto e tente novamente.',
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
  const payload = {
    itens: items,
    observacao,
    paymentMethod,
  }
  const idempotencyKey = getOrCreateAttemptKey(payload)
  const result = await callApi('/orders', payload, idempotencyKey)
  clearAttemptKey()
  return result
}
