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

export const REFUND_STATUS_LABELS = {
  none: 'Sem solicitação',
  requested: 'Solicitado',
  approved: 'Aprovado',
  rejected: 'Recusado',
  refunded: 'Reembolsado',
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

function requireText(value, label) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${label} é obrigatório.`)
  return text
}

function requirePositiveMoney(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} inválido.`)
  return number
}

function safeMoney(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

async function validateCatalogAvailability(itens) {
  const quantities = new Map()
  itens.forEach((item) => {
    const id = String(item.id || '').trim()
    const quantity = Math.max(0, Math.floor(Number(item.quantidade || 0)))
    if (!id || quantity <= 0) throw new Error('Há um item inválido no carrinho.')
    quantities.set(id, (quantities.get(id) || 0) + quantity)
  })

  await Promise.all([...quantities.entries()].map(async ([productId, quantity]) => {
    const snapshot = await getDoc(doc(db, 'catalog', productId))
    if (!snapshot.exists()) return
    const data = snapshot.data()
    if (data.available === false) throw new Error('Um produto do carrinho ficou indisponível. Revise o pedido.')
    const stock = Number(data.stock)
    if (Number.isFinite(stock) && stock >= 0 && quantity > Math.floor(stock)) {
      throw new Error('A quantidade de um produto ultrapassa o estoque disponível. Revise o pedido.')
    }
  }))
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
    nome: requireText(partial.nome, 'Nome').slice(0, 100),
    telefone: requireText(partial.telefone, 'Telefone').slice(0, 30),
    endereco: requireText(partial.endereco, 'Endereço').slice(0, 180),
    numero: requireText(partial.numero, 'Número').slice(0, 20),
    bairro: requireText(partial.bairro, 'Bairro').slice(0, 100),
    complemento: partial.complemento?.trim().slice(0, 180) ?? '',
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

export async function createOrder({ userId, cliente, entrega, itens, subtotal, deliveryFee, total, pagamento, observacao = '' }) {
  requireFirebase()
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!Array.isArray(itens) || !itens.length) throw new Error('Seu carrinho está vazio.')

  const safeSubtotal = requirePositiveMoney(subtotal, 'Subtotal')
  const safeDeliveryFee = safeMoney(deliveryFee)
  const safeTotal = requirePositiveMoney(total, 'Total')
  const expectedTotal = safeSubtotal + safeDeliveryFee
  if (Math.abs(safeTotal - expectedTotal) > 0.011) throw new Error('O total do pedido está inconsistente. Revise o carrinho.')

  const safeCliente = {
    nome: requireText(cliente?.nome, 'Nome').slice(0, 100),
    email: requireText(cliente?.email, 'E-mail').toLowerCase().slice(0, 254),
    telefone: requireText(cliente?.telefone, 'Telefone').slice(0, 30),
  }
  const safeEntrega = {
    endereco: requireText(entrega?.endereco, 'Endereço').slice(0, 180),
    numero: requireText(entrega?.numero, 'Número').slice(0, 20),
    bairro: requireText(entrega?.bairro, 'Bairro').slice(0, 100),
    complemento: entrega?.complemento?.trim().slice(0, 180) ?? '',
  }

  await validateCatalogAvailability(itens)

  const safeItems = itens.map((item) => ({
    id: requireText(item.id, 'Produto').slice(0, 100),
    nome: requireText(item.nome, 'Produto').slice(0, 160),
    quantidade: Math.max(1, Math.floor(Number(item.quantidade || 1))),
    precoUnitario: requirePositiveMoney(item.precoUnitario, 'Preço do produto'),
    personalizacao: item.personalizacao ?? null,
  }))

  const payload = {
    userId,
    cliente: safeCliente,
    entrega: safeEntrega,
    itens: safeItems,
    subtotal: safeSubtotal,
    deliveryFee: safeDeliveryFee,
    total: safeTotal,
    observacao: String(observacao || '').trim().slice(0, 500),
    pagamento: {
      metodo: requireText(pagamento?.metodo, 'Forma de pagamento').slice(0, 80),
      referencia: String(pagamento?.referencia ?? 'pagamento-demo').trim().slice(0, 180),
    },
    paymentStatus: pagamento?.status ?? 'demo_approved',
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
  if (typeof extra.paymentStatus === 'string') safeExtra.paymentStatus = extra.paymentStatus.trim().slice(0, 80)
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
  const food = Number(foodRating)
  const delivery = Number(deliveryRating)
  if (!Number.isInteger(food) || food < 1 || food > 5 || !Number.isInteger(delivery) || delivery < 1 || delivery > 5) {
    throw new Error('As notas da avaliação devem estar entre 1 e 5.')
  }

  const ref = doc(db, 'reviews', orderId)
  await setDoc(ref, {
    orderId,
    userId,
    displayName: displayName?.trim().slice(0, 80) || 'Cliente',
    foodRating: food,
    deliveryRating: delivery,
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
  const price = Number(partial.price)
  const stock = Number(partial.stock)
  if (!Number.isFinite(price) || price <= 0) throw new Error('O preço deve ser maior que zero.')
  if (!Number.isFinite(stock) || stock < 0) throw new Error('O estoque deve ser zero ou maior.')

  const safe = {
    available: partial.available !== false,
    stock: Math.floor(stock),
    price,
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
  if (!snapshot.exists()) return DEFAULT_DELIVERY_CONFIG

  const data = snapshot.data()
  return {
    ...DEFAULT_DELIVERY_CONFIG,
    ...data,
    defaultFee: safeMoney(data.defaultFee, DEFAULT_DELIVERY_CONFIG.defaultFee),
    freeOver: safeMoney(data.freeOver, DEFAULT_DELIVERY_CONFIG.freeOver),
    areas: Array.isArray(data.areas) ? data.areas : DEFAULT_DELIVERY_CONFIG.areas,
  }
}

export async function saveDeliveryConfig(config) {
  requireFirebase()
  const defaultFee = Number(config.defaultFee)
  const freeOver = Number(config.freeOver)
  if (!Number.isFinite(defaultFee) || defaultFee < 0) throw new Error('Taxa padrão inválida.')
  if (!Number.isFinite(freeOver) || freeOver < 0) throw new Error('Valor de entrega grátis inválido.')

  const areas = Array.isArray(config.areas)
    ? config.areas
      .filter((area) => area?.bairro?.trim())
      .slice(0, 100)
      .map((area) => {
        const fee = Number(area.fee)
        if (!Number.isFinite(fee) || fee < 0) throw new Error(`Taxa inválida para ${area.bairro}.`)
        return { bairro: area.bairro.trim().slice(0, 100), fee }
      })
    : []

  await setDoc(doc(db, 'settings', 'delivery'), {
    defaultFee,
    freeOver,
    areas,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function calculateDeliveryFee(bairro, subtotal) {
  const config = await getDeliveryConfig()
  const subtotalNumber = safeMoney(subtotal)
  if (config.freeOver > 0 && subtotalNumber >= config.freeOver) return 0

  const normalized = bairro?.trim().toLocaleLowerCase('pt-BR') || ''
  const found = (config.areas || []).find((area) => area.bairro?.trim().toLocaleLowerCase('pt-BR') === normalized)
  const fee = Number(found?.fee ?? config.defaultFee)
  if (!Number.isFinite(fee) || fee < 0) throw new Error('Não foi possível calcular a taxa de entrega.')
  return fee
}

export async function deleteUserData(uid) {
  requireFirebase()
  const ordersQuery = query(collection(db, 'orders'), where('userId', '==', uid))
  const reviewsQuery = query(collection(db, 'reviews'), where('userId', '==', uid))
  const [orders, reviews] = await Promise.all([
    getDocs(ordersQuery),
    getDocs(reviewsQuery),
  ])

  await Promise.all([
    ...reviews.docs.map((reviewDoc) => deleteDoc(reviewDoc.ref)),
    ...orders.docs.map((orderDoc) => deleteDoc(orderDoc.ref)),
  ])

  await deleteDoc(doc(db, 'users', uid))
}
