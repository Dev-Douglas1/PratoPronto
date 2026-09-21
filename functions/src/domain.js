import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { produtos, tamanhos, bordas, extras } from './catalog-data.js'
import { assertRespectful, validatePhone } from './input-policy.js'
import { promotionalPrice } from './promotions.js'

export class DomainError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
export function requireThat(condition, message, code = 'invalid-argument') {
  if (!condition) throw new DomainError(code, message)
}
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex')
export const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
export function text(value, label, min = 1, max = 180) {
  requireThat(typeof value === 'string', 'Preencha ' + label + '.')
  const result = value.trim()
  requireThat(result.length >= min && result.length <= max, 'Confira ' + label + '.')
  return result
}
export function publicText(value, label, min = 1, max = 180) {
  const result = text(value, label, min, max)
  try { return assertRespectful(result, label) } catch (error) { throw new DomainError('invalid-argument', error.message) }
}
export function phone(value) {
  try { return validatePhone(value) } catch (error) { throw new DomainError('invalid-argument', error.message) }
}
export function cents(value) {
  requireThat(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000, 'Valor inválido.')
  const result = Math.round(value * 100)
  requireThat(Math.abs(result - value * 100) < 0.00001, 'Use até duas casas decimais no preço.')
  return result
}
export function address(input = {}) {
  const cep = String(input.cep || '').replace(/\D/g, '')
  const uf = String(input.uf || '').trim().toUpperCase()
  requireThat(/^\d{8}$/.test(cep), 'Preencha um CEP com 8 números no perfil.')
  requireThat(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(uf), 'Escolha o estado no perfil.')
  return { endereco: text(input.endereco, 'a rua', 2), numero: text(input.numero, 'o número', 1, 20), bairro: text(input.bairro, 'o bairro', 2, 100), complemento: text(input.complemento || '', 'o complemento', 0), cidade: text(input.cidade, 'a cidade', 2, 100), uf, cep }
}
export function validateSettings(input) {
  requireThat(input && typeof input === 'object', 'Confira as configurações.')
  const timezone = text(input.timezone || 'America/Sao_Paulo', 'o fuso horário', 1, 80)
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format() } catch { throw new DomainError('invalid-argument', 'Fuso horário inválido.') }
  const hours = input.hours
  requireThat(Array.isArray(hours) && hours.length === 7, 'Configure os horários dos sete dias da semana.')
  hours.forEach(day => {
    requireThat(Array.isArray(day) && day.length <= 3, 'Use até três intervalos por dia.')
    let previous = -1
    for (const slot of day) {
      requireThat(Number.isInteger(slot.start) && Number.isInteger(slot.end) && slot.start >= 0 && slot.end <= 1440 && slot.end > slot.start && slot.start >= previous, 'Confira os horários. Separe os intervalos que atravessam a meia-noite.')
      previous = slot.end
    }
  })
  requireThat(Array.isArray(input.zones) && input.zones.length > 0 && input.zones.length <= 100, 'Cadastre de 1 a 100 bairros atendidos.')
  const zones = input.zones.map(zone => ({ bairro: text(zone.bairro, 'o bairro de entrega', 2, 100), feeCents: cents(Number(zone.fee)), minCents: cents(Number(zone.min || 0)), freeAboveCents: zone.freeAbove === '' || zone.freeAbove == null ? null : cents(Number(zone.freeAbove)) }))
  requireThat(new Set(zones.map(z => normalize(z.bairro))).size === zones.length, 'Há bairros repetidos.')
  const methods = [...new Set(input.methods || [])]
  requireThat(methods.length > 0 && methods.every(m => ['pix','cartao_online','maquina_entrega'].includes(m)), 'Escolha pelo menos uma forma de pagamento.')
  requireThat(Number.isInteger(input.estimateMinutes) && input.estimateMinutes >= 10 && input.estimateMinutes <= 240, 'Informe uma previsão de 10 a 240 minutos.')
  requireThat(Number.isInteger(input.retentionDays) && input.retentionDays >= 30 && input.retentionDays <= 3650, 'Defina o prazo de retenção operacional (30 a 3.650 dias).')
  return {
    name: publicText(input.name, 'o nome da empresa', 2, 100), legalName: publicText(input.legalName, 'o responsável legal', 2, 160),
    document: text(input.document || '', 'o CPF/CNPJ da empresa', 0, 25),
    phone: phone(input.phone), privacyEmail: text(input.privacyEmail, 'o contato de privacidade', 5, 254),
    address: address(input.address), timezone, hours: Object.fromEntries(hours.map((day, index) => [String(index), day.map(({ start, end }) => ({ start, end }))])), zones, methods,
    estimateMinutes: input.estimateMinutes, retentionDays: input.retentionDays, acceptingOrders: input.acceptingOrders === true,
  }
}
export function isOpen(settings, now = new Date()) {
  if (!settings?.acceptingOrders) return false
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: settings.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]))
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday)
  const minute = Number(parts.hour) * 60 + Number(parts.minute)
  return (settings.hours?.[day] || []).some(slot => minute >= slot.start && minute < slot.end)
}
export function normalizeItemShape(input) {
  requireThat(Array.isArray(input) && input.length > 0 && input.length <= 50, 'Use de 1 a 50 tipos de itens por pedido.')
  return input.map(item => {
    requireThat(typeof item?.id === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(item.id), 'Há um produto inválido no carrinho.')
    requireThat(Number.isInteger(item.quantidade) && item.quantidade >= 1 && item.quantidade <= 50, 'Use de 1 a 50 unidades de cada item.')
    const options = item.opcoes && typeof item.opcoes === 'object' ? item.opcoes : {}
    return { id: item.id, quantidade: item.quantidade, opcoes: options }
  })
}
export function normalizeItems(input, catalogProducts = produtos) {
  const shaped = normalizeItemShape(input)
  const items = shaped.map(item => {
    const base = catalogProducts.find(p => p.id === item.id)
    requireThat(base, 'Há um produto desconhecido no carrinho. Adicione novamente pelo cardápio.')
    const options = item.opcoes || {}
    if (!base.personalizavel) {
      requireThat(!options.tamanho && !options.borda && (!options.extras || options.extras.length === 0), 'Opções inválidas para este produto.')
      return { id: base.id, quantidade: item.quantidade, opcoes: {} }
    }
    const size = tamanhos.find(o => o.id === (options.tamanho || 'grande'))
    const crust = bordas.find(o => o.id === (options.borda || 'tradicional'))
    const additions = options.extras || []
    requireThat(size && crust && Array.isArray(additions) && additions.length <= extras.length && new Set(additions).size === additions.length && additions.every(id => extras.some(o => o.id === id)), 'Confira tamanho, borda e adicionais da pizza.')
    return { id: base.id, quantidade: item.quantidade, opcoes: { tamanho: size.id, borda: crust.id, extras: [...additions].sort() } }
  })
  requireThat(new Set(items.map(item => hash([item.id, item.opcoes]))).size === items.length, 'Agrupe os itens iguais no carrinho.')
  return items
}
export function priceOrder({ items, delivery, settings, productSettings = {}, catalogProducts = produtos, now = new Date() }) {
  requireThat(settings?.address && isOpen(settings, now), 'O restaurante está fechado para novos pedidos neste horário.', 'failed-precondition')
  const entrega = address(delivery)
  requireThat(normalize(entrega.cidade) === normalize(settings.address.cidade) && entrega.uf === settings.address.uf, 'Este endereço está fora da cidade atendida.', 'failed-precondition')
  const zone = settings.zones.find(z => normalize(z.bairro) === normalize(entrega.bairro))
  requireThat(zone, 'Ainda não entregamos neste bairro.', 'failed-precondition')
  const normalizedItems = normalizeItems(items, catalogProducts)
  const itens = normalizedItems.map(item => {
    const base = catalogProducts.find(p => p.id === item.id)
    const setting = productSettings[item.id]
    requireThat(setting?.disponivel !== false, base.nome + ' está indisponível.', 'failed-precondition')
    let unit = cents(setting?.preco ?? base.preco)
    const details = []
    if (base.personalizavel) {
      const size = tamanhos.find(o => o.id === item.opcoes.tamanho)
      const crust = bordas.find(o => o.id === item.opcoes.borda)
      const additions = extras.filter(o => item.opcoes.extras.includes(o.id))
      unit += Math.round((size.ajuste + crust.ajuste + additions.reduce((n, o) => n + o.ajuste, 0)) * 100)
      details.push(size.nome, 'borda ' + crust.nome.toLowerCase(), ...additions.map(o => o.nome))
    }
    requireThat(unit > 0 && unit <= 200000, 'O preço de ' + base.nome + ' precisa ser corrigido pela empresa.', 'failed-precondition')
    const offer = promotionalPrice(unit, setting?.promocao, now)
    return { precoOriginal: unit / 100, descontoUnitario: offer.discountCents / 100, promocao: offer.promotion, id: item.id + '--' + hash(item.opcoes).slice(0, 12), produtoBaseId: base.id, nome: base.nome, detalhes: details.join(' • '), quantidade: item.quantidade, precoUnitario: offer.finalCents / 100, unitCents: offer.finalCents, opcoes: item.opcoes }
  })
  const subtotalCents = itens.reduce((n, item) => n + item.unitCents * item.quantidade, 0)
  requireThat(subtotalCents >= zone.minCents, 'O pedido mínimo para este bairro é R$ ' + (zone.minCents / 100).toFixed(2).replace('.', ',') + '.', 'failed-precondition')
  const deliveryCents = zone.freeAboveCents !== null && subtotalCents >= zone.freeAboveCents ? 0 : zone.feeCents
  const totalCents = subtotalCents + deliveryCents
  requireThat(totalCents > 0 && totalCents <= 500000, 'O limite por pedido é R$ 5.000,00. Entre em contato com a empresa para pedidos maiores.')
  return { itens, entrega, subtotal: subtotalCents / 100, taxaEntrega: deliveryCents / 100, total: totalCents / 100, totalCents, estimateMinutes: settings.estimateMinutes }
}
export function verifyWebhook({ signature, requestId, dataId, secret }) {
  if (!secret || typeof signature !== 'string' || typeof requestId !== 'string' || typeof dataId !== 'string' || !/^\d{1,30}$/.test(dataId) || requestId.length > 150) return false
  const parts = Object.fromEntries(signature.split(',').map(s => s.trim().split('=')))
  if (!/^\d{10,16}$/.test(parts.ts || '') || !/^[a-f0-9]{64}$/i.test(parts.v1 || '')) return false
  // Delivery retries may legitimately carry an old timestamp. Replay safety is
  // provided by durable event deduplication and authoritative payment reads.
  const digest = createHmac('sha256', secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`).digest()
  return timingSafeEqual(digest, Buffer.from(parts.v1, 'hex'))
}
export function verifyPayment(payment, order, config) {
  requireThat(payment.external_reference === order.id && String(payment.collector_id) === String(config.collectorId) && payment.currency_id === 'BRL' && cents(payment.transaction_amount) === order.totalCents && payment.live_mode === (config.environment === 'production') && order.pagamento.ambiente === (config.environment === 'production' ? 'producao' : 'teste'), 'Pagamento não corresponde ao pedido ou à conta recebedora.', 'failed-precondition')
  requireThat(order.pagamento.metodo !== 'maquina_entrega', 'Pagamento online inesperado para pedido na entrega.', 'failed-precondition')
}
export const NEXT = { confirmado: 'preparando', preparando: 'pronto', pronto: 'saiu_entrega', saiu_entrega: 'entregue' }
