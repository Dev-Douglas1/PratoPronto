import { getSupabase, supabaseConfigured } from '../lib/supabase.js'
import { callServer } from './server.js'
import { normalizeSearch, DEFAULT_COMPANY_ID } from '../config/marketplace.js'
import { orderFromRow } from './storage.js'
import { restaurantIdForSlug, settingFromProduct } from './company.js'

function ready() {
  if (!supabaseConfigured) throw new Error('Supabase não configurado.')
  return getSupabase()
}

function realtime({ table, filter, load, onError, key }) {
  const supabase = ready()
  let stopped = false
  let channel = null
  ;(async () => {
    try {
      await load()
      if (stopped) return
      channel = supabase.channel(key + ':' + crypto.randomUUID())
        .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, () => load())
        .subscribe()
    } catch (error) { if (!stopped) onError?.(error) }
  })()
  return () => { stopped = true; if (channel) supabase.removeChannel(channel) }
}

export async function loadMyCompanies() {
  return callServer('appMyCompanies')
}

export async function createCompany(input) {
  return callServer('appCreateCompany', input)
}

export async function migrateDefaultCompany() {
  return { companyId: DEFAULT_COMPANY_ID, changed: 0 }
}

export function subscribeCompany(companyId, onChange, onError) {
  const supabase = ready()
  const load = async () => {
    const { data, error } = await supabase.from('restaurantes').select('*').eq('slug', companyId).maybeSingle()
    if (error) throw error
    onChange(data ? {
      id: data.slug,
      restaurantId: data.id,
      name: data.nome,
      description: data.descricao,
      phone: data.telefone,
      address: data.endereco,
      active: data.ativo,
    } : null)
  }
  return realtime({ table: 'restaurantes', filter: 'slug=eq.' + companyId, load, onError, key: 'restaurant' })
}

export function subscribeCompanyProducts(companyId, onChange, onError) {
  const supabase = ready()
  let rid = null
  const load = async () => {
    rid ||= await restaurantIdForSlug(companyId)
    const { data, error } = await supabase.from('products').select('*').eq('restaurant_id', rid).order('name')
    if (error) throw error
    onChange((data || []).map(row => ({ ...settingFromProduct(row), companyId })))
  }
  return realtime({ table: 'products', filter: null, load, onError, key: 'products-' + companyId })
}

export function subscribeCompanyMembers(companyId, onChange, onError) {
  const supabase = ready()
  const load = async () => {
    const { data, error } = await supabase.rpc('list_restaurant_members', { p_restaurant_slug: companyId })
    if (error) throw error
    onChange((data || []).map(row => ({
      id: row.id,
      userId: row.profile_id,
      email: row.email,
      role: row.role,
      active: row.active,
      companyId,
    })))
  }
  return realtime({ table: 'restaurant_members', filter: null, load, onError, key: 'members-' + companyId })
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

export async function loadPilotProfile() {
  const { data, error } = await ready().rpc('get_my_pilot_profile')
  if (error) throw error
  return data || null
}

export async function savePilotProfile({ vehiclePlate, motorcycleType, vehicleColor, acceptingOffers }) {
  const { data, error } = await ready().rpc('save_pilot_profile', {
    p_vehicle_plate: vehiclePlate,
    p_motorcycle_type: motorcycleType,
    p_vehicle_color: vehicleColor,
    p_accepting: acceptingOffers !== false,
  })
  if (error) throw error
  return data
}


const PILOT_BUCKET = 'pilot-documents'
const PILOT_ALLOWED_TYPES = new Set(['image/jpeg','image/png','image/webp','application/pdf'])
const PILOT_MAX_BYTES = 5 * 1024 * 1024

function pilotFileExtension(file) {
  const fromName = String(file?.name || '').split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  const byType = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'application/pdf':'pdf' }
  return byType[file?.type] || 'bin'
}

export async function uploadPilotDocument(file, kind) {
  if (!file) throw new Error('Selecione o arquivo obrigatório.')
  if (!PILOT_ALLOWED_TYPES.has(file.type)) throw new Error('Use JPG, PNG, WEBP ou PDF.')
  if (file.size > PILOT_MAX_BYTES) throw new Error('Cada arquivo pode ter no máximo 5 MB.')
  if (!['profile','motorcycle','cnh-front','cnh-back'].includes(kind)) throw new Error('Tipo de documento inválido.')

  const supabase = ready()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const uid = userData.user?.id
  if (!uid) throw new Error('Entre novamente antes de enviar os documentos.')

  const path = `${uid}/${kind}/${crypto.randomUUID()}.${pilotFileExtension(file)}`
  const { error } = await supabase.storage.from(PILOT_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function removePilotDocuments(paths = []) {
  const clean = paths.filter(Boolean)
  if (!clean.length) return
  const { error } = await ready().storage.from(PILOT_BUCKET).remove(clean)
  if (error) throw error
}

export async function submitPilotApplication({
  cnhCategory, cnhExpiry, profilePhotoPath, motorcyclePhotoPath, cnhFrontPath, cnhBackPath,
}) {
  const { data, error } = await ready().rpc('submit_pilot_application', {
    p_cnh_category: cnhCategory,
    p_cnh_expiry: cnhExpiry,
    p_profile_photo_path: profilePhotoPath,
    p_motorcycle_photo_path: motorcyclePhotoPath,
    p_cnh_front_path: cnhFrontPath,
    p_cnh_back_path: cnhBackPath,
  })
  if (error) throw error
  return data
}

export async function setPilotAvailability(accepting) {
  const { data, error } = await ready().rpc('set_pilot_availability', { p_accepting: accepting === true })
  if (error) throw error
  return data
}

export async function isPlatformAdmin() {
  const { data, error } = await ready().rpc('is_platform_admin')
  if (error) throw error
  return data === true
}

export async function listPilotApplications(status = 'pending') {
  const { data, error } = await ready().rpc('list_pilot_applications', { p_status: status || null })
  if (error) throw error
  return data || []
}

export async function reviewPilotApplication(profileId, approve, reason = '') {
  const { data, error } = await ready().rpc('review_pilot_application', {
    p_profile_id: profileId,
    p_approve: approve === true,
    p_reason: reason,
  })
  if (error) throw error
  return data
}


export async function setPilotAccountStatus(profileId, status, reason = '') {
  const { data, error } = await ready().rpc('set_pilot_account_status', {
    p_profile_id: profileId,
    p_status: status,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

export async function listPlatformRestaurants() {
  const { data, error } = await ready().rpc('list_platform_restaurants')
  if (error) throw error
  return data || []
}

export async function setRestaurantAccountStatus(companyId, status, reason = '') {
  const { data, error } = await ready().rpc('set_restaurant_account_status', {
    p_slug: companyId,
    p_status: status,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

export async function listAuditEvents({ restaurantId = null, limit = 100 } = {}) {
  let query = ready().from('audit_events')
    .select('id,actor_id,restaurant_id,action,target_type,target_id,metadata,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 100)))
  if (restaurantId) query = query.eq('restaurant_id', restaurantId)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function pilotDocumentUrl(path, expiresIn = 600) {
  if (!path) return ''
  const { data, error } = await ready().storage.from(PILOT_BUCKET).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data?.signedUrl || ''
}

export async function listAvailablePilots() {
  const { data, error } = await ready().rpc('list_available_pilots')
  if (error) throw error
  return data || []
}

export function subscribePilotOffers(uid, onChange, onError) {
  const supabase = ready()
  const load = async () => {
    const { data, error } = await supabase.from('order_delivery_offers')
      .select('*, order:orders(*)')
      .eq('pilot_profile_id', uid)
      .in('status', ['pending','accepted'])
      .order('offered_at', { ascending: false })
    if (error) throw error
    onChange((data || []).map(row => ({
      ...row,
      order: row.order ? orderFromRow(row.order) : null,
    })))
  }
  return realtime({ table: 'order_delivery_offers', filter: 'pilot_profile_id=eq.' + uid, load, onError, key: 'pilot-offers' })
}

export async function respondDeliveryOffer(offerId, accept) {
  const { data, error } = await ready().rpc('respond_order_delivery_offer', { p_offer_id: offerId, p_accept: accept === true })
  if (error) throw error
  return data
}

export function subscribePilotOrders(uid, onChange, onError) {
  const supabase = ready()
  const load = async () => {
    const { data, error } = await supabase.from('orders').select('*').eq('assigned_pilot_id', uid).order('created_at', { ascending: false })
    if (error) throw error
    onChange((data || []).map(orderFromRow))
  }
  return realtime({ table: 'orders', filter: 'assigned_pilot_id=eq.' + uid, load, onError, key: 'pilot-orders' })
}

export async function pilotStartDelivery(orderId) {
  return callServer('appPilotStartDelivery', { orderId })
}

export async function pilotConfirmDelivery(orderId, code, received = false) {
  return callServer('appPilotConfirmDelivery', { orderId, code, received })
}

export function subscribeDeliverySecret(orderId, onChange, onError) {
  const supabase = ready()
  const load = async () => {
    const { data, error } = await supabase.from('delivery_secrets').select('code,created_at').eq('order_id', orderId).maybeSingle()
    if (error) throw error
    onChange(data)
  }
  return realtime({ table: 'delivery_secrets', filter: 'order_id=eq.' + orderId, load, onError, key: 'delivery-secret' })
}

export async function listPilotContacts(companyId) {
  const rid = await restaurantIdForSlug(companyId)
  const { data, error } = await ready().from('restaurant_pilot_contacts').select('*').eq('restaurante_id', rid).eq('active', true).order('label')
  if (error) throw error
  return data || []
}

export async function savePilotContact(companyId, contact) {
  const supabase = ready()
  const rid = await restaurantIdForSlug(companyId)
  const { data: userData } = await supabase.auth.getUser()
  const payload = {
    restaurante_id: rid,
    pilot_profile_id: contact.pilotProfileId || null,
    relation_type: contact.relationType === 'partner' ? 'partner' : 'own',
    label: contact.label.trim(),
    contact_type: contact.contactType || 'whatsapp',
    contact_value: contact.contactValue.trim(),
    notes: contact.notes?.trim() || '',
    active: true,
    created_by: userData.user.id,
    updated_at: new Date().toISOString(),
  }
  const query = contact.id
    ? supabase.from('restaurant_pilot_contacts').update(payload).eq('id', contact.id)
    : supabase.from('restaurant_pilot_contacts').insert(payload)
  const { data, error } = await query.select().single()
  if (error) throw error
  return data
}

export async function offerDelivery({ orderId, pilotProfileId = null, pilotContactId = null, message = '' }) {
  const { data, error } = await ready().rpc('create_order_delivery_offer', {
    p_order_id: orderId,
    p_pilot_profile_id: pilotProfileId,
    p_pilot_contact_id: pilotContactId,
    p_message: message,
  })
  if (error) throw error
  return data
}

export async function searchMarketplace(term = '') {
  const supabase = ready()
  const needle = normalizeSearch(term)
  const [{ data: companies, error: companiesError }, { data: products, error: productsError }] = await Promise.all([
    supabase.from('restaurantes').select('id,slug,nome,descricao,telefone,endereco,ativo').eq('ativo', true).limit(100),
    supabase.from('products').select('id,restaurant_id,name,description,category,price_cents,image_url,active,slug,config,promotion').eq('active', true).limit(300),
  ])
  if (companiesError) throw companiesError
  if (productsError) throw productsError
  const companyMap = new Map((companies || []).map(company => [company.id, company]))
  return {
    companies: (companies || [])
      .filter(company => !needle || normalizeSearch(company.nome).includes(needle))
      .map(company => ({ id: company.slug, name: company.nome, active: company.ativo })),
    products: (products || [])
      .map(row => ({
        id: row.slug,
        companyId: companyMap.get(row.restaurant_id)?.slug,
        companyName: companyMap.get(row.restaurant_id)?.nome,
        nome: row.name,
        descricao: row.description,
        categoria: row.category,
        preco: Number(row.price_cents || 0) / 100,
        imagem: row.image_url || '',
        personalizavel: row.config?.personalizavel === true,
        disponivel: row.active,
        promocao: row.promotion,
      }))
      .filter(product => product.companyId && (!needle || [product.nome, product.descricao, product.categoria, product.companyName].some(value => normalizeSearch(value).includes(needle)))),
  }
}
