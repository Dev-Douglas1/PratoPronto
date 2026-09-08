import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db, firebaseConfigured } from '../firebase.js'

export const PRIVACY_POLICY_VERSION = '2026-09-08'
export const TERMS_VERSION = '2026-09-08'
export const TEST_ADMIN_EMAIL = 'douglas.souza.santos@escola.pr.gov.br'

export const ORDER_STATUS = {
  RECEIVED: 'recebido',
  PREPARING: 'preparando',
  READY: 'pronto',
  OUT_FOR_DELIVERY: 'saiu_entrega',
  DELIVERED: 'entregue',
  CANCELLATION_REQUESTED: 'cancelamento_solicitado',
  CANCELLED: 'cancelado',
}

export const ORDER_STATUS_LABELS = {
  recebido: 'Pedido recebido',
  preparando: 'Preparando',
  pronto: 'Pronto para entrega',
  saiu_entrega: 'Saiu para entrega',
  entregue: 'Entregue',
  cancelamento_solicitado: 'Cancelamento solicitado',
  cancelado: 'Cancelado',
  'Pedido confirmado • preparando': 'Preparando',
}

function requireFirebase() {
  if (!firebaseConfigured || !db) {
    throw new Error('Firebase não configurado. Preencha as variáveis VITE_FIREBASE_* no arquivo .env.')
  }
}

function timestampValue(value) {
  return value?.toMillis?.() ?? value?.seconds * 1000 ?? 0
}

function sortNewestFirst(items) {
  return [...items].sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt))
}

export async function saveUserProfile(uid, data) {
  requireFirebase()
  const safeData = {
    nome: data.nome?.trim() ?? '',
    email: data.email?.trim().toLowerCase() ?? '',
    telefone: data.telefone?.trim() ?? '',
    endereco: data.endereco?.trim() ?? '',
    numero: data.numero?.trim() ?? '',
    bairro: data.bairro?.trim() ?? '',
    complemento: data.complemento?.trim() ?? '',
    aceitarMarketing: Boolean(data.aceitarMarketing),
    privacyPolicyVersion: data.privacyPolicyVersion ?? PRIVACY_POLICY_VERSION,
    termsVersion: data.termsVersion ?? TERMS_VERSION,
    consentTimestamp: data.consentTimestamp ?? new Date().toISOString(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(doc(db, 'users', uid), safeData, { merge: true })
  return getUserProfile(uid)
}

export async function getUserProfile(uid) {
  requireFirebase()
  const snapshot = await getDoc(doc(db, 'users', uid))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export async function updateUserProfile(uid, partial) {
  requireFirebase()
  const safe = {
    nome: partial.nome?.trim() ?? '',
    telefone: partial.telefone?.trim() ?? '',
    endereco: partial.endereco?.trim() ?? '',
    numero: partial.numero?.trim() ?? '',
    bairro: partial.bairro?.trim() ?? '',
    complemento: partial.complemento?.trim() ?? '',
    aceitarMarketing: Boolean(partial.aceitarMarketing),
    updatedAt: serverTimestamp(),
  }
  await updateDoc(doc(db, 'users', uid), safe)
  return getUserProfile(uid)
}

export async function getAdminAccess(uid) {
  requireFirebase()
  const snapshot = await getDoc(doc(db, 'admins', uid))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export async function ensureTestAdminAccess(uid, email) {
  requireFirebase()
  const normalizedEmail = email?.trim().toLowerCase()
  if (normalizedEmail !== TEST_ADMIN_EMAIL) return null

  const ref = doc(db, 'admins', uid)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) {
    await setDoc(ref, {
      email: normalizedEmail,
      role: 'restaurant_admin',
      permissions: ['orders', 'catalog', 'reviews', 'delivery', 'refunds'],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
  return getAdminAccess(uid)
}

export async function createOrder({ userId, cliente, entrega, itens, subtotal, deliveryFee, total, pagamento, observacao = '' }) {
  requireFirebase()
  const payload = {
    userId,
    cliente: {
      nome: cliente.nome?.trim() ?? '',
      email: cliente.email?.trim().toLowerCase() ?? '',
      telefone: cliente.telefone?.trim() ?? '',
    },
    entrega: {
      endereco: entrega.endereco?.trim() ?? '',
      numero: entrega.numero?.trim() ?? '',
      bairro: entrega.bairro?.trim() ?? '',
      complemento: entrega.complemento?.trim() ?? '',
    },
    itens: itens.map((item) => ({
      id: item.id,
      nome: item.nome,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
      personalizacao: item.personalizacao ?? null,
    })),
    subtotal,
    deliveryFee,
    total,
    observacao: observacao.trim().slice(0, 500),
    pagamento: {
      metodo: pagamento.metodo,
      referencia: pagamento.referencia ?? 'pagamento-demo',
    },
    paymentStatus: pagamento.status ?? 'demo_approved',
    status: ORDER_STATUS.RECEIVED,
    cancelReason: '',
    refundStatus: 'none',
    refundReason: '',
    assignedCourier: '',
    restaurantNotes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const ref = await addDoc(collection(db, 'orders'), payload)
  return { id: ref.id, ...payload }
}

export async function getLastOrder(userId) {
  requireFirebase()
  const q = query(collection(db, 'orders'), where('userId', '==', userId), limit(50))
  const snapshot = await getDocs(q)
  const orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
  return sortNewestFirst(orders)[0] ?? null
}

export async function getOrdersForUser(userId) {
  requireFirebase()
  const q = query(collection(db, 'orders'), where('userId', '==', userId))
  const snapshot = await getDocs(q)
  return sortNewestFirst(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
}

export function subscribeOrdersForUser(userId, onChange, onError = () => undefined) {
  requireFirebase()
  const q = query(collection(db, 'orders'), where('userId', '==', userId))
  return onSnapshot(q, (snapshot) => {
    const orders = sortNewestFirst(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    onChange(orders)
  }, onError)
}

export function subscribeOrdersForAdmin(onChange, onError = () => undefined) {
  requireFirebase()
  return onSnapshot(collection(db, 'orders'), (snapshot) => {
    const orders = sortNewestFirst(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    onChange(orders)
  }, onError)
}

export async function updateOrderStatus(orderId, status, extra = {}) {
  requireFirebase()
  const allowed = new Set(Object.values(ORDER_STATUS))
  if (!allowed.has(status)) throw new Error('Status de pedido inválido.')

  const safeExtra = {}
  if (typeof extra.assignedCourier === 'string') safeExtra.assignedCourier = extra.assignedCourier.trim().slice(0, 100)
  if (typeof extra.restaurantNotes === 'string') safeExtra.restaurantNotes = extra.restaurantNotes.trim().slice(0, 500)
  if (typeof extra.paymentStatus === 'string') safeExtra.paymentStatus = extra.paymentStatus
  if (typeof extra.refundStatus === 'string') safeExtra.refundStatus = extra.refundStatus

  await updateDoc(doc(db, 'orders', orderId), {
    status,
    ...safeExtra,
    updatedAt: serverTimestamp(),
  })
}

export async function requestOrderCancellation(orderId, reason) {
  requireFirebase()
  await updateDoc(doc(db, 'orders', orderId), {
    status: ORDER_STATUS.CANCELLATION_REQUESTED,
    cancelReason: reason?.trim().slice(0, 300) || 'Solicitado pelo cliente',
    updatedAt: serverTimestamp(),
  })
}

export async function requestRefund(orderId, reason) {
  requireFirebase()
  await updateDoc(doc(db, 'orders', orderId), {
    refundStatus: 'requested',
    refundReason: reason?.trim().slice(0, 300) || 'Solicitado pelo cliente',
    updatedAt: serverTimestamp(),
  })
}

export async function updateRefundStatus(orderId, refundStatus) {
  requireFirebase()
  if (!['none', 'requested', 'approved', 'rejected', 'refunded'].includes(refundStatus)) {
    throw new Error('Status de reembolso inválido.')
  }
  await updateDoc(doc(db, 'orders', orderId), {
    refundStatus,
    updatedAt: serverTimestamp(),
  })
}

export async function createReview({ orderId, userId, displayName, foodRating, deliveryRating, comment }) {
  requireFirebase()
  const ref = doc(db, 'reviews', orderId)
  await setDoc(ref, {
    orderId,
    userId,
    displayName: displayName?.trim().slice(0, 80) || 'Cliente',
    foodRating: Number(foodRating),
    deliveryRating: Number(deliveryRating),
    comment: comment?.trim().slice(0, 800) || '',
    restaurantReply: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function getReview(orderId) {
  requireFirebase()
  const snapshot = await getDoc(doc(db, 'reviews', orderId))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export function subscribeReviewsForAdmin(onChange, onError = () => undefined) {
  requireFirebase()
  return onSnapshot(collection(db, 'reviews'), (snapshot) => {
    onChange(sortNewestFirst(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))))
  }, onError)
}

export async function replyToReview(reviewId, reply) {
  requireFirebase()
  await updateDoc(doc(db, 'reviews', reviewId), {
    restaurantReply: reply?.trim().slice(0, 800) || '',
    updatedAt: serverTimestamp(),
  })
}

export function subscribeCatalog(onChange, onError = () => undefined) {
  requireFirebase()
  return onSnapshot(collection(db, 'catalog'), (snapshot) => {
    const values = {}
    snapshot.docs.forEach((item) => {
      values[item.id] = { id: item.id, ...item.data() }
    })
    onChange(values)
  }, onError)
}

export async function updateCatalogItem(productId, partial) {
  requireFirebase()
  const safe = {
    available: partial.available !== false,
    stock: Math.max(0, Math.floor(Number(partial.stock ?? 0))),
    price: Math.max(0, Number(partial.price ?? 0)),
    updatedAt: serverTimestamp(),
  }
  await setDoc(doc(db, 'catalog', productId), safe, { merge: true })
}

export const DEFAULT_DELIVERY_CONFIG = {
  defaultFee: 8,
  freeOver: 120,
  areas: [
    { bairro: 'Centro', fee: 5 },
    { bairro: 'Maracanã', fee: 6 },
    { bairro: 'Guaraituba', fee: 7 },
    { bairro: 'Roça Grande', fee: 8 },
  ],
}

export async function getDeliveryConfig() {
  requireFirebase()
  const snapshot = await getDoc(doc(db, 'settings', 'delivery'))
  return snapshot.exists() ? { ...DEFAULT_DELIVERY_CONFIG, ...snapshot.data() } : DEFAULT_DELIVERY_CONFIG
}

export async function saveDeliveryConfig(config) {
  requireFirebase()
  const areas = Array.isArray(config.areas)
    ? config.areas
      .filter((area) => area?.bairro?.trim())
      .slice(0, 100)
      .map((area) => ({ bairro: area.bairro.trim().slice(0, 100), fee: Math.max(0, Number(area.fee ?? 0)) }))
    : []

  await setDoc(doc(db, 'settings', 'delivery'), {
    defaultFee: Math.max(0, Number(config.defaultFee ?? DEFAULT_DELIVERY_CONFIG.defaultFee)),
    freeOver: Math.max(0, Number(config.freeOver ?? DEFAULT_DELIVERY_CONFIG.freeOver)),
    areas,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function calculateDeliveryFee(bairro, subtotal) {
  const config = await getDeliveryConfig()
  if (Number(subtotal) >= Number(config.freeOver || Infinity)) return 0
  const normalized = bairro?.trim().toLocaleLowerCase('pt-BR') || ''
  const found = (config.areas || []).find((area) => area.bairro?.trim().toLocaleLowerCase('pt-BR') === normalized)
  return Number(found?.fee ?? config.defaultFee ?? 0)
}

export async function deleteUserData(uid) {
  requireFirebase()
  const ordersQuery = query(collection(db, 'orders'), where('userId', '==', uid))
  const reviewsQuery = query(collection(db, 'reviews'), where('userId', '==', uid))
  const [orders, reviews] = await Promise.all([getDocs(ordersQuery), getDocs(reviewsQuery)])
  await Promise.all([
    ...reviews.docs.map((reviewDoc) => deleteDoc(reviewDoc.ref)),
    ...orders.docs.map((orderDoc) => deleteDoc(orderDoc.ref)),
  ])
  await deleteDoc(doc(db, 'users', uid))
}
