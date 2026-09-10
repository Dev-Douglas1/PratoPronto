import { ApiError } from './domain.js'
import { getGoogleAccessToken } from './security.js'

function databaseName(env) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)`
}

export function documentName(env, path) {
  return `${databaseName(env)}/documents/${path}`
}

function documentUrl(env, path, transaction = '') {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const base = `https://firestore.googleapis.com/v1/${databaseName(env)}/documents/${encodedPath}`
  return transaction ? `${base}?transaction=${encodeURIComponent(transaction)}` : base
}

function encodeValue(value) {
  if (value && typeof value === 'object' && value.__firestoreTimestamp) {
    return { timestampValue: value.__firestoreTimestamp }
  }
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ApiError(500, 'invalid-number', 'Número inválido ao preparar o pedido.')
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } }
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } }
  return { stringValue: String(value) }
}

export function encodeFields(object) {
  const fields = {}
  Object.entries(object || {}).forEach(([key, value]) => {
    if (value !== undefined) fields[key] = encodeValue(value)
  })
  return fields
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return null
  if ('nullValue' in value) return null
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue)
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {})
  return null
}

function decodeFields(fields) {
  const result = {}
  Object.entries(fields || {}).forEach(([key, value]) => {
    result[key] = decodeValue(value)
  })
  return result
}

async function requestFirestore(env, url, options = {}) {
  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${await getGoogleAccessToken(env)}`)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return fetch(url, { ...options, headers })
}

export async function getDocument(env, path, transaction = '') {
  const response = await requestFirestore(env, documentUrl(env, path, transaction))
  if (response.status === 404) {
    return { exists: false, id: path.split('/').pop(), data: null, name: documentName(env, path) }
  }
  if (!response.ok) throw new ApiError(503, 'firestore-read-failed', 'Não foi possível consultar os dados do pedido.')

  const document = await response.json()
  return {
    exists: true,
    id: path.split('/').pop(),
    data: decodeFields(document.fields || {}),
    name: document.name,
    updateTime: document.updateTime,
  }
}

export async function beginTransaction(env) {
  const url = `https://firestore.googleapis.com/v1/${databaseName(env)}/documents:beginTransaction`
  const response = await requestFirestore(env, url, { method: 'POST', body: JSON.stringify({}) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.transaction) {
    throw new ApiError(503, 'transaction-start-failed', 'Não foi possível iniciar a confirmação segura do pedido.')
  }
  return result.transaction
}

export async function rollbackTransaction(env, transaction) {
  if (!transaction) return
  const url = `https://firestore.googleapis.com/v1/${databaseName(env)}/documents:rollback`
  await requestFirestore(env, url, {
    method: 'POST',
    body: JSON.stringify({ transaction }),
  }).catch(() => undefined)
}

export async function commitTransaction(env, transaction, writes) {
  const url = `https://firestore.googleapis.com/v1/${databaseName(env)}/documents:commit`
  const response = await requestFirestore(env, url, {
    method: 'POST',
    body: JSON.stringify({ transaction, writes }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const status = String(result?.error?.status || '')
    if (status === 'ABORTED' || response.status === 409) {
      throw new ApiError(409, 'order-conflict', 'O estoque mudou enquanto o pedido era confirmado. Tente novamente.')
    }
    throw new ApiError(503, 'firestore-write-failed', 'Não foi possível gravar o pedido com segurança.')
  }
  return result
}

export function timestampNow() {
  return { __firestoreTimestamp: new Date().toISOString() }
}
