import { DomainError, requireThat } from './domain.js'

export function mercadoPago({ token, origin, webhookUrl, environment, fetcher = fetch }) {
  async function request(path, { method = 'GET', body, key } = {}) {
    requireThat(token, 'Pagamento online ainda não ativado pela empresa.', 'failed-precondition')
    let response
    try {
      response = await fetcher('https://api.mercadopago.com' + path, {
        method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(key ? { 'X-Idempotency-Key': key } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
      })
    } catch {
      throw new DomainError('unavailable', 'A confirmação do Mercado Pago está demorando. Consulte o pedido antes de tentar novamente.')
    }
    if (!response.ok) {
      // Never forward provider payloads: they can contain credentials or payer data.
      throw new DomainError(response.status >= 500 || response.status === 429 ? 'unavailable' : 'failed-precondition', 'O Mercado Pago não concluiu a operação. A empresa precisa conferir a integração.')
    }
    return response.json()
  }
  return {
    async preference(order) {
      const back = origin + '/acompanhamento?pedido=' + encodeURIComponent(order.id)
      const selectedType = order.pagamento.metodo === 'pix' ? 'bank_transfer' : order.pagamento.modalidade === 'debito' ? 'debit_card' : 'credit_card'
      const methods = await request('/v1/payment_methods')
      const available = methods.filter(method => method.status === 'active')
      requireThat(available.some(method => order.pagamento.metodo === 'pix' ? method.id === 'pix' : method.payment_type_id === selectedType), 'Esta forma de pagamento não está disponível no Mercado Pago desta empresa. Escolha outra opção.', 'failed-precondition')
      const excludedTypes = [...new Set(available.map(method => method.payment_type_id))].filter(type => type !== selectedType)
      const result = await request('/checkout/preferences', { method: 'POST', body: {
        items: [{ id: order.id, title: 'Pedido PratoPronto #' + order.id.slice(-8), currency_id: 'BRL', quantity: 1, unit_price: order.totalCents / 100 }],
        payer: { email: order.cliente.email }, external_reference: order.id,
        back_urls: { success: back, pending: back, failure: back }, auto_return: 'approved',
        notification_url: webhookUrl, binary_mode: false,
        expires: true, expiration_date_to: new Date(order.expiresAt).toISOString(),
        payment_methods: { excluded_payment_types: excludedTypes.map(id => ({ id })), installments: 1 },
      } })
      const url = environment === 'production' ? result.init_point : result.sandbox_init_point
      requireThat(isCheckoutUrl(url), 'O provedor não retornou um endereço de pagamento válido.', 'unavailable')
      return { id: String(result.id), url }
    },
    payment: id => request('/v1/payments/' + encodeURIComponent(id)),
    async search(orderId) {
      const result = await request('/v1/payments/search?external_reference=' + encodeURIComponent(orderId) + '&sort=date_created&criteria=desc&limit=50')
      return result.results || []
    },
    refund: (paymentId, key) => request('/v1/payments/' + encodeURIComponent(paymentId) + '/refunds', { method: 'POST', body: {}, key }),
    account: () => request('/users/me'),
  }
}
export function isCheckoutUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['www.mercadopago.com.br','sandbox.mercadopago.com.br'].includes(url.hostname) && !url.username && !url.password } catch { return false }
}
