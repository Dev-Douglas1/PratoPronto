const { initializeApp } = require('firebase-admin/app')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')
const { HttpsError, onCall } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')

initializeApp()
const db = getFirestore()

setGlobalOptions({
  maxInstances: 10,
  memory: '256MiB',
  timeoutSeconds: 30,
})

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

const DEFAULT_DELIVERY = {
  defaultFee: 8,
  freeOver: 120,
  areas: [
    { bairro: 'Centro', fee: 5 },
    { bairro: 'Maracanã', fee: 6 },
    { bairro: 'Guaraituba', fee: 7 },
    { bairro: 'Roça Grande', fee: 8 },
  ],
}

function toCents(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new HttpsError('failed-precondition', 'Preço inválido no catálogo.')
  return Math.round(number * 100)
}

function fromCents(value) {
  return Number((value / 100).toFixed(2))
}

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function requiredText(value, label, maxLength) {
  const text = cleanText(value, maxLength)
  if (!text) throw new HttpsError('failed-precondition', `${label} não está preenchido no perfil.`)
  return text
}

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function requireVerifiedUser(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Faça login para continuar.')
  }
  if (request.auth.token?.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Verifique seu e-mail antes de fazer pedidos.')
  }
  return request.auth.uid
}

function parseQuantity(value) {
  const quantity = Number(value)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new HttpsError('invalid-argument', 'Quantidade de produto inválida.')
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

  if (!tamanho || !borda) {
    throw new HttpsError('invalid-argument', 'Personalização de pizza inválida.')
  }

  const rawAdicionais = Array.isArray(data.adicionais) ? data.adicionais : []
  const adicionais = [...new Set(rawAdicionais.map((item) => String(item)))]
  if (adicionais.length > 4 || adicionais.some((id) => !ADICIONAIS[id])) {
    throw new HttpsError('invalid-argument', 'Adicionais da pizza são inválidos.')
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

function parseItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 50) {
    throw new HttpsError('invalid-argument', 'O pedido precisa ter entre 1 e 50 itens.')
  }

  return rawItems.map((raw) => {
    const id = cleanText(raw?.id, 100)
    const product = BASE_CATALOG[id]
    if (!product) throw new HttpsError('invalid-argument', 'Há um produto desconhecido no pedido.')

    return {
      id,
      quantidade: parseQuantity(raw?.quantidade),
      personalizacaoOriginal: raw?.personalizacao ?? null,
    }
  })
}

function effectiveDeliveryConfig(snapshot) {
  if (!snapshot?.exists) return DEFAULT_DELIVERY
  const data = snapshot.data() || {}
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
  const fee = area ? area.fee : config.defaultFee
  const feeCents = toCents(fee)
  if (feeCents < 0 || feeCents > 100000) {
    throw new HttpsError('failed-precondition', 'A taxa de entrega configurada é inválida.')
  }
  return feeCents
}

async function loadOrderContext(uid, parsedItems) {
  const profileRef = db.collection('users').doc(uid)
  const deliveryRef = db.collection('settings').doc('delivery')
  const uniqueIds = [...new Set(parsedItems.map((item) => item.id))]
  const catalogRefs = uniqueIds.map((id) => db.collection('catalog').doc(id))

  const [profileSnapshot, deliverySnapshot, ...catalogSnapshots] = await db.getAll(
    profileRef,
    deliveryRef,
    ...catalogRefs,
  )

  if (!profileSnapshot.exists) {
    throw new HttpsError('failed-precondition', 'Complete seu perfil antes de fazer o pedido.')
  }

  const catalog = new Map(catalogSnapshots.map((snapshot) => [snapshot.id, snapshot]))
  return {
    profile: profileSnapshot.data(),
    deliveryConfig: effectiveDeliveryConfig(deliverySnapshot),
    catalog,
  }
}

function buildCanonicalOrder(parsedItems, catalog, profile, deliveryConfig) {
  const stockNeeded = new Map()
  let subtotalCents = 0

  const itens = parsedItems.map((item) => {
    const base = BASE_CATALOG[item.id]
    const overrideSnapshot = catalog.get(item.id)
    const override = overrideSnapshot?.exists ? overrideSnapshot.data() : null

    if (override?.available === false) {
      throw new HttpsError('failed-precondition', `${base.nome} está indisponível no momento.`)
    }

    const basePriceCents = toCents(
      Number.isFinite(Number(override?.price)) && Number(override.price) > 0
        ? override.price
        : base.preco,
    )
    const { personalizacao, ajusteCentavos } = normalizeCustomization(base, item.personalizacaoOriginal)
    const unitPriceCents = basePriceCents + ajusteCentavos
    if (unitPriceCents <= 0) {
      throw new HttpsError('failed-precondition', `O preço de ${base.nome} ficou inválido.`)
    }

    const currentNeeded = stockNeeded.get(item.id) || 0
    stockNeeded.set(item.id, currentNeeded + item.quantidade)
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
    throw new HttpsError('failed-precondition', 'O subtotal do pedido é inválido.')
  }

  for (const [productId, quantity] of stockNeeded.entries()) {
    const snapshot = catalog.get(productId)
    const stock = Number(snapshot?.data()?.stock)
    if (snapshot?.exists && Number.isFinite(stock) && stock >= 0 && quantity > Math.floor(stock)) {
      throw new HttpsError('failed-precondition', `Estoque insuficiente para ${BASE_CATALOG[productId].nome}.`)
    }
  }

  const bairro = requiredText(profile.bairro, 'Bairro', 100)
  const deliveryFeeCents = calculateDelivery(deliveryConfig, bairro, subtotalCents)

  return {
    itens,
    stockNeeded,
    subtotalCents,
    deliveryFeeCents,
    totalCents: subtotalCents + deliveryFeeCents,
  }
}

function canonicalCustomer(uid, request, profile) {
  return {
    userId: uid,
    cliente: {
      nome: requiredText(profile.nome, 'Nome', 100),
      email: requiredText(request.auth.token?.email, 'E-mail', 254).toLowerCase(),
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

exports.quoteOrder = onCall(
  { enforceAppCheck: true },
  async (request) => {
    const uid = requireVerifiedUser(request)
    const parsedItems = parseItems(request.data?.itens)
    const context = await loadOrderContext(uid, parsedItems)
    const canonical = buildCanonicalOrder(parsedItems, context.catalog, context.profile, context.deliveryConfig)

    return {
      itens: canonical.itens,
      subtotal: fromCents(canonical.subtotalCents),
      deliveryFee: fromCents(canonical.deliveryFeeCents),
      total: fromCents(canonical.totalCents),
      currency: 'BRL',
      pricingSource: 'server',
    }
  },
)

exports.createSecureOrder = onCall(
  { enforceAppCheck: true },
  async (request) => {
    const uid = requireVerifiedUser(request)
    const parsedItems = parseItems(request.data?.itens)
    const paymentMethod = String(request.data?.paymentMethod || 'cash-on-delivery')

    if (paymentMethod !== 'cash-on-delivery') {
      throw new HttpsError('failed-precondition', 'Somente pagamento na entrega está disponível nesta versão.')
    }

    const orderRef = db.collection('orders').doc()
    let response

    await db.runTransaction(async (transaction) => {
      const profileRef = db.collection('users').doc(uid)
      const deliveryRef = db.collection('settings').doc('delivery')
      const uniqueIds = [...new Set(parsedItems.map((item) => item.id))]
      const catalogRefs = uniqueIds.map((id) => db.collection('catalog').doc(id))

      const profileSnapshot = await transaction.get(profileRef)
      const deliverySnapshot = await transaction.get(deliveryRef)
      const catalogSnapshots = []
      for (const ref of catalogRefs) {
        catalogSnapshots.push(await transaction.get(ref))
      }

      if (!profileSnapshot.exists) {
        throw new HttpsError('failed-precondition', 'Complete seu perfil antes de fazer o pedido.')
      }

      const profile = profileSnapshot.data()
      const catalog = new Map(catalogSnapshots.map((snapshot) => [snapshot.id, snapshot]))
      const deliveryConfig = effectiveDeliveryConfig(deliverySnapshot)
      const canonical = buildCanonicalOrder(parsedItems, catalog, profile, deliveryConfig)
      const customer = canonicalCustomer(uid, request, profile)

      for (const [productId, quantity] of canonical.stockNeeded.entries()) {
        const snapshot = catalog.get(productId)
        const stock = Number(snapshot?.data()?.stock)
        if (snapshot?.exists && Number.isFinite(stock) && stock >= 0) {
          const nextStock = Math.floor(stock) - quantity
          if (nextStock < 0) {
            throw new HttpsError('aborted', `Estoque de ${BASE_CATALOG[productId].nome} mudou. Tente novamente.`)
          }
          transaction.update(snapshot.ref, {
            stock: nextStock,
            available: nextStock > 0 && snapshot.data().available !== false,
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }

      const payload = {
        ...customer,
        itens: canonical.itens,
        subtotal: fromCents(canonical.subtotalCents),
        deliveryFee: fromCents(canonical.deliveryFeeCents),
        total: fromCents(canonical.totalCents),
        observacao: cleanText(request.data?.observacao, 500),
        pagamento: {
          metodo: 'Pagamento na entrega',
          referencia: `entrega-${orderRef.id}`,
        },
        paymentStatus: 'pending_delivery',
        status: 'recebido',
        cancelReason: '',
        refundStatus: 'none',
        refundReason: '',
        assignedCourier: '',
        restaurantNotes: '',
        serverValidated: true,
        orderSchemaVersion: 2,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

      transaction.set(orderRef, payload)
      response = {
        id: orderRef.id,
        subtotal: payload.subtotal,
        deliveryFee: payload.deliveryFee,
        total: payload.total,
        currency: 'BRL',
      }
    })

    return response
  },
)
