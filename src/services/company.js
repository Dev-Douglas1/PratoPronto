import { collection, doc, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { auth, db, firebaseConfigured } from '../firebase.js'
import { callServer } from './server.js'
import { timestampMillis } from '../utils/pedido.js'
import { assertRespectful, validateName } from '../../functions/src/input-policy.js'
import { validatePromotion } from '../../functions/src/promotions.js'
import { produtos } from '../data/produtos.js'

function ready() {
  if (!firebaseConfigured || !db || !auth?.currentUser) throw new Error('Entre na sua conta para continuar.')
}
const records = snapshot => snapshot.docs.map(item => ({ ...item.data(), id: item.id }))

export function subscribeCompany(name, onChange, onError) {
  ready()
  if (name === 'orders' || name === 'refundRequests') {
    let active = null
    let recent = null
    let activeFromCache = true
    let recentFromCache = true
    const emit = () => {
      if (active && recent) onChange([...new Map([...recent, ...active].map(item => [item.id, item])).values()].sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt)), { fromCache: activeFromCache || recentFromCache })
    }
    const activeStatuses = name === 'orders' ? ['aguardando_pagamento', 'confirmado', 'preparando', 'pronto', 'saiu_entrega', 'Pedido confirmado • preparando', 'Pedido confirmado • pagamento na entrega'] : ['pendente', 'reembolso_pendente', 'reembolso_manual_pendente']
    const activeQuery = query(collection(db, name), where('status', 'in', activeStatuses))
    const stopActive = onSnapshot(activeQuery, { includeMetadataChanges: true }, snap => { active = records(snap); activeFromCache = snap.metadata.fromCache; emit() }, onError)
    const stopRecent = onSnapshot(query(collection(db, name), orderBy('createdAt', 'desc'), limit(200)), { includeMetadataChanges: true }, snap => { recent = records(snap); recentFromCache = snap.metadata.fromCache; emit() }, onError)
    return () => { stopActive(); stopRecent() }
  }
  const q = name === 'productSettings' ? collection(db, name) : query(collection(db, name), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(q, { includeMetadataChanges: true }, snap => onChange(records(snap), { fromCache: snap.metadata.fromCache }), onError)
}
export function subscribeCustomerOrders(uid, onChange, onError) {
  ready()
  // A consulta por proprietário mantém as Security Rules verificáveis.
  return onSnapshot(query(collection(db, 'orders'), where('userId', '==', uid)), snap =>
    onChange(records(snap).sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))), onError)
}
export function subscribeOrderRecord(name, id, onChange, onError) {
  ready()
  return onSnapshot(doc(db, name, id), snap => onChange(snap.exists() ? { ...snap.data(), id: snap.id } : null), onError)
}
export function subscribeOrderEvents(id, onChange, onError) {
  ready()
  return onSnapshot(query(collection(db, 'orders', id, 'events'), orderBy('at')), snap => onChange(records(snap)), onError)
}

export async function advanceOrder(orderId, next, received = false) {
  return callServer('appAdvance', { orderId, next, received })
}
export async function submitRefund({ orderId, motivo }) {
  assertRespectful(motivo, 'o motivo')
  return callServer('appRefundRequest', { orderId, reason: motivo })
}
export async function decideRefund(orderId, approve, resposta) {
  assertRespectful(resposta, 'a resposta')
  return callServer('appRefundDecision', { orderId, approve, answer: resposta })
}

export async function submitReview({ orderId, userId, nome, notaComida, notaEntrega, comentario }) {
  ready()
  const payload = { orderId, userId, nome: validateName(nome), notaComida: Number(notaComida), notaEntrega: Number(notaEntrega), comentario: assertRespectful(comentario.trim(), 'o comentário'), createdAt: serverTimestamp() }
  if (![payload.notaComida, payload.notaEntrega].every(n => Number.isInteger(n) && n >= 1 && n <= 5) || payload.comentario.length > 1000) throw new Error('Escolha notas de 1 a 5 e um comentário com até 1.000 caracteres.')
  await runTransaction(db, async tx => {
    const ref = doc(db, 'reviews', orderId)
    if ((await tx.get(ref)).exists()) throw new Error('Você já avaliou este pedido.')
    tx.set(ref, payload)
  })
}
export async function replyReview(id, resposta) {
  ready()
  assertRespectful(resposta, 'a resposta')
  if (resposta.trim().length < 3 || resposta.trim().length > 1000) throw new Error('A resposta deve ter entre 3 e 1.000 caracteres.')
  await updateDoc(doc(db, 'reviews', id), { resposta: resposta.trim(), respondidoEm: serverTimestamp(), respondidoPor: auth.currentUser.uid })
}
export async function saveProduct(id, settings) {
  ready()
  const preco = Math.round(Number(settings.preco) * 100) / 100
  if (!(preco > 0 && preco <= 2000)) throw new Error('Informe um preço entre R$ 0,01 e R$ 2.000,00.')
  if (produtos.find(p => p.id === id)?.personalizavel && preco <= 12) throw new Error('O preço base da pizza deve superar R$ 12,00 para permitir os tamanhos menores.')
  await setDoc(doc(db, 'productSettings', id), { disponivel: Boolean(settings.disponivel), preco, updatedAt: serverTimestamp() }, { merge: true })
}

export async function savePromotion(productId, input) {
  ready()
  const product = produtos.find(item => item.id === productId)
  if (!product) throw new Error('Escolha um produto do cardápio.')
  const promocao = validatePromotion(input)
  // One offer per product. A transaction preserves simultaneous price edits.
  await runTransaction(db, async tx => {
    const ref = doc(db, 'productSettings', productId)
    const current = (await tx.get(ref)).data()
    tx.set(ref, { preco: current?.preco ?? product.preco, disponivel: current?.disponivel !== false, promocao, updatedAt: serverTimestamp() })
  })
}
