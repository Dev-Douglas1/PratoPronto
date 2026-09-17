import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  onSnapshot,
} from 'firebase/firestore'
import { db, firebaseConfigured } from '../firebase.js'
import { validateName, validatePhone } from '../../functions/src/input-policy.js'
import { callServer } from './server.js'
import { advanceOrder, decideRefund, submitRefund } from './company.js'

import { POLICY_VERSION as PRIVACY_POLICY_VERSION, TERMS_VERSION } from '../../functions/src/policy.js'
export { PRIVACY_POLICY_VERSION, TERMS_VERSION }

function requireFirebase() {
  if (!firebaseConfigured || !db) {
    throw new Error('Firebase não configurado. Preencha as variáveis VITE_FIREBASE_* no arquivo .env.')
  }
}

export async function saveUserProfile(uid, data) {
  requireFirebase()
  const safeData = {
    nome: validateName(data.nome),
    email: data.email?.trim().toLowerCase() ?? '',
    telefone: validatePhone(data.telefone),
    endereco: data.endereco?.trim() ?? '',
    numero: data.numero?.trim() ?? '',
    bairro: data.bairro?.trim() ?? '',
    cep: data.cep?.replace(/\D/g, '') ?? '',
    cidade: data.cidade?.trim() ?? '',
    uf: data.uf?.trim().toUpperCase() ?? '',
    complemento: data.complemento?.trim() ?? '',
    aceitarMarketing: Boolean(data.aceitarMarketing),
    privacyPolicyVersion: data.privacyPolicyVersion ?? PRIVACY_POLICY_VERSION,
    termsVersion: data.termsVersion ?? TERMS_VERSION,
    consentTimestamp: data.consentTimestamp ?? new Date().toISOString(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(doc(db, 'users', uid), safeData, { merge: true })
  // Pending registrations can create their own private profile, but cannot read
  // protected data until the server confirms the email.
  return safeData
}

export async function getUserProfile(uid) {
  requireFirebase()
  const snapshot = await getDoc(doc(db, 'users', uid))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export async function getAdminStatus(uid) {
  requireFirebase()
  const snapshot = await getDoc(doc(db, 'admins', uid))
  return snapshot.exists() && snapshot.data()?.role === 'restaurant_admin'
}

export async function updateUserProfile(uid, partial) {
  requireFirebase()
  const safe = {
    nome: validateName(partial.nome),
    telefone: validatePhone(partial.telefone),
    endereco: partial.endereco?.trim() ?? '',
    numero: partial.numero?.trim() ?? '',
    bairro: partial.bairro?.trim() ?? '',
    cep: partial.cep?.replace(/\D/g, '') ?? '',
    cidade: partial.cidade?.trim() ?? '',
    uf: partial.uf?.trim().toUpperCase() ?? '',
    complemento: partial.complemento?.trim() ?? '',
    aceitarMarketing: Boolean(partial.aceitarMarketing),
    updatedAt: serverTimestamp(),
  }
  await updateDoc(doc(db, 'users', uid), safe)
  return getUserProfile(uid)
}

export async function getLastOrder(userId) {
  requireFirebase()
  const q = query(collection(db, 'orders'), where('userId', '==', userId))
  const snapshot = await getDocs(q)
  const orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
  orders.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() ?? 0
    const bTime = b.createdAt?.toMillis?.() ?? 0
    return bTime - aTime
  })
  return orders[0] ?? null
}

export function subscribeToLastOrder(userId, onChange, onError) {
  requireFirebase()
  const q = query(collection(db, 'orders'), where('userId', '==', userId))
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
    orders.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0
      const bTime = b.createdAt?.toMillis?.() ?? 0
      return bTime - aTime
    })
    onChange(orders[0] ?? null)
  }, onError)
}

export async function getOrdersForUser(userId) {
  requireFirebase()
  const q = query(collection(db, 'orders'), where('userId', '==', userId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function getAllOrdersForAdmin() {
  requireFirebase()
  const snapshot = await getDocs(collection(db, 'orders'))
  const orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
  return orders.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() ?? 0
    const bTime = b.createdAt?.toMillis?.() ?? 0
    return bTime - aTime
  })
}

export async function updateOrderStatus(orderId, status, received = false) {
  return advanceOrder(orderId, status, received)
}

export async function createRefundRequest({ userId, orderId, motivo }) {
  return submitRefund({ userId, orderId, motivo })
}

export async function getRefundRequestForOrder(userId, orderId) {
  requireFirebase()
  const snapshot = await getDoc(doc(db, 'refundRequests', orderId))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export async function getRefundRequestsForUser(userId) {
  requireFirebase()
  const q = query(collection(db, 'refundRequests'), where('userId', '==', userId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function getReviewsForUser(userId) {
  requireFirebase()
  const snapshot = await getDocs(query(collection(db, 'reviews'), where('userId', '==', userId)))
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id }))
}

export async function getRefundRequestsForAdmin() {
  requireFirebase()
  const snapshot = await getDocs(collection(db, 'refundRequests'))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function reviewRefundRequest({ requestId, status, resposta }) {
  return decideRefund(requestId, status === 'aprovado_demo', resposta)
}

export async function deleteUserData() {
  return callServer('appPrivacyRequest')
}
