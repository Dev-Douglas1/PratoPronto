import { getSupabase, supabaseConfigured } from '../lib/supabase.js'
import { callServer } from './server.js'
import { assertRespectful, validateName } from '../shared/input-policy.js'
import { validatePromotion } from '../shared/promotions.js'
import { produtos } from '../data/produtos.js'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'
import { orderFromRow, recordFromRow } from './storage.js'

function ready() {
  if (!supabaseConfigured) throw new Error('Supabase não configurado.')
  return getSupabase()
}

const restaurantCache = new Map()
async function restaurantIdForSlug(slug = DEFAULT_COMPANY_ID) {
  if (restaurantCache.has(slug)) return restaurantCache.get(slug)
  const supabase = ready()
  const { data, error } = await supabase.from('restaurantes').select('id,slug').eq('slug', slug).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Empresa não encontrada.')
  restaurantCache.set(slug, data.id)
  return data.id
}

function settingFromProduct(row) {
  return {
    id: row.slug,
    uuid: row.id,
    companyId: row.restaurant_id,
    nome: row.name,
    descricao: row.description || '',
    categoria: row.category || 'Outros',
    preco: Number(row.price_cents || 0) / 100,
    imagem: row.image_url || '',
    disponivel: row.active !== false,
    promocao: row.promotion || undefined,
    personalizavel: row.config?.personalizavel === true,
  }
}

function realtimeSubscription({ table, filter, load, onError, name }) {
  const supabase = ready()
  let stopped = false
  let channel = null
  ;(async () => {
    try {
      await load()
      if (stopped) return
      channel = supabase.channel(name + ':' + crypto.randomUUID())
        .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, () => load())
        .subscribe()
    } catch (error) { if (!stopped) onError?.(error) }
  })()
  return () => {
    stopped = true
    if (channel) supabase.removeChannel(channel)
  }
}

export function subscribeCompany(name, companyId = DEFAULT_COMPANY_ID, onChange, onError) {
  const supabase = ready()
  let rid = null
  const table = name === 'productSettings' ? 'products'
    : name === 'refundRequests' ? 'refund_requests'
    : name

  const load = async () => {
    rid ||= await restaurantIdForSlug(companyId)
    let query = supabase.from(table).select('*').eq(name === 'productSettings' ? 'restaurant_id' : 'restaurant_id', rid)
    if (table === 'orders' || table === 'refund_requests' || table === 'reviews') query = query.order('created_at', { ascending: false }).limit(300)
    const { data, error } = await query
    if (error) throw error
    const values = name === 'orders' ? (data || []).map(orderFromRow)
      : name === 'refundRequests' || name === 'reviews' ? (data || []).map(recordFromRow)
      : (data || []).map(settingFromProduct)
    onChange(values, { fromCache: false })
  }

  return realtimeSubscription({
    table,
    load,
    onError,
    name: 'company-' + name + '-' + companyId,
    filter: null,
  })
}

export function subscribeCustomerOrders(uid, onChange, onError) {
  const supabase = ready()
  const load = async () => {
    const { data, error } = await supabase.from('orders').select('*').eq('user_id', uid).order('created_at', { ascending: false })
    if (error) throw error
    onChange((data || []).map(orderFromRow))
  }
  return realtimeSubscription({ table: 'orders', filter: 'user_id=eq.' + uid, load, onError, name: 'customer-orders' })
}

export function subscribeOrderRecord(name, id, onChange, onError) {
  const supabase = ready()
  const table = name === 'refundRequests' ? 'refund_requests' : name
  const load = async () => {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    onChange(recordFromRow(data))
  }
  return realtimeSubscription({ table, filter: 'id=eq.' + id, load, onError, name: 'order-record-' + table })
}

export function subscribeOrderEvents(id, onChange, onError) {
  const supabase = ready()
  const load = async () => {
    const { data, error } = await supabase.from('order_events').select('*').eq('order_id', id).order('created_at', { ascending: true })
    if (error) throw error
    onChange((data || []).map(row => ({ ...(row.data || {}), id: row.id, at: row.data?.at || row.created_at })))
  }
  return realtimeSubscription({ table: 'order_events', filter: 'order_id=eq.' + id, load, onError, name: 'order-events' })
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

export async function submitReview({ orderId, nome, notaComida, notaEntrega, comentario }) {
  validateName(nome)
  const text = assertRespectful((comentario || '').trim(), 'o comentário')
  const food = Number(notaComida)
  const delivery = Number(notaEntrega)
  if (![food, delivery].every(n => Number.isInteger(n) && n >= 1 && n <= 5) || text.length > 1000) {
    throw new Error('Escolha notas de 1 a 5 e um comentário com até 1.000 caracteres.')
  }
  const { data, error } = await ready().rpc('submit_order_review', {
    p_order_id: orderId,
    p_food: food,
    p_delivery: delivery,
    p_comment: text,
  })
  if (error) throw error
  return data
}

export async function replyReview(id, resposta) {
  const text = assertRespectful(resposta, 'a resposta').trim()
  if (text.length < 3 || text.length > 1000) throw new Error('A resposta deve ter entre 3 e 1.000 caracteres.')
  const { data, error } = await ready().rpc('reply_order_review', { p_order_id: id, p_answer: text })
  if (error) throw error
  return data
}

export async function saveProduct(id, settings, companyId = DEFAULT_COMPANY_ID) {
  const preco = Math.round(Number(settings.preco) * 100) / 100
  if (!(preco > 0 && preco <= 2000)) throw new Error('Informe um preço entre R$ 0,01 e R$ 2.000,00.')
  if (produtos.find(p => p.id === id)?.personalizavel && preco <= 12) throw new Error('O preço base da pizza deve superar R$ 12,00.')
  const { data, error } = await ready().rpc('update_restaurant_product_state', {
    p_restaurant_slug: companyId,
    p_product_slug: id,
    p_price_cents: Math.round(preco * 100),
    p_active: Boolean(settings.disponivel),
    p_promotion: null,
    p_update_promotion: false,
  })
  if (error) throw error
  return data
}

export async function savePromotion(productId, input, companyId = DEFAULT_COMPANY_ID) {
  const promocao = validatePromotion(input)
  const { data, error } = await ready().rpc('update_restaurant_product_state', {
    p_restaurant_slug: companyId,
    p_product_slug: productId,
    p_price_cents: null,
    p_active: null,
    p_promotion: promocao,
    p_update_promotion: true,
  })
  if (error) throw error
  return data
}

export { restaurantIdForSlug, settingFromProduct }
