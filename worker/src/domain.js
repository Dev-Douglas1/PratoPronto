export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const BASE_CATALOG = {
  calabresa: { nome: 'Calabresa', preco: 58.9, tipo: 'pizza' },
  'quatro-queijos': { nome: '4 Queijos', preco: 62.9, tipo: 'pizza' },
  estrogonofe: { nome: 'Estrogonofe', preco: 59.9, tipo: 'pizza' },
  'frango-catupiry': { nome: 'Frango com Catupiry', preco: 59.9, tipo: 'pizza' },
  mussarela: { nome: 'Mussarela', preco: 54.9, tipo: 'pizza' },
  'lombo-canadense': { nome: 'Lombo Canadense', preco: 61.9, tipo: 'pizza' },
  'coca-cola': { nome: 'Coca-Cola', preco: 7.99, tipo: 'bebida' },
  guarana: { nome: 'Guaraná', preco: 6.99, tipo: 'bebida' },
  fanta: { nome: 'Fanta', preco: 7.99, tipo: 'bebida' },
  sprite: { nome: 'Sprite', preco: 7.99, tipo: 'bebida' },
  monster: { nome: 'Monster', preco: 15.49, tipo: 'bebida' },
  'red-bull': { nome: 'Red Bull', preco: 15.49, tipo: 'bebida' },
}

const TAMANHOS = {
  P: { label: 'Pequena', ajuste: -10 },
  M: { label: 'Média', ajuste: -5 },
  G: { label: 'Grande', ajuste: 0 },
}

const BORDAS = {
  sem: { label: 'Sem borda recheada', ajuste: 0 },
  catupiry: { label: 'Catupiry', ajuste: 8 },
  cheddar: { label: 'Cheddar', ajuste: 8 },
}

const ADICIONAIS = {
  bacon: { label: 'Bacon', ajuste: 6 },
  catupiry: { label: 'Catupiry extra', ajuste: 6 },
  cebola: { label: 'Cebola', ajuste: 3 },
  azeitona: { label: 'Azeitona', ajuste: 3 },
}

export const DEFAULT_DELIVERY = {
  defaultFee: 8,
  freeOver: 120,
  areas: [
    { bairro: 'Centro', fee: 5 },
    { bairro: 'Maracanã', fee: 6 },
    { bairro: 'Guaraituba', fee: 7 },
    { bairro: 'Roça Grande', fee: 8 },
  ],
}

export function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function requiredText(value, label, maxLength) {
  const text = cleanText(value, maxLength)
  if (!text) throw new ApiError(409, 'profile-incomplete', `${label} não está preenchido no perfil.`)
  return text
}

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function toCents(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new ApiError(409, 'invalid-price', 'Preço inválido no catálogo.')
  return Math.round(number * 100)
}

function fromCents(value) {
  return Number((value / 100).toFixed(2))
}

function parseQuantity(value) {
  const quantity = Number(value)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new ApiError(400, 'invalid-quantity', 'Quantidade de produto inválida.')
  }
  return quantity
}

function normalizeCustomization(product, raw) {
  if (product.tipo !== 'pizza') return { personalizacao: null, ajusteCentavos: 0 }

  const data = raw && typeof raw === 'object' ? raw : {}
  const tamanhoId = String(data.tamanho || 'G')
  const bordaId = String(data.borda || 'sem')
  const tamanho = TAMANHOS[tamanhoId]
  const borda = BORDAS[bordaId]
  if (!tamanho || !borda) throw new ApiError(400, 'invalid-customization', 'Personalização de pizza inválida.')

  const adicionais = [...new Set((Array.isArray(data.adicionais) ? data.adicionais : []).map(String))]
  if (adicionais.length > 4 || adicionais.some((id) => !ADICIONAIS[id])) {
    throw new ApiError(400, 'invalid-extras', 'Adicionais da pizza são inválidos.')
  }

  const extrasLabels = adicionais.map((id) => ADICIONAIS[id].label)
  const ajuste = tamanho.ajuste + borda.ajuste + adicionais.reduce((sum, id) => sum + ADICIONAIS[id].ajuste, 0)
  return {
    personalizacao: {
      tamanho: tamanhoId,
      tamanhoLabel: tamanho.label,
      borda: bordaId,
      bordaLabel: borda.label,
      adicionais,
      extrasLabels,
      observacao: cleanText(data.observacao, 300),
      ajuste,
    },
    ajusteCentavos: toCents(ajuste),
  }
}

export function parseItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 50) {
    throw new ApiError(400, 'invalid-items', 'O pedido precisa ter entre 1 e 50 itens.')
  }

  return rawItems.map((raw) => {
    const id = cleanText(raw?.id, 100)
    if (!BASE_CATALOG[id]) throw new ApiError(400, 'unknown-product', 'Há um produto desconhecido no pedido.')
    return {
      id,
      quantidade: parseQuantity(raw?.quantidade),
      personalizacaoOriginal: raw?.personalizacao ?? null,
    }
  })
}

export function effectiveDeliveryConfig(snapshot) {
  if (!snapshot?.exists) return DEFAULT_DELIVERY
  const data = snapshot.data || {}
  return {
    defaultFee: Number.isFinite(Number(data.defaultFee)) ? Number(data.defaultFee) : DEFAULT_DELIVERY.defaultFee,
    freeOver: Number.isFinite(Number(data.freeOver)) ? Number(data.freeOver) : DEFAULT_DELIVERY.freeOver,
    areas: Array.isArray(data.areas) ? data.areas : DEFAULT_DELIVERY.areas,
  }
}

function calculateDelivery(config, bairro, subtotalCents) {
  const freeOverCents = Math.max(0, toCents(config.freeOver))
  if (freeOverCents > 0 && subtotalCents >= freeOverCents) return 0

  const bairroKey = normalizeKey(bairro)
  const area = config.areas.find((item) => normalizeKey(item?.bairro) === bairroKey)
  const feeCents = toCents(area ? area.fee : config.defaultFee)
  if (feeCents < 0 || feeCents > 100000) {
    throw new ApiError(409, 'invalid-delivery-fee', 'A taxa de entrega configurada é inválida.')
  }
  return feeCents
}

export function buildCanonicalOrder(parsedItems, catalog, profile, deliveryConfig) {
  const stockNeeded = new Map()
  let subtotalCents = 0

  const itens = parsedItems.map((item) => {
    const base = BASE_CATALOG[item.id]
    const snapshot = catalog.get(item.id)
    const override = snapshot?.exists ? snapshot.data : null
    if (override?.available === false) {
      throw new ApiError(409, 'product-unavailable', `${base.nome} está indisponível no momento.`)
    }

    const basePrice = Number.isFinite(Number(override?.price)) && Number(override.price) > 0
      ? override.price
      : base.preco
    const basePriceCents = toCents(basePrice)
    const { personalizacao, ajusteCentavos } = normalizeCustomization(base, item.personalizacaoOriginal)
    const unitPriceCents = basePriceCents + ajusteCentavos
    if (unitPriceCents <= 0) throw new ApiError(409, 'invalid-price', `O preço de ${base.nome} ficou inválido.`)

    stockNeeded.set(item.id, (stockNeeded.get(item.id) || 0) + item.quantidade)
    subtotalCents += unitPriceCents * item.quantidade
    return {
      id: item.id,
      nome: base.nome,
      quantidade: item.quantidade,
      precoUnitario: fromCents(unitPriceCents),
      personalizacao,
    }
  })

  if (subtotalCents <= 0 || subtotalCents > 5000000) {
    throw new ApiError(409, 'invalid-subtotal', 'O subtotal do pedido é inválido.')
  }

  for (const [productId, quantity] of stockNeeded.entries()) {
    const snapshot = catalog.get(productId)
    const stock = Number(snapshot?.data?.stock)
    if (snapshot?.exists && Number.isFinite(stock) && stock >= 0 && quantity > Math.floor(stock)) {
      throw new ApiError(409, 'insufficient-stock', `Estoque insuficiente para ${BASE_CATALOG[productId].nome}.`)
    }
  }

  const deliveryFeeCents = calculateDelivery(
    deliveryConfig,
    requiredText(profile.bairro, 'Bairro', 100),
    subtotalCents,
  )

  return {
    itens,
    stockNeeded,
    subtotalCents,
    deliveryFeeCents,
    totalCents: subtotalCents + deliveryFeeCents,
  }
}

export function canonicalCustomer(user, profile) {
  return {
    userId: user.uid,
    cliente: {
      nome: requiredText(profile.nome, 'Nome', 100),
      email: requiredText(user.email, 'E-mail', 254).toLowerCase(),
      telefone: requiredText(profile.telefone, 'Telefone', 30),
    },
    entrega: {
      endereco: requiredText(profile.endereco, 'Endereço', 180),
      numero: requiredText(profile.numero, 'Número', 20),
      bairro: requiredText(profile.bairro, 'Bairro', 100),
      complemento: cleanText(profile.complemento, 180),
    },
  }
}

export function orderQuote(canonical) {
  return {
    itens: canonical.itens,
    subtotal: fromCents(canonical.subtotalCents),
    deliveryFee: fromCents(canonical.deliveryFeeCents),
    total: fromCents(canonical.totalCents),
    currency: 'BRL',
    pricingSource: 'cloudflare-worker',
  }
}
