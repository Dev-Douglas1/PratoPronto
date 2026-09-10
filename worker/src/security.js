import { ApiError, cleanText } from './domain.js'

const FIREBASE_AUTH_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
const APP_CHECK_JWKS = 'https://firebaseappcheck.googleapis.com/v1/jwks'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

let firebaseAuthJwksCache = null
let appCheckJwksCache = null
let googleAccessTokenCache = null

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function base64UrlEncodeBytes(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlEncodeJson(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)))
}

function decodeJwt(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) throw new ApiError(401, 'invalid-token', 'Token inválido.')
  try {
    return {
      parts,
      header: JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))),
      payload: JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))),
    }
  } catch {
    throw new ApiError(401, 'invalid-token', 'Token inválido.')
  }
}

async function getJwks(url, type) {
  const now = Date.now()
  const current = type === 'auth' ? firebaseAuthJwksCache : appCheckJwksCache
  if (current?.expiresAt > now) return current.value

  const response = await fetch(url, { cf: { cacheTtl: 21600, cacheEverything: true } })
  if (!response.ok) throw new ApiError(503, 'jwks-unavailable', 'Não foi possível validar a segurança da requisição.')
  const value = await response.json()
  const cache = { value, expiresAt: now + 6 * 60 * 60 * 1000 }
  if (type === 'auth') firebaseAuthJwksCache = cache
  else appCheckJwksCache = cache
  return value
}

async function verifyJwt(token, jwksUrl, type) {
  const decoded = decodeJwt(token)
  if (decoded.header.alg !== 'RS256' || !decoded.header.kid) {
    throw new ApiError(401, 'invalid-token', 'Token de segurança inválido.')
  }

  const jwks = await getJwks(jwksUrl, type)
  const jwk = (jwks.keys || []).find((item) => item.kid === decoded.header.kid)
  if (!jwk) {
    if (type === 'auth') firebaseAuthJwksCache = null
    else appCheckJwksCache = null
    throw new ApiError(401, 'unknown-key', 'Token de segurança expirado ou inválido.')
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const signature = base64UrlDecode(decoded.parts[2])
  const data = new TextEncoder().encode(`${decoded.parts[0]}.${decoded.parts[1]}`)
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data)
  if (!valid) throw new ApiError(401, 'invalid-signature', 'Token de segurança inválido.')
  return decoded.payload
}

export async function verifyFirebaseUser(request, env) {
  const authorization = request.headers.get('Authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) throw new ApiError(401, 'unauthenticated', 'Faça login para continuar.')

  const claims = await verifyJwt(token, FIREBASE_AUTH_JWKS, 'auth')
  const now = Math.floor(Date.now() / 1000)
  if (
    claims.aud !== env.FIREBASE_PROJECT_ID
    || claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`
    || !claims.sub
    || claims.exp <= now
    || claims.iat > now + 300
  ) {
    throw new ApiError(401, 'invalid-auth', 'Sua sessão é inválida ou expirou. Entre novamente.')
  }
  if (claims.email_verified !== true) {
    throw new ApiError(403, 'email-not-verified', 'Verifique seu e-mail antes de fazer pedidos.')
  }

  return {
    uid: claims.sub,
    email: cleanText(claims.email, 254).toLowerCase(),
  }
}

export async function verifyAppCheck(request, env) {
  if (String(env.REQUIRE_APP_CHECK || 'false').toLowerCase() !== 'true') return null
  const projectNumber = cleanText(env.FIREBASE_PROJECT_NUMBER, 30)
  if (!projectNumber || projectNumber.includes('COLOQUE')) {
    throw new ApiError(503, 'app-check-config', 'App Check ainda não foi configurado no backend.')
  }

  const token = request.headers.get('X-Firebase-AppCheck') || ''
  if (!token) throw new ApiError(401, 'app-check-required', 'App Check obrigatório.')
  const claims = await verifyJwt(token, APP_CHECK_JWKS, 'appcheck')
  const now = Math.floor(Date.now() / 1000)
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (
    claims.iss !== `https://firebaseappcheck.googleapis.com/${projectNumber}`
    || !audiences.includes(`projects/${projectNumber}`)
    || !claims.sub
    || claims.exp <= now
  ) {
    throw new ApiError(401, 'invalid-app-check', 'App Check inválido ou expirado.')
  }
  return claims.sub
}

function pemToArrayBuffer(pem) {
  const base64 = String(pem || '')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  if (!base64) throw new ApiError(500, 'service-account-config', 'Credencial do Firebase não configurada no backend.')
  const binary = atob(base64)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer
}

function serviceAccountFromEnv(env) {
  try {
    const value = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}')
    if (!value.client_email || !value.private_key || !value.project_id) throw new Error('incomplete')
    if (value.project_id !== env.FIREBASE_PROJECT_ID) throw new Error('project-mismatch')
    return value
  } catch {
    throw new ApiError(500, 'service-account-config', 'Credencial privada do Firebase não configurada corretamente no Worker.')
  }
}

async function createServiceAccountAssertion(serviceAccount) {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${base64UrlEncodeJson({ alg: 'RS256', typ: 'JWT' })}.${base64UrlEncodeJson({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${base64UrlEncodeBytes(new Uint8Array(signature))}`
}

export async function getGoogleAccessToken(env) {
  const now = Date.now()
  if (googleAccessTokenCache?.expiresAt > now + 60_000) return googleAccessTokenCache.token

  const serviceAccount = serviceAccountFromEnv(env)
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await createServiceAccountAssertion(serviceAccount),
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.access_token) {
    throw new ApiError(503, 'google-auth-failed', 'Não foi possível autenticar o backend no Firestore.')
  }

  googleAccessTokenCache = {
    token: result.access_token,
    expiresAt: now + Number(result.expires_in || 3600) * 1000,
  }
  return googleAccessTokenCache.token
}
