import { getSupabase } from '../lib/supabase.js'

/**
 * Payment gateway adapter used by application services.
 * Providers are isolated behind the same operation contract so a second
 * provider can be added without changing checkout or company UI.
 *
 * @typedef {Object} PaymentGatewayAdapter
 * @property {(orderId: string) => Promise<object>} createOrderPayment
 * @property {(input: {restaurantId: string, billingType?: string, acceptTerms: boolean, consentTermsVersion: string}) => Promise<object>} createSubscription
 * @property {(input: {restaurantId: string, apiKey: string}) => Promise<object>} registerReceiver
 */

const providers = {
  asaas: {
    orderPayment: 'asaas-order-payment',
    subscription: 'asaas-subscription',
    registerReceiver: 'asaas-register-account',
  },
}

async function invoke(functionName, body) {
  const { data, error } = await getSupabase().functions.invoke(functionName, { body })
  if (error) throw new Error(data?.error?.message || error.message || 'Não foi possível concluir a operação de pagamento.')
  if (data?.error?.message) throw new Error(data.error.message)
  return data
}

/** @returns {PaymentGatewayAdapter} */
export function createPaymentGatewayAdapter(provider = 'asaas') {
  const endpoints = providers[provider]
  if (!endpoints) throw new Error('Provedor de pagamento não configurado: ' + provider)

  return Object.freeze({
    createOrderPayment(orderId) {
      return invoke(endpoints.orderPayment, { orderId })
    },
    createSubscription(input) {
      return invoke(endpoints.subscription, input)
    },
    registerReceiver(input) {
      return invoke(endpoints.registerReceiver, input)
    },
  })
}

export const paymentGateway = createPaymentGatewayAdapter('asaas')
