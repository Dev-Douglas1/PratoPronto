import { assertRespectful } from '../shared/input-policy.js'
import { getSupabase, supabaseConfigured } from '../lib/supabase.js'
import { criarErroSupabase } from '../utils/supabaseError.js'
import { paymentGateway } from './paymentGateway.js'

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
  if (name === 'appCheckout') {
    const order = await rpc('checkout_order', { p_quote_id: data.quoteId, p_request_id: data.requestId })
    if (['pix', 'credit_card'].includes(order?.paymentMethod) && order?.checkoutState === 'awaiting_payment') {
      return { ...order, ...await paymentGateway.createOrderPayment(order.orderId) }
    }
    return order
  }
  if (name === 'appAdvance') return rpc('advance_order', { p_order_id: data.orderId, p_next: data.next, p_received: data.received === true })
  if (name === 'appRefundRequest') return rpc('submit_refund_request', { p_order_id: data.orderId, p_reason: data.reason })
  if (name === 'appRefundDecision') {
    const decision = await rpc('decide_refund_request', {
      p_order_id: data.orderId, p_approve: data.approve === true, p_answer: data.answer,
    })
    if (decision?.requiresGatewayAction) {
      const { data: gatewayResult, error } = await getSupabase().functions.invoke('asaas-refund', { body: { orderId: data.orderId } })
      if (error) throw new Error(gatewayResult?.error?.message || error.message || 'Não foi possível processar a solicitação no Asaas.')
      if (gatewayResult?.error?.message) throw new Error(gatewayResult.error.message)
      return { ...decision, gatewayResult }
    }
    return decision
  }
  if (name === 'appRetryRefund') {
    const { data: gatewayResult, error } = await getSupabase().functions.invoke('asaas-refund', { body: { orderId: data.orderId } })
    if (error) throw new Error(gatewayResult?.error?.message || error.message || 'Não foi possível reprocessar o estorno no Asaas.')
    if (gatewayResult?.error?.message) throw new Error(gatewayResult.error.message)
    return gatewayResult
  }
  if (name === 'appConfirmManualRefund') {
    return rpc('confirm_manual_refund', { p_order_id: data.orderId, p_proof: data.proof })
  }
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
  if (name === 'appCreateCompany') return rpc('submit_company_registration_v2', { p_person_type: data.personType, p_cnpj: data.cnpj || '', p_cpf: data.cpf || '', p_legal_name: data.legalName, p_trade_name: data.name, p_contact_phone: data.phone })
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
      paymentSecrets: ['pix', 'credit_card'].some(method => store?.methods?.includes(method)),
      receiverVerified: ['pix', 'credit_card'].some(method => store?.methods?.includes(method)),
      publicUrlConfigured: true,
      restaurantConfigured: Boolean(store?.configured),
      acceptingOrders: Boolean(store?.open),
      backend: 'supabase',
    }
  }
  if (name === 'appPilotStartDelivery') return rpc('pilot_start_delivery', { p_order_id: data.orderId })
  if (name === 'appPilotConfirmDelivery') return rpc('pilot_confirm_delivery', { p_order_id: data.orderId, p_code: data.code, p_received: data.received === true })
  if (name === 'appSubscription') return rpc('get_my_restaurant_subscription', { p_restaurant_slug: data.companyId })
  if (name === 'appStartSubscription') return paymentGateway.createSubscription({
    restaurantId: data.restaurantId,
    billingType: data.billingType || 'PIX',
    acceptTerms: data.acceptTerms === true,
    consentTermsVersion: data.consentTermsVersion,
  })
  if (name === 'appRegisterAsaasAccount') return paymentGateway.registerReceiver({
    restaurantId: data.restaurantId,
    apiKey: data.apiKey,
  })
  if (name === 'appAdminSubscriptions') return rpc('list_platform_subscriptions')
  if (name === 'appAdminPlans') return rpc('list_admin_subscription_plans')
  if (name === 'appSavePlan') return rpc('admin_save_subscription_plan', {
    p_code: data.code, p_name: data.name, p_description: data.description || '',
    p_monthly_price_cents: data.monthlyPriceCents,
    p_product_limit: data.productLimit, p_member_limit: data.memberLimit,
    p_monthly_order_limit: data.monthlyOrderLimit,
    p_is_active: data.active === true, p_is_public: data.public === true,
  })
  if (name === 'appAssignPlan') return rpc('admin_set_restaurant_subscription', {
    p_restaurant_id: data.restaurantId, p_plan_code: data.planCode,
    p_period_end: data.periodEnd || null,
  })
  if (name === 'appPrivacyRequest') return rpc('request_account_deletion')
  if (name === 'appMigrateDefaultCompany') return { companyId: 'pratopronto', changed: 0 }
  if (name === 'appResume') return paymentGateway.createOrderPayment(data.orderId)
  if (name === 'appRetryPayment') return paymentGateway.createOrderPayment(data.orderId)
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
    return url.protocol === 'https:' && ['www.asaas.com','asaas.com','sandbox.asaas.com','www.asaas.com.br','asaas.com.br'].includes(url.hostname) && !url.username && !url.password ? url.href : null
  } catch { return null }
}
