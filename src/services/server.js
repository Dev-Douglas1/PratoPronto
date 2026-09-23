import { assertRespectful } from '../shared/input-policy.js'
import { getSupabase, supabaseConfigured } from '../lib/supabase.js'
import { criarErroSupabase } from '../utils/supabaseError.js'

async function rpc(name, args = {}) {
  if (!supabaseConfigured) throw new Error('O Supabase ainda não foi configurado.')
  const { data, error } = await getSupabase().rpc(name, args)
  if (error) throw criarErroSupabase(error)
  return data
}

export async function callServer(name, data = {}) {
  if (name === 'appQuote') {
    assertRespectful(data.note || '', 'a observação')
    return rpc('quote_order', {
      p_restaurant_slug: data.companyId || 'pratopronto',
      p_items: data.items,
      p_method: data.method,
      p_note: data.note || '',
      p_accept_terms: data.acceptTerms === true,
    })
  }
  if (name === 'appCheckout') return rpc('checkout_order', { p_quote_id: data.quoteId, p_request_id: data.requestId })
  if (name === 'appAdvance') return rpc('advance_order', { p_order_id: data.orderId, p_next: data.next, p_received: data.received === true })
  if (name === 'appRefundRequest') return rpc('submit_refund_request', { p_order_id: data.orderId, p_reason: data.reason })
  if (name === 'appRefundDecision') return rpc('decide_refund_request', { p_order_id: data.orderId, p_approve: data.approve === true, p_answer: data.answer })
  if (name === 'appStorefront') return rpc('get_storefront', { p_slug: data.companyId || 'pratopronto' })
  if (name === 'appMyCompanies') {
    const rows = await rpc('my_restaurants')
    return (rows || []).map(row => ({
      companyId: row.company_id,
      restaurantId: row.restaurant_id,
      name: row.name,
      role: row.role,
      permissions: row.permissions || [],
      accountStatus: row.account_status || 'active',
      blockedReason: row.blocked_reason || '',
    }))
  }
  if (name === 'appCreateCompany') return rpc('create_restaurant', { p_slug: data.companyId, p_name: data.name })
  // p_email is kept for compatibility with already published clients; the RPC also accepts a full account UUID.
  if (name === 'appSaveCompanyMember') return rpc('add_restaurant_member', { p_restaurant_slug: data.companyId, p_email: data.identifier ?? data.email, p_role: data.role })
  if (name === 'appRemoveCompanyMember') return rpc('remove_restaurant_member', { p_restaurant_slug: data.companyId, p_profile_id: data.userId })
  if (name === 'appSaveCompanyProduct') return rpc('save_restaurant_product', {
    p_restaurant_slug: data.companyId,
    p_product_slug: data.productId,
    p_name: data.nome,
    p_description: data.descricao || '',
    p_category: data.categoria || 'Outros',
    p_price_cents: Math.round(Number(data.preco) * 100),
    p_image_url: data.imagem || '',
    p_active: data.disponivel !== false,
    p_config: { personalizavel: data.personalizavel === true },
    p_promotion: data.promocao || null,
  })
  if (name === 'appSaveSettings') {
    const { companyId = 'pratopronto', ...settings } = data
    return rpc('save_restaurant_settings', { p_restaurant_slug: companyId, p_data: settings })
  }
  if (name === 'appReadiness') {
    const store = await rpc('get_storefront', { p_slug: data.companyId || 'pratopronto' })
    return {
      companyId: data.companyId || 'pratopronto',
      environment: 'production',
      liveEnabled: true,
      appCheck: true,
      paymentSecrets: false,
      receiverVerified: false,
      publicUrlConfigured: true,
      restaurantConfigured: Boolean(store?.configured),
      acceptingOrders: Boolean(store?.open),
      backend: 'supabase',
    }
  }
  if (name === 'appPilotStartDelivery') return rpc('pilot_start_delivery', { p_order_id: data.orderId })
  if (name === 'appPilotConfirmDelivery') return rpc('pilot_confirm_delivery', { p_order_id: data.orderId, p_code: data.code, p_received: data.received === true })
  if (name === 'appPrivacyRequest') return rpc('request_account_deletion')
  if (name === 'appMigrateDefaultCompany') return { companyId: 'pratopronto', changed: 0 }
  if (name === 'appResume') throw new Error('Pagamento online está desativado durante a migração para o Supabase.')
  if (name === 'appRetryPayment' || name === 'appConfirmManualRefund') throw new Error('Esta ação não é necessária enquanto o pagamento é feito na entrega.')
  throw new Error('Ação não disponível no backend Supabase: ' + name)
}

export function cartItems(lista) {
  return lista.map(({ produto, quantidade }) => {
    const [base, tamanho, borda, additions] = produto.id.split('--')
    const opcoes = produto.opcoes || (tamanho ? { tamanho, borda, extras: additions && additions !== 'sem-extra' ? additions.split('.') : [] } : {})
    return { id: produto.produtoBaseId || base, quantidade, opcoes }
  })
}

export function checkoutUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['www.mercadopago.com.br','sandbox.mercadopago.com.br'].includes(url.hostname) && !url.username && !url.password ? url.href : null
  } catch { return null }
}
