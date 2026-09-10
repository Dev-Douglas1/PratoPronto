import {
  ApiError,
  buildCanonicalOrder,
  canonicalCustomer,
  cleanText,
  effectiveDeliveryConfig,
  orderQuote,
  parseItems,
} from './domain.js'
import {
  beginTransaction,
  commitTransaction,
  documentName,
  encodeFields,
  getDocument,
  rollbackTransaction,
  timestampNow,
} from './firestore.js'
import { verifyAppCheck, verifyFirebaseUser } from './security.js'

async function parseJsonBody(request) {
  const length = Number(request.headers.get('Content-Length') || 0)
  if (length > 64 * 1024) throw new ApiError(413, 'payload-too-large', 'Pedido grande demais.')
  try {
    return await request.json()
  } catch {
    throw new ApiError(400, 'invalid-json', 'Dados do pedido inválidos.')
  }
}

async function loadOrderContext(env, uid, parsedItems, transaction = '') {
  const uniqueIds = [...new Set(parsedItems.map((item) => item.id))]
  const [profile, delivery, ...catalogDocs] = await Promise.all([
    getDocument(env, `users/${uid}`, transaction),
    getDocument(env, 'settings/delivery', transaction),
    ...uniqueIds.map((id) => getDocument(env, `catalog/${id}`, transaction)),
  ])

  if (!profile.exists) throw new ApiError(409, 'profile-incomplete', 'Complete seu perfil antes de fazer o pedido.')
  return {
    profile: profile.data,
    deliveryConfig: effectiveDeliveryConfig(delivery),
    catalog: new Map(catalogDocs.map((snapshot) => [snapshot.id, snapshot])),
  }
}

function requestIp(request) {
  const raw = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || 'unknown'
  return cleanText(String(raw).split(',')[0], 80) || 'unknown'
}

async function enforceIpRateLimit(request, env) {
  if (!env.IP_RATE_LIMITER) {
    throw new ApiError(503, 'rate-limit-config', 'A proteção contra excesso de requisições não está configurada.')
  }

  const result = await env.IP_RATE_LIMITER.limit({ key: `checkout:${requestIp(request)}` })
  if (!result.success) {
    throw new ApiError(
      429,
      'rate-limited',
      'Muitas tentativas de compra foram feitas desta conexão. Aguarde um minuto e tente novamente.',
    )
  }
}

async function enforceUserRateLimit(user, env) {
  if (!env.USER_ORDER_RATE_LIMITER) {
    throw new ApiError(503, 'rate-limit-config', 'A proteção de pedidos por usuário não está configurada.')
  }

  const result = await env.USER_ORDER_RATE_LIMITER.limit({ key: `checkout:${user.uid}` })
  if (!result.success) {
    throw new ApiError(
      429,
      'rate-limited',
      'Sua conta fez muitas tentativas de compra em pouco tempo. Aguarde um minuto e tente novamente.',
    )
  }
}

async function createOrderOnce(body, env, user) {
  const parsedItems = parseItems(body.itens)
  if (String(body.paymentMethod || 'cash-on-delivery') !== 'cash-on-delivery') {
    throw new ApiError(409, 'payment-not-supported', 'Somente pagamento na entrega está disponível nesta versão.')
  }

  const transaction = await beginTransaction(env)
  try {
    const context = await loadOrderContext(env, user.uid, parsedItems, transaction)
    const canonical = buildCanonicalOrder(parsedItems, context.catalog, context.profile, context.deliveryConfig)
    const customer = canonicalCustomer(user, context.profile)
    const orderId = crypto.randomUUID().replace(/-/g, '')
    const now = timestampNow()
    const writes = []

    for (const [productId, quantity] of canonical.stockNeeded.entries()) {
      const snapshot = context.catalog.get(productId)
      const stock = Number(snapshot?.data?.stock)
      if (!snapshot?.exists || !Number.isFinite(stock) || stock < 0) continue

      const nextStock = Math.floor(stock) - quantity
      if (nextStock < 0) throw new ApiError(409, 'order-conflict', 'O estoque mudou. Atualize o pedido e tente novamente.')
      writes.push({
        update: {
          name: snapshot.name,
          fields: encodeFields({
            stock: nextStock,
            available: nextStock > 0 && snapshot.data.available !== false,
            updatedAt: now,
          }),
        },
        updateMask: { fieldPaths: ['stock', 'available', 'updatedAt'] },
        currentDocument: { exists: true },
      })
    }

    const quote = orderQuote(canonical)
    const payload = {
      ...customer,
      itens: canonical.itens,
      subtotal: quote.subtotal,
      deliveryFee: quote.deliveryFee,
      total: quote.total,
      observacao: cleanText(body.observacao, 500),
      pagamento: {
        metodo: 'Pagamento na entrega',
        referencia: `entrega-${orderId}`,
      },
      paymentStatus: 'pending_delivery',
      status: 'recebido',
      cancelReason: '',
      refundStatus: 'none',
      refundReason: '',
      assignedCourier: '',
      restaurantNotes: '',
      serverValidated: true,
      orderSchemaVersion: 3,
      backendProvider: 'cloudflare-workers',
      createdAt: now,
      updatedAt: now,
    }

    writes.push({
      update: {
        name: documentName(env, `orders/${orderId}`),
        fields: encodeFields(payload),
      },
      currentDocument: { exists: false },
    })

    await commitTransaction(env, transaction, writes)
    return {
      id: orderId,
      ...quote,
      status: payload.status,
      paymentStatus: payload.paymentStatus,
      serverValidated: true,
    }
  } catch (error) {
    await rollbackTransaction(env, transaction)
    throw error
  }
}

async function createOrder(request, env, user) {
  const body = await parseJsonBody(request)
  try {
    return await createOrderOnce(body, env, user)
  } catch (error) {
    if (error?.code === 'order-conflict') return createOrderOnce(body, env, user)
    throw error
  }
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin')
  if (!origin) return true
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (allowed.includes(origin)) return true
  if (String(env.ALLOW_CODESPACES || 'false').toLowerCase() !== 'true') return false
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' && url.hostname.endsWith('.app.github.dev')
  } catch {
    return false
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin')
  const headers = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Firebase-AppCheck',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  }
  if (origin && originAllowed(request, env)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function jsonResponse(request, env, body, status = 200) {
  const headers = corsHeaders(request, env)
  if (status === 429) headers['Retry-After'] = '60'
  return new Response(JSON.stringify(body), { status, headers })
}

async function handleRequest(request, env) {
  if (!env.FIREBASE_PROJECT_ID) throw new ApiError(500, 'project-config', 'FIREBASE_PROJECT_ID não configurado no Worker.')
  if (!originAllowed(request, env)) throw new ApiError(403, 'origin-not-allowed', 'Origem não autorizada.')

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) })

  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/health') {
    return jsonResponse(request, env, {
      ok: true,
      service: 'pratopronto-api',
      backend: 'cloudflare-workers-free',
      appCheckRequired: String(env.REQUIRE_APP_CHECK || 'false').toLowerCase() === 'true',
      checkoutRateLimit: {
        perIpPerMinute: 10,
        perUserPerMinute: 3,
      },
    })
  }

  if (request.method !== 'POST') throw new ApiError(405, 'method-not-allowed', 'Método não permitido.')
  if (url.pathname !== '/orders') throw new ApiError(404, 'not-found', 'Endpoint não encontrado.')

  await enforceIpRateLimit(request, env)
  const user = await verifyFirebaseUser(request, env)
  await verifyAppCheck(request, env)
  await enforceUserRateLimit(user, env)

  return jsonResponse(request, env, await createOrder(request, env, user), 201)
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env)
    } catch (error) {
      console.error('[PratoPronto Worker]', error)
      const status = Number(error?.status) || 500
      return jsonResponse(request, env, {
        error: {
          code: error?.code || 'internal-error',
          message: error?.message || 'Falha interna ao processar o pedido.',
        },
      }, status)
    }
  },
}
