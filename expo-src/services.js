import { supabase } from './supabase'

export const PRIVACY_POLICY_VERSION = '2026-09-15'
export const TERMS_VERSION = '2026-09-09'
export const DEFAULT_COMPANY_ID = 'pratopronto'

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11)
}

export function brazilPhone(value) {
  const digits = normalizePhone(value)
  if (!/^[1-9][0-9]{9,10}$/.test(digits)) throw new Error('Informe DDD + telefone com 10 ou 11 números.')
  return '+55' + digits
}

export function normalizeCep(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8)
}

export function validatePassword(value) {
  const password = String(value || '')
  if (password.length < 6 || password.length > 12) throw new Error('A senha deve ter de 6 a 12 caracteres.')
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Use pelo menos uma letra minúscula, uma maiúscula e um número.')
  }
  return password
}

export function profileComplete(profile) {
  return Boolean(
    profile?.nome?.trim() &&
    profile?.telefone?.trim() &&
    profile?.cep?.trim() &&
    profile?.cidade?.trim() &&
    profile?.uf?.trim() &&
    profile?.endereco?.trim() &&
    profile?.numero?.trim() &&
    profile?.bairro?.trim() &&
    profile?.privacyPolicyVersion &&
    profile?.termsVersion
  )
}

export function profileFromRow(row, user) {
  if (!row && !user) return null
  return {
    uid: row?.id || user?.id,
    nome: row?.nome || user?.user_metadata?.nome || user?.user_metadata?.full_name || user?.user_metadata?.name || '',
    email: row?.email || user?.email || '',
    telefone: row?.telefone || String(user?.phone || '').replace(/^\+55/, '') || '',
    avatarUrl: row?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '',
    endereco: row?.endereco || '',
    numero: row?.numero || '',
    bairro: row?.bairro || '',
    complemento: row?.complemento || '',
    cep: row?.cep || '',
    cidade: row?.cidade || '',
    uf: row?.uf || '',
    aceitarMarketing: Boolean(row?.aceitar_marketing),
    privacyPolicyVersion: row?.privacy_policy_version || null,
    termsVersion: row?.terms_version || null,
    consentTimestamp: row?.consent_timestamp || null,
  }
}

export async function loadProfile(user) {
  if (!user?.id) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) throw error
  const profile = profileFromRow(data, user)
  const { data: companies } = await supabase.rpc('my_restaurants')
  return { ...profile, admin: Array.isArray(companies) && companies.length > 0 }
}

export async function saveProfile(uid, input) {
  const payload = {
    id: uid,
    nome: input.nome?.trim() || '',
    email: input.email?.trim().toLowerCase() || '',
    telefone: normalizePhone(input.telefone),
    endereco: input.endereco?.trim() || '',
    numero: input.numero?.trim() || '',
    bairro: input.bairro?.trim() || '',
    complemento: input.complemento?.trim() || '',
    cep: normalizeCep(input.cep),
    cidade: input.cidade?.trim() || '',
    uf: input.uf?.trim().toUpperCase() || '',
    aceitar_marketing: Boolean(input.aceitarMarketing),
    privacy_policy_version: PRIVACY_POLICY_VERSION,
    terms_version: TERMS_VERSION,
    consent_timestamp: input.consentTimestamp || new Date().toISOString(),
  }
  const { data, error } = await supabase.from('profiles').upsert(payload).select().single()
  if (error) throw error
  return profileFromRow(data)
}

export async function loadCatalog(companyId = DEFAULT_COMPANY_ID) {
  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurantes')
    .select('id,slug,nome,descricao,telefone,endereco,ativo')
    .eq('slug', companyId)
    .maybeSingle()
  if (restaurantError) throw restaurantError
  if (!restaurant) return { store: null, products: [] }

  const [{ data: products, error: productsError }, storefront] = await Promise.all([
    supabase.from('products').select('*').eq('restaurant_id', restaurant.id).eq('active', true).order('name'),
    supabase.rpc('get_storefront', { p_slug: companyId }),
  ])
  if (productsError) throw productsError
  if (storefront.error) throw storefront.error

  return {
    store: storefront.data || { companyId, name: restaurant.nome, open: restaurant.ativo, methods: ['maquina_entrega'] },
    products: (products || []).map(row => ({
      id: row.slug,
      companyId,
      nome: row.name,
      descricao: row.description || '',
      categoria: row.category || 'Outros',
      preco: Number(row.price_cents || 0) / 100,
      imagem: row.image_url || '',
      personalizavel: row.config?.personalizavel === true,
      promocao: row.promotion || null,
    })),
  }
}

export function cartItems(items) {
  return items.map(item => ({
    id: item.produto.produtoBaseId || item.produto.id,
    quantidade: item.quantidade,
    opcoes: item.produto.opcoes || {},
  }))
}

export async function createQuote({ companyId, items, method, note, acceptTerms }) {
  const { data, error } = await supabase.rpc('quote_order', {
    p_restaurant_slug: companyId || DEFAULT_COMPANY_ID,
    p_items: cartItems(items),
    p_method: method,
    p_note: note || '',
    p_accept_terms: acceptTerms === true,
  })
  if (error) throw error
  return data
}

export async function checkoutQuote(quoteId, requestId) {
  const { data, error } = await supabase.rpc('checkout_order', {
    p_quote_id: quoteId,
    p_request_id: requestId,
  })
  if (error) throw error
  return data
}

export async function loadOrders(userId) {
  const { data, error } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function loadMyCompanies() {
  const { data, error } = await supabase.rpc('my_restaurants')
  if (error) throw error
  return data || []
}

export async function loadCompanyCatalog(restaurantId) {
  const { data, error } = await supabase.rpc('company_catalog_list', { p_restaurant_id: restaurantId })
  if (error) throw error
  return data || []
}

export async function saveCompanyProduct(restaurantId, input) {
  const price = Number(String(input.price || '0').replace(',', '.'))
  if (!Number.isFinite(price) || price < 0) throw new Error('Informe um preço válido.')
  const { data, error } = await supabase.rpc('company_catalog_save', {
    p_restaurant_id: restaurantId,
    p_product_id: input.id || null,
    p_name: String(input.name || '').trim(),
    p_description: String(input.description || '').trim(),
    p_category: String(input.category || 'Outros').trim(),
    p_price_cents: Math.round(price * 100),
    p_image_url: String(input.imageUrl || '').trim() || null,
    p_active: input.active !== false,
  })
  if (error) throw error
  return data
}

export async function setCompanyProductActive(restaurantId, productId, active) {
  const { data, error } = await supabase.rpc('company_catalog_set_active', {
    p_restaurant_id: restaurantId,
    p_product_id: productId,
    p_active: active === true,
  })
  if (error) throw error
  return data
}

export async function loadCompanyOrders(restaurantId) {
  const { data, error } = await supabase.from('orders').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data || []
}

export async function advanceOrder(orderId, next, received = false) {
  const { data, error } = await supabase.rpc('advance_order', {
    p_order_id: orderId,
    p_next: next,
    p_received: received === true,
  })
  if (error) throw error
  return data
}

export async function loadPilotProfile() {
  const { data, error } = await supabase.rpc('get_my_pilot_profile')
  if (error) throw error
  return data || null
}

export async function savePilotProfile(input) {
  const { data, error } = await supabase.rpc('save_pilot_profile', {
    p_vehicle_plate: input.vehiclePlate,
    p_motorcycle_type: input.motorcycleType,
    p_vehicle_color: input.vehicleColor,
    p_accepting: false,
  })
  if (error) throw error
  return data
}

export async function uploadPilotDocument(asset, kind) {
  if (!asset?.uri) throw new Error('Selecione o arquivo obrigatório.')
  if (!['profile','motorcycle','cnh-front','cnh-back'].includes(kind)) throw new Error('Tipo de documento inválido.')
  if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error('Cada arquivo pode ter no máximo 5 MB.')

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const uid = userData.user?.id
  if (!uid) throw new Error('Entre novamente antes de enviar documentos.')

  const response = await fetch(asset.uri)
  const body = await response.arrayBuffer()
  const path = `${uid}/${kind}`
  const { error } = await supabase.storage.from('pilot-documents').upload(path, body, {
    contentType: asset.mimeType || 'image/jpeg',
    cacheControl: '3600',
    upsert: true,
  })
  if (error) throw error
  return path
}

export async function submitPilotApplication(input) {
  const { data, error } = await supabase.rpc('submit_pilot_application', {
    p_cnh_category: input.cnhCategory,
    p_cnh_expiry: input.cnhExpiry,
    p_profile_photo_path: input.profilePhotoPath,
    p_motorcycle_photo_path: input.motorcyclePhotoPath,
    p_cnh_front_path: input.cnhFrontPath,
    p_cnh_back_path: input.cnhBackPath,
  })
  if (error) throw error
  return data
}

export async function setPilotAvailability(value) {
  const { data, error } = await supabase.rpc('set_pilot_availability', { p_accepting: value === true })
  if (error) throw error
  return data
}

export async function loadPilotOffers(profileId) {
  const { data, error } = await supabase.from('order_delivery_offers')
    .select('*, order:orders(*)')
    .eq('pilot_profile_id', profileId)
    .in('status', ['pending','accepted'])
    .order('offered_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function respondPilotOffer(offerId, accept) {
  const { data, error } = await supabase.rpc('respond_order_delivery_offer', { p_offer_id: offerId, p_accept: accept === true })
  if (error) throw error
  return data
}

export async function loadPilotOrders(profileId) {
  const { data, error } = await supabase.from('orders').select('*').eq('assigned_pilot_id', profileId).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function pilotStartDelivery(orderId) {
  const { data, error } = await supabase.rpc('pilot_start_delivery', { p_order_id: orderId })
  if (error) throw error
  return data
}

export async function pilotConfirmDelivery(orderId, code, received = false) {
  const { data, error } = await supabase.rpc('pilot_confirm_delivery', {
    p_order_id: orderId,
    p_code: String(code || ''),
    p_received: received === true,
  })
  if (error) throw error
  return data
}

export async function profileStats(uid) {
  const results = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'entregue'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('user_id', uid),
  ])
  for (const result of results) if (result.error) throw result.error
  return { orders: results[0].count || 0, delivered: results[1].count || 0, reviews: results[2].count || 0 }
}
