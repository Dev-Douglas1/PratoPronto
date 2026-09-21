import {
  collection, collectionGroup, doc, getDocs, limit, onSnapshot, query, where,
} from 'firebase/firestore'
import { db } from '../firebase.js'
import { callServer } from './server.js'
import { normalizeSearch } from '../config/marketplace.js'
import { timestampMillis } from '../utils/pedido.js'
import { produtos as defaultProducts } from '../data/produtos.js'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'

const records = snapshot => snapshot.docs.map(item => ({ ...item.data(), id: item.id }))

export async function loadMyCompanies() {
  return callServer('appMyCompanies')
}

export async function createCompany(input) {
  return callServer('appCreateCompany', input)
}

export async function migrateDefaultCompany() {
  return callServer('appMigrateDefaultCompany')
}

export function subscribeCompany(companyId, onChange, onError) {
  return onSnapshot(doc(db, 'companies', companyId), snap => {
    onChange(snap.exists() ? { ...snap.data(), id: snap.id } : null)
  }, onError)
}

export function subscribeCompanyProducts(companyId, onChange, onError) {
  return onSnapshot(collection(db, 'companies', companyId, 'products'), snap => {
    onChange(records(snap).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')))
  }, onError)
}

export function subscribeCompanyMembers(companyId, onChange, onError) {
  return onSnapshot(query(collection(db, 'companyMembers'), where('companyId', '==', companyId)), snap => {
    onChange(records(snap).filter(item => item.active !== false))
  }, onError)
}

export function subscribeCompanyPilots(companyId, onChange, onError) {
  return subscribeCompanyMembers(companyId, values => onChange(values.filter(item => item.role === 'pilot')), onError)
}

export async function saveCompanyMember(input) {
  return callServer('appSaveCompanyMember', input)
}

export async function removeCompanyMember(input) {
  return callServer('appRemoveCompanyMember', input)
}

export async function saveCompanyProduct(input) {
  return callServer('appSaveCompanyProduct', input)
}

export async function assignPilot(input) {
  return callServer('appAssignPilot', input)
}

export function subscribePilotOrders(uid, onChange, onError) {
  return onSnapshot(query(collection(db, 'orders'), where('assignedCourier', '==', uid)), snap => {
    onChange(records(snap).sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt)))
  }, onError)
}

export async function pilotStartDelivery(orderId) {
  return callServer('appPilotStartDelivery', { orderId })
}

export async function pilotConfirmDelivery(orderId, code, received = false) {
  return callServer('appPilotConfirmDelivery', { orderId, code, received })
}

export function subscribeDeliverySecret(orderId, onChange, onError) {
  return onSnapshot(doc(db, 'orders', orderId, 'private', 'delivery'), snap => {
    onChange(snap.exists() ? snap.data() : null)
  }, onError)
}

export async function searchMarketplace(term = '') {
  if (!db) return { companies: [], products: [] }
  const [companiesSnap, productsSnap] = await Promise.all([
    getDocs(query(collection(db, 'companies'), where('active', '==', true), limit(80))),
    getDocs(query(collectionGroup(db, 'products'), where('public', '==', true), where('disponivel', '==', true), limit(250))),
  ])
  const needle = normalizeSearch(term)
  const fetchedCompanies = records(companiesSnap)
  const defaultCompany = { id: DEFAULT_COMPANY_ID, name: 'PratoPronto', active: true }
  const companyMap = new Map([[DEFAULT_COMPANY_ID, defaultCompany], ...fetchedCompanies.map(company => [company.id, company])])
  const companies = [...companyMap.values()].filter(company => !needle || normalizeSearch(company.name).includes(needle))
  const activeCompanyIds = new Set([...companyMap.values()].filter(company => company.active !== false).map(company => company.id))
  const remoteProducts = records(productsSnap)
    .filter(product => activeCompanyIds.has(product.companyId))
    .map(product => ({ ...product, companyName: companyMap.get(product.companyId)?.name || product.companyId }))
  const legacyProducts = defaultProducts.map(product => ({ ...product, companyId: DEFAULT_COMPANY_ID, companyName: 'PratoPronto', categoria: product.personalizavel ? 'Pizzas' : 'Bebidas', public: true, disponivel: true }))
  const products = [...legacyProducts, ...remoteProducts].filter(product => {
    if (!needle) return true
    return [product.nome, product.descricao, product.categoria].some(value => normalizeSearch(value).includes(needle))
  })
  return { companies, products }
}
