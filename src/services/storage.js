import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  addDoc,
} from 'firebase/firestore'
import { db, firebaseConfigured } from '../firebase.js'

export const PRIVACY_POLICY_VERSION = '2026-09-02'
export const TERMS_VERSION = '2026-09-02'

function requireFirebase() {
  if (!firebaseConfigured || !db) {
    throw new Error('Firebase não configurado. Preencha as variáveis VITE_FIREBASE_* no arquivo .env.')
  }
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

export async function createOrder({ userId, cliente, entrega, itens, total, pagamento }) {
  requireFirebase()
  const payload = {
    userId,
    cliente: {
      nome: cliente.nome,
      email: cliente.email,
      telefone: cliente.telefone,
    },
    entrega: {
      endereco: entrega.endereco,
      numero: entrega.numero,
      bairro: entrega.bairro,
      complemento: entrega.complemento ?? '',
    },
    itens: itens.map((item) => ({
      id: item.id,
      nome: item.nome,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
    })),
    total,
    pagamento: {
      metodo: pagamento.metodo,
      referencia: pagamento.referencia ?? 'pagamento-demo',
    },
    status: 'Pedido confirmado • preparando',
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
  orders.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() ?? 0
    const bTime = b.createdAt?.toMillis?.() ?? 0
    return bTime - aTime
  })
  return orders[0] ?? null
}

export async function getOrdersForUser(userId) {
  requireFirebase()
  const q = query(collection(db, 'orders'), where('userId', '==', userId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function updateOrderStatus(orderId, status) {
  requireFirebase()
  await updateDoc(doc(db, 'orders', orderId), {
    status,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteUserData(uid) {
  requireFirebase()
  const q = query(collection(db, 'orders'), where('userId', '==', uid))
  const orders = await getDocs(q)
  await Promise.all(orders.docs.map((orderDoc) => deleteDoc(orderDoc.ref)))
  await deleteDoc(doc(db, 'users', uid))
}
