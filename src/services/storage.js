import { getSupabase, supabaseConfigured } from '../lib/supabase.js'

export const PRIVACY_POLICY_VERSION = '2026-09-15'
export const TERMS_VERSION = '2026-09-09'

function ready() {
  if (!supabaseConfigured) throw new Error('Supabase não configurado. Preencha as variáveis VITE_SUPABASE_* no arquivo .env.')
  return getSupabase()
}

function profileFromRow(row) {
  if (!row) return null
  return {
    uid: row.id,
    nome: row.nome || '',
    email: row.email || '',
    telefone: row.telefone || '',
    avatarUrl: row.avatar_url || '',
    endereco: row.endereco || '',
    numero: row.numero || '',
    bairro: row.bairro || '',
    complemento: row.complemento || '',
    cep: row.cep || '',
    cidade: row.cidade || '',
    uf: row.uf || '',
    aceitarMarketing: Boolean(row.aceitar_marketing),
    privacyPolicyVersion: row.privacy_policy_version,
    termsVersion: row.terms_version,
    consentTimestamp: row.consent_timestamp,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function orderFromRow(row) {
  if (!row) return null
  return {
    ...(row.data || {}),
    id: row.id,
    userId: row.user_id,
    restaurantId: row.restaurant_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignedCourier: row.assigned_pilot_id || row.data?.assignedCourier || '',
    deliveryVerificationRequired: row.delivery_verification_required !== false,
    deliveryStatus: row.delivery_status,
    pagamento: {
      ...(row.data?.pagamento || {}),
      metodo: row.payment_method || row.data?.pagamento?.metodo,
      status: row.payment_status || row.data?.pagamento?.status,
    },
  }
}

function recordFromRow(row) {
  return row ? { ...(row.data || {}), id: row.id, status: row.status || row.data?.status, createdAt: row.created_at, updatedAt: row.updated_at } : null
}

export async function saveUserProfile(uid, data) {
  const supabase = ready()
  const payload = {
    id: uid,
    nome: data.nome?.trim() || '',
    email: data.email?.trim().toLowerCase() || '',
    telefone: String(data.telefone || '').replace(/\D/g, ''),
    endereco: data.endereco?.trim() || '',
    numero: data.numero?.trim() || '',
    bairro: data.bairro?.trim() || '',
    cep: String(data.cep || '').replace(/\D/g, ''),
    cidade: data.cidade?.trim() || '',
    uf: data.uf?.trim().toUpperCase() || '',
    complemento: data.complemento?.trim() || '',
    aceitar_marketing: Boolean(data.aceitarMarketing),
    privacy_policy_version: data.privacyPolicyVersion || PRIVACY_POLICY_VERSION,
    terms_version: data.termsVersion || TERMS_VERSION,
    consent_timestamp: data.consentTimestamp || new Date().toISOString(),
  }
  const { data: row, error } = await supabase.from('profiles').upsert(payload).select().single()
  if (error) throw error
  return profileFromRow(row)
}

export async function getUserProfile(uid) {
  const supabase = ready()
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
  if (error) throw error
  return profileFromRow(data)
}

export async function getAdminStatus() {
  const supabase = ready()
  const { data, error } = await supabase.rpc('my_restaurants')
  if (error) throw error
  return Array.isArray(data) && data.length > 0
}

export async function updateUserProfile(uid, partial) {
  const supabase = ready()
  const payload = {
    nome: partial.nome?.trim() || '',
    telefone: String(partial.telefone || '').replace(/\D/g, ''),
    endereco: partial.endereco?.trim() || '',
    numero: partial.numero?.trim() || '',
    bairro: partial.bairro?.trim() || '',
    cep: String(partial.cep || '').replace(/\D/g, ''),
    cidade: partial.cidade?.trim() || '',
    uf: partial.uf?.trim().toUpperCase() || '',
    complemento: partial.complemento?.trim() || '',
    aceitar_marketing: Boolean(partial.aceitarMarketing),
  }
  const { data, error } = await supabase.from('profiles').update(payload).eq('id', uid).select().single()
  if (error) throw error
  return profileFromRow(data)
}

export async function getLastOrder(userId) {
  const rows = await getOrdersForUser(userId)
  return rows[0] || null
}

export function subscribeToLastOrder(userId, onChange, onError) {
  return subscribeOrders(userId, rows => onChange(rows[0] || null), onError)
}

function subscribeOrders(userId, onChange, onError) {
  const supabase = ready()
  let stopped = false
  const load = async () => {
    const { data, error } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) { if (!stopped) onError?.(error); return }
    if (!stopped) onChange((data || []).map(orderFromRow))
  }
  load()
  const channel = supabase.channel('orders:user:' + userId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: 'user_id=eq.' + userId }, load)
    .subscribe()
  return () => { stopped = true; supabase.removeChannel(channel) }
}

export async function getOrdersForUser(userId) {
  const supabase = ready()
  const { data, error } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(orderFromRow)
}

export async function getAllOrdersForAdmin() {
  const supabase = ready()
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(orderFromRow)
}

export async function updateOrderStatus(orderId, status, received = false) {
  const supabase = ready()
  const { data, error } = await supabase.rpc('advance_order', { p_order_id: orderId, p_next: status, p_received: received })
  if (error) throw error
  return data
}

export async function createRefundRequest({ orderId, motivo }) {
  const supabase = ready()
  const { data, error } = await supabase.rpc('submit_refund_request', { p_order_id: orderId, p_reason: motivo })
  if (error) throw error
  return data
}

export async function getRefundRequestForOrder(userId, orderId) {
  const supabase = ready()
  const { data, error } = await supabase.from('refund_requests').select('*').eq('id', orderId).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return recordFromRow(data)
}

export async function getRefundRequestsForUser(userId) {
  const supabase = ready()
  const { data, error } = await supabase.from('refund_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(recordFromRow)
}

export async function getReviewsForUser(userId) {
  const supabase = ready()
  const { data, error } = await supabase.from('reviews').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(recordFromRow)
}

export async function getRefundRequestsForAdmin() {
  const supabase = ready()
  const { data, error } = await supabase.from('refund_requests').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(recordFromRow)
}

export async function reviewRefundRequest({ requestId, status, resposta }) {
  const supabase = ready()
  const { data, error } = await supabase.rpc('decide_refund_request', {
    p_order_id: requestId,
    p_approve: status !== 'recusado',
    p_answer: resposta,
  })
  if (error) throw error
  return data
}

export async function deleteUserData() {
  const supabase = ready()
  const { data, error } = await supabase.rpc('request_account_deletion')
  if (error) throw error
  return data
}

export { orderFromRow, recordFromRow }
