import { DomainError, requireThat, text, publicText, phone, hash, normalize, normalizeItemShape, priceOrder, validateSettings, isOpen, NEXT, cents } from './domain.js'
import { DEFAULT_COMPANY_ID, createDeliveryCode, deliveryCodeHash, normalizeCompanyId, permissionsForRole, roleCan, verifyDeliveryCode } from './access.js'
import { POLICY_VERSION, TERMS_VERSION } from './policy.js'

const millis = value => value?.toMillis?.() ?? Number(new Date(value))
const id = value => { requireThat(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value), 'Identificador inválido.'); return value }

export function createService({ db, config, mp, authAdmin, now = () => new Date(), log = () => {} }) {
  const orderRef = orderId => db.doc('orders/' + id(orderId))
  const companyRef = companyId => db.doc('companies/' + normalizeCompanyId(companyId))
  const membershipRef = (companyId, uid) => db.doc('companyMembers/' + normalizeCompanyId(companyId) + '_' + id(uid))
  const settingsRefFor = companyId => normalizeCompanyId(companyId) === DEFAULT_COMPANY_ID
    ? db.doc('settings/restaurant')
    : db.doc('companies/' + normalizeCompanyId(companyId) + '/settings/store')
  const productRefFor = (companyId, productId) => normalizeCompanyId(companyId) === DEFAULT_COMPANY_ID
    ? db.doc('productSettings/' + id(productId))
    : db.doc('companies/' + normalizeCompanyId(companyId) + '/products/' + id(productId))
  function user(context) {
    requireThat(context?.uid && context.email && context.email_verified === true, 'Entre na conta e confirme seu e-mail para continuar.', 'unauthenticated')
    id(context.uid)
    return context
  }
  async function companyAccess(context, companyId, permission, tx) {
    const actor = user(context)
    const normalizedCompanyId = normalizeCompanyId(companyId)
    const ref = membershipRef(normalizedCompanyId, actor.uid)
    const snapshot = tx ? await tx.get(ref) : await ref.get()
    const membership = snapshot.data()
    if (membership?.active !== false && membership?.companyId === normalizedCompanyId && membership?.userId === actor.uid && roleCan(membership.role, permission)) {
      return { actor, companyId: normalizedCompanyId, membership }
    }

    // Compatibilidade durante a migração: o administrador antigo continua como
    // proprietário somente da empresa PratoPronto.
    if (normalizedCompanyId === DEFAULT_COMPANY_ID) {
      const legacyRef = db.doc('admins/' + actor.uid)
      const legacy = tx ? await tx.get(legacyRef) : await legacyRef.get()
      if (legacy.data()?.role === 'restaurant_admin' && roleCan('owner', permission)) {
        return { actor, companyId: normalizedCompanyId, membership: { role: 'owner', legacy: true } }
      }
    }

    requireThat(false, 'Sua conta não tem permissão para esta ação nesta empresa.', 'permission-denied')
  }
  async function admin(context, tx) {
    return (await companyAccess(context, DEFAULT_COMPANY_ID, 'company:manage', tx)).actor
  }
  async function pilotAccess(context, companyId, tx) {
    return companyAccess(context, companyId, 'pilot:deliver', tx)
  }
  async function rate(context, action, limit = 10) {
    const actor = user(context)
    const minute = Math.floor(now().getTime() / 60000)
    const ref = db.doc('rateLimits/' + hash([actor.uid, action, minute]))
    await db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data()
      requireThat((data?.count || 0) < limit, 'Muitas tentativas. Aguarde um minuto e tente novamente.', 'resource-exhausted')
      tx.set(ref, { count: (data?.count || 0) + 1, expiresAt: new Date(now().getTime() + 3600000) })
    })
  }
  function paymentReady(method) {
    requireThat(['test','production'].includes(config.environment), 'Os pedidos ainda não foram ativados pela empresa.', 'failed-precondition')
    if (config.environment === 'production') requireThat(config.enforceAppCheck && config.liveEnabled, 'A operação real ainda não foi liberada pela empresa.', 'failed-precondition')
    if (method !== 'maquina_entrega') requireThat(config.hasPaymentSecrets && config.collectorId && /^https:\/\//.test(config.origin || ''), 'O pagamento online ainda não foi ativado. Escolha pagamento na entrega, se disponível.', 'failed-precondition')
  }
  async function priceData(tx, inputs, delivery, settings, companyId = DEFAULT_COMPANY_ID) {
    const normalizedCompanyId = normalizeCompanyId(companyId)
    const shaped = normalizeItemShape(inputs)
    const refs = [...new Set(shaped.map(i => i.id))].map(productId => productRefFor(normalizedCompanyId, productId))
    const snapshots = await Promise.all(refs.map(ref => tx ? tx.get(ref) : ref.get()))
    const productSettings = Object.fromEntries(snapshots.map(snap => [snap.id, snap.data()]))

    if (normalizedCompanyId === DEFAULT_COMPANY_ID) {
      return priceOrder({ items: shaped, delivery, settings, now: now(), productSettings })
    }

    const catalogProducts = snapshots.map(snap => {
      const value = snap.data()
      requireThat(value && value.disponivel !== false, 'Um item do carrinho não está mais disponível.', 'failed-precondition')
      return {
        id: snap.id,
        nome: publicText(value.nome, 'o nome do produto', 2, 100),
        descricao: publicText(value.descricao || '', 'a descrição do produto', 0, 300),
        preco: Number(value.preco),
        personalizavel: value.personalizavel === true,
      }
    })
    return priceOrder({ items: shaped, delivery, settings, now: now(), productSettings, catalogProducts })
  }
  const publicOrder = order => ({ orderId: order.id, checkoutUrl: order.checkout?.state === 'ready' && order.status === 'aguardando_pagamento' ? order.checkout.url : null, status: order.status, checkoutState: order.checkout?.state || 'none' })
  async function storefront(input = {}) {
    const companyId = normalizeCompanyId(input.companyId || DEFAULT_COMPANY_ID)
    const settings = (await settingsRefFor(companyId).get()).data()
    const company = companyId === DEFAULT_COMPANY_ID ? null : (await companyRef(companyId).get()).data()
    return { companyId, configured: Boolean(settings), open: Boolean(settings && company?.active !== false && isOpen(settings, now())), environment: config.environment,
      name: settings?.name || company?.name || (companyId === DEFAULT_COMPANY_ID ? 'PratoPronto' : 'Empresa'), legalName: settings?.legalName || '', privacyEmail: settings?.privacyEmail || '', retentionDays: settings?.retentionDays || null, phone: settings?.phone || '', address: settings?.address || null,
      methods: (settings?.methods || []).filter(method => { try { paymentReady(method); return true } catch { return false } }),
      hours: settings?.hours || [], timezone: settings?.timezone || 'America/Sao_Paulo', zones: settings?.zones || [], estimateMinutes: settings?.estimateMinutes || null,
    }
  }
  async function quote(context, data) {
    const actor = user(context)
    await rate(actor, 'quote', 15)
    requireThat(data.acceptTerms === true, 'Leia os termos e a política apresentados antes de confirmar o pedido.')
    const companyId = normalizeCompanyId(data.companyId || DEFAULT_COMPANY_ID)
    const items = normalizeItemShape(data.items)
    const [profile, settingsSnapshot, privacy] = await Promise.all([db.doc('users/' + actor.uid).get(), settingsRefFor(companyId).get(), db.doc('privacyRequests/' + actor.uid).get()])
    requireThat(!privacy.exists, 'Sua conta está com exclusão solicitada. Conclua esse atendimento antes de fazer novos pedidos.', 'failed-precondition')
    const settings = settingsSnapshot.data()
    requireThat(settings, 'A empresa ainda está configurando a loja.', 'failed-precondition')
    paymentReady(data.method)
    requireThat(settings.methods.includes(data.method), 'Esta forma de pagamento está indisponível.')
    requireThat(data.method === 'pix' || ['credito','debito'].includes(data.cardType), 'Selecione crédito ou débito.')
    const profileData = profile.data()
    requireThat(profileData, 'Complete seu perfil antes de pedir.', 'failed-precondition')
    const priced = await priceData(null, items, profileData, settings, companyId)
    const ref = db.collection('quotes').doc()
    const payload = { companyId, userId: actor.uid, items, method: data.method, cardType: data.method === 'pix' ? 'pix' : data.cardType,
      note: publicText(data.note || '', 'a observação', 0, 500), priced,
      cliente: { nome: publicText(profileData.nome, 'o nome', 2, 80), email: actor.email, telefone: phone(profileData.telefone) },
      consent: { policyVersion: POLICY_VERSION, termsVersion: TERMS_VERSION, acceptedAt: now() },
      environment: config.environment, expiresAt: new Date(now().getTime() + 5 * 60000), createdAt: now() }
    await ref.set(payload)
    return { quoteId: ref.id, ...priced, expiresAt: payload.expiresAt.toISOString(), environment: config.environment }
  }
  async function checkout(context, data) {
    const actor = user(context)
    await rate(actor, 'checkout', 8)
    const requestId = text(data.requestId, 'a referência da compra', 16, 100)
    requireThat(/^[a-zA-Z0-9_-]+$/.test(requestId), 'Referência da compra inválida.')
    const ref = orderRef(hash([actor.uid, requestId]).slice(0, 40))
    const quoteRef = db.doc('quotes/' + id(data.quoteId))
    let created = false
    let order
    try { order = await db.runTransaction(async tx => {
      const existing = await tx.get(ref)
      if (existing.exists) {
        requireThat(existing.data().quoteId === data.quoteId, 'Esta tentativa já pertence a outro pedido.', 'already-exists')
        return { ...existing.data(), id: ref.id }
      }
      const q = (await tx.get(quoteRef)).data()
      requireThat(q && q.userId === actor.uid, 'Resumo de compra inválido.', 'permission-denied')
      if (q.orderId) return { ...(await tx.get(orderRef(q.orderId))).data(), id: q.orderId }
      requireThat(!(await tx.get(db.doc('privacyRequests/' + actor.uid))).exists, 'Sua conta está com exclusão solicitada.', 'failed-precondition')
      requireThat(millis(q.expiresAt) > now().getTime(), 'O resumo expirou. Confira os valores novamente.', 'failed-precondition')
      requireThat(q.environment === config.environment, 'O ambiente de pagamento mudou. Atualize o resumo.', 'failed-precondition')
      paymentReady(q.method)
      const companyId = normalizeCompanyId(q.companyId || DEFAULT_COMPANY_ID)
      const settings = (await tx.get(settingsRefFor(companyId))).data()
      requireThat(settings?.methods.includes(q.method), 'Esta forma de pagamento foi pausada.', 'failed-precondition')
      const priced = await priceData(tx, q.items, q.priced.entrega, settings, companyId)
      requireThat(hash(priced) === hash(q.priced), 'O preço ou a entrega mudou. Confira o resumo atualizado antes de pagar.', 'failed-precondition')
      const deliveryCode = createDeliveryCode()
      const payload = { ...priced, companyId, userId: actor.uid, quoteId: data.quoteId, cliente: q.cliente, observacao: q.note,
        pagamento: { metodo: q.method, modalidade: q.cardType, ambiente: config.environment === 'production' ? 'producao' : 'teste', status: q.method === 'maquina_entrega' ? 'pendente_entrega' : 'pendente', referencia: '' },
        status: q.method === 'maquina_entrega' ? 'confirmado' : 'aguardando_pagamento', createdAt: now(), updatedAt: now(),
        expiresAt: new Date(now().getTime() + 30 * 60000), checkout: { state: q.method === 'maquina_entrega' ? 'none' : 'reserved' },
        retentionDays: settings.retentionDays, consent: q.consent,
        assignedCourier: '', deliveryVerificationRequired: true, deliveryCodeHash: deliveryCodeHash(ref.id, deliveryCode),
      }
      tx.create(ref, payload)
      tx.create(ref.collection('private').doc('delivery'), { code: deliveryCode, userId: actor.uid, createdAt: now() })
      tx.update(quoteRef, { orderId: ref.id })
      tx.create(ref.collection('events').doc(), { status: payload.status, by: actor.uid, at: now() })
      if (q.method !== 'maquina_entrega') tx.set(db.doc('paymentWatches/' + ref.id), { orderId: ref.id, active: true, nextAttemptAt: new Date(now().getTime() + 60000), createdAt: now() })
      created = true
      return { ...payload, id: ref.id }
    }) } catch (error) {
      if (error instanceof DomainError) error.restartCheckout = true
      throw error
    }
    // Only the transaction that acquires this reservation may contact the provider.
    // Unknown results are reconciled, never blindly submitted a second time.
    if (order.pagamento.metodo !== 'maquina_entrega') {
      const ownRef = orderRef(order.id)
      const claimed = await db.runTransaction(async tx => {
        const current = (await tx.get(ownRef)).data()
        if (current.checkout.state !== 'reserved' || current.status !== 'aguardando_pagamento') return false
        tx.update(ownRef, { 'checkout.state': 'creating', updatedAt: now() }); return true
      })
      if (claimed) {
        try {
          requireThat(String((await mp.account()).id) === String(config.collectorId), 'A conta recebedora precisa ser corrigida pela empresa.', 'failed-precondition')
          const preference = await mp.preference({ ...order, expiresAt: millis(order.expiresAt) })
          await ownRef.update({ checkout: { state: 'ready', preferenceId: preference.id, url: preference.url }, updatedAt: now() })
        } catch (error) {
          await ownRef.update({ 'checkout.state': 'unknown', updatedAt: now() })
          log('checkout_pending', { orderId: order.id, code: error.code || 'internal' })
        }
      }
      order = { ...(await ownRef.get()).data(), id: order.id }
    }
    return { ...publicOrder(order), created }
  }
  async function resume(context, data) {
    const actor = user(context)
    await rate(actor, 'resume', 10)
    const ref = orderRef(data.orderId)
    const order = (await ref.get()).data()
    requireThat(order?.userId === actor.uid, 'Pedido não encontrado nesta conta.', 'permission-denied')
    requireThat(order.pagamento.ambiente === (config.environment === 'production' ? 'producao' : 'teste'), 'Este pedido pertence a outro ambiente.', 'failed-precondition')
    if (millis(order.expiresAt) <= now().getTime()) return { orderId: ref.id, checkoutUrl: null, status: order.status, checkoutState: 'expired' }
    return publicOrder({ ...order, id: ref.id })
  }
  async function advance(context, data) {
    user(context); await rate(context, 'advance', 60)
    const ref = orderRef(data.orderId)
    return db.runTransaction(async tx => {
      const order = (await tx.get(ref)).data()
      requireThat(order, 'Pedido não encontrado.', 'not-found')
      await companyAccess(context, order.companyId || DEFAULT_COMPANY_ID, 'orders:advance', tx)
      requireThat(NEXT[order.status] === data.next, 'O pedido mudou de etapa. Confira a atualização.', 'failed-precondition')
      requireThat(!(data.next === 'entregue' && order.deliveryVerificationRequired === true), 'A entrega deve ser confirmada pelo Piloto Parceiro com a senha do cliente.', 'failed-precondition')
      requireThat(['aprovado','pendente_entrega','recebido_entrega'].includes(order.pagamento.status), 'Resolva o pagamento antes de avançar o pedido.', 'failed-precondition')
      let payment = { ...order.pagamento }
      if (data.next === 'entregue' && payment.status === 'pendente_entrega') {
        requireThat(data.received === true, 'Confirme o recebimento na maquininha antes de concluir.')
        payment.status = 'recebido_entrega'
        payment.recebidoPor = context.uid
        payment.recebidoEm = now()
      }
      tx.update(ref, { status: data.next, pagamento: payment, updatedAt: now(), updatedBy: context.uid })
      tx.create(ref.collection('events').doc(), { status: data.next, by: context.uid, at: now() })
      return { status: data.next }
    })
  }
  async function requestRefund(context, data) {
    const actor = user(context); await rate(actor, 'refund', 5)
    const ref = db.doc('refundRequests/' + id(data.orderId))
    const motivo = publicText(data.reason, 'o motivo', 5, 500)
    return db.runTransaction(async tx => {
      const order = (await tx.get(orderRef(data.orderId))).data()
      requireThat(order?.userId === actor.uid, 'Pedido não encontrado.', 'permission-denied')
      const existing = await tx.get(ref)
      if (existing.exists) return { id: ref.id, status: existing.data().status }
      requireThat(order.status !== 'cancelado', 'Este pedido já está cancelado.', 'failed-precondition')
      tx.create(ref, { companyId: order.companyId || DEFAULT_COMPANY_ID, orderId: data.orderId, userId: actor.uid, motivo, status: 'pendente', createdAt: now(), updatedAt: now() })
      return { id: ref.id, status: 'pendente' }
    })
  }
  async function decide(context, data) {
    user(context); await rate(context, 'decide', 30)
    const ref = orderRef(data.orderId)
    const refundRef = db.doc('refundRequests/' + ref.id)
    const answer = publicText(data.answer, 'a resposta ao cliente', 3, 1000)
    requireThat(typeof data.approve === 'boolean', 'Confira a decisão.')
    return db.runTransaction(async tx => {
      const request = (await tx.get(refundRef)).data()
      const order = (await tx.get(ref)).data()
      requireThat(order, 'Pedido não encontrado.', 'not-found')
      await companyAccess(context, order.companyId || DEFAULT_COMPANY_ID, 'refunds:manage', tx)
      requireThat(request && request.userId === order.userId && request.status === 'pendente', 'Esta solicitação já foi analisada.', 'failed-precondition')
      let paymentStatus = order.pagamento.status
      let refundStatus = 'recusado'
      if (data.approve) {
        if (paymentStatus === 'recebido_entrega') { paymentStatus = 'reembolso_manual_pendente'; refundStatus = 'reembolso_manual_pendente' }
        else if (paymentStatus === 'aprovado' && order.pagamento.referencia) {
          paymentStatus = 'reembolso_pendente'; refundStatus = 'reembolso_pendente'
          tx.set(db.doc('refundJobs/' + hash(order.pagamento.referencia)), { orderId: ref.id, paymentId: order.pagamento.referencia, kind: 'cancellation', state: 'pending', nextAttemptAt: now(), attempts: 0, createdAt: now() }, { merge: true })
        } else if (paymentStatus === 'reembolsado') refundStatus = 'reembolsado'
        else { paymentStatus = 'cancelado'; refundStatus = 'cancelado_sem_cobranca' }
        tx.update(ref, { status: 'cancelado', 'pagamento.status': paymentStatus, updatedAt: now(), updatedBy: context.uid })
        tx.create(ref.collection('events').doc(), { status: 'cancelado', by: context.uid, at: now() })
      }
      tx.update(refundRef, { status: refundStatus, resposta: answer, updatedAt: now(), updatedBy: context.uid })
      return { status: refundStatus }
    })
  }
  async function confirmManualRefund(context, data) {
    user(context)
    const ref = orderRef(data.orderId)
    const proof = text(data.proof, 'a referência do comprovante de devolução', 5, 150)
    return db.runTransaction(async tx => {
      const order = (await tx.get(ref)).data()
      requireThat(order, 'Pedido não encontrado.', 'not-found')
      await companyAccess(context, order.companyId || DEFAULT_COMPANY_ID, 'refunds:manage', tx)
      requireThat(order.pagamento.status === 'reembolso_manual_pendente', 'Este pedido não aguarda devolução manual.', 'failed-precondition')
      tx.update(ref, { 'pagamento.status': 'reembolsado_manual', 'pagamento.comprovante': proof, updatedAt: now(), updatedBy: context.uid })
      tx.update(db.doc('refundRequests/' + ref.id), { status: 'reembolsado_manual', updatedAt: now(), updatedBy: context.uid })
      tx.create(ref.collection('events').doc(), { status: 'reembolsado_manual', by: context.uid, at: now() })
      return { status: 'reembolsado_manual' }
    })
  }
  async function saveSettings(context, input) {
    const companyId = normalizeCompanyId(input.companyId || DEFAULT_COMPANY_ID)
    await companyAccess(context, companyId, 'company:manage')
    const { companyId: ignoredCompanyId, ...settingsInput } = input
    const value = validateSettings(settingsInput)
    if (value.acceptingOrders) value.methods.forEach(paymentReady)
    await db.runTransaction(async tx => {
      await companyAccess(context, companyId, 'company:manage', tx)
      tx.set(settingsRefFor(companyId), { ...value, updatedAt: now(), updatedBy: context.uid })
      if (companyId !== DEFAULT_COMPANY_ID) {
        tx.set(companyRef(companyId), { id: companyId, name: value.name, searchName: normalize(value.name), active: value.acceptingOrders === true, updatedAt: now() }, { merge: true })
      }
      tx.create(db.collection('auditEvents').doc(), { companyId, action: 'settings_updated', by: context.uid, at: now() })
    })
    return { saved: true, companyId }
  }
  async function readiness(context, input = {}) {
    const companyId = normalizeCompanyId(input.companyId || DEFAULT_COMPANY_ID)
    await companyAccess(context, companyId, 'company:manage')
    const [settings, metrics] = await Promise.all([settingsRefFor(companyId).get(), db.doc('operations/health').get()])
    let receiverVerified = false
    if (config.hasPaymentSecrets && config.collectorId) {
      try { receiverVerified = String((await mp.account()).id) === String(config.collectorId) } catch { /* Return status only. */ }
    }
    return { companyId, environment: config.environment, liveEnabled: config.liveEnabled, appCheck: config.enforceAppCheck,
      paymentSecrets: config.hasPaymentSecrets, receiverVerified, publicUrlConfigured: Boolean(config.origin),
      restaurantConfigured: settings.exists, acceptingOrders: settings.data()?.acceptingOrders === true,
      health: metrics.data() || null,
    }
  }
  async function migrateDefaultCompany(context) {
    const actor = await admin(context)
    const refs = [db.collection('orders'), db.collection('refundRequests'), db.collection('reviews')]
    let changed = 0
    for (const collectionRef of refs) {
      const snapshot = await collectionRef.limit(1000).get()
      const pending = snapshot.docs.filter(doc => !doc.data().companyId)
      for (let offset = 0; offset < pending.length; offset += 400) {
        const batch = db.batch()
        for (const doc of pending.slice(offset, offset + 400)) {
          batch.set(doc.ref, { companyId: DEFAULT_COMPANY_ID, updatedAt: now(), updatedBy: actor.uid }, { merge: true })
          changed += 1
        }
        await batch.commit()
      }
    }
    await companyRef(DEFAULT_COMPANY_ID).set({ id: DEFAULT_COMPANY_ID, name: 'PratoPronto', searchName: 'pratopronto', active: true, updatedAt: now() }, { merge: true })
    await membershipRef(DEFAULT_COMPANY_ID, actor.uid).set({ companyId: DEFAULT_COMPANY_ID, userId: actor.uid, email: actor.email, role: 'owner', active: true, updatedAt: now() }, { merge: true })
    return { companyId: DEFAULT_COMPANY_ID, changed }
  }

  async function listMyCompanies(context) {
    const actor = user(context)
    const memberships = await db.collection('companyMembers').where('userId', '==', actor.uid).get()
    const rows = memberships.docs
      .map(doc => doc.data())
      .filter(member => member.active !== false && member.companyId && member.role)

    const legacy = await db.doc('admins/' + actor.uid).get()
    if (legacy.data()?.role === 'restaurant_admin' && !rows.some(member => member.companyId === DEFAULT_COMPANY_ID)) {
      rows.push({ companyId: DEFAULT_COMPANY_ID, userId: actor.uid, role: 'owner', active: true, legacy: true })
    }

    return Promise.all(rows.map(async member => {
      const company = member.companyId === DEFAULT_COMPANY_ID ? null : (await companyRef(member.companyId).get()).data()
      return {
        companyId: member.companyId,
        name: company?.name || (member.companyId === DEFAULT_COMPANY_ID ? 'PratoPronto' : member.companyId),
        role: member.role,
        permissions: permissionsForRole(member.role),
        legacy: member.legacy === true,
      }
    }))
  }
  async function createCompany(context, data) {
    const actor = user(context)
    await rate(actor, 'create-company', 2)
    const companyId = normalizeCompanyId(data.companyId)
    const name = publicText(data.name, 'o nome da empresa', 2, 100)
    const company = companyRef(companyId)
    const member = membershipRef(companyId, actor.uid)
    await db.runTransaction(async tx => {
      requireThat(!(await tx.get(company)).exists, 'Já existe uma empresa com este identificador.', 'already-exists')
      tx.create(company, { id: companyId, name, searchName: normalize(name), active: false, ownerId: actor.uid, createdAt: now(), updatedAt: now() })
      tx.create(member, { companyId, userId: actor.uid, email: actor.email, role: 'owner', active: true, createdAt: now(), updatedAt: now() })
    })
    return { companyId, name, role: 'owner' }
  }
  async function saveCompanyMember(context, data) {
    const companyId = normalizeCompanyId(data.companyId)
    const access = await companyAccess(context, companyId, 'team:manage')
    const email = text(data.email, 'o e-mail do membro', 5, 254).toLowerCase()
    const role = String(data.role || 'member').toLowerCase()
    requireThat(['owner','admin','member','kitchen','support','pilot'].includes(role), 'Escolha uma função válida para o membro.')
    if (role === 'owner') requireThat(access.membership.role === 'owner', 'Somente o proprietário pode indicar outro proprietário.', 'permission-denied')
    let account
    try { account = await authAdmin.getUserByEmail(email) } catch { throw new DomainError('not-found', 'Esse e-mail precisa ter uma conta verificada no PratoPronto antes de entrar na equipe.') }
    requireThat(account.emailVerified && !account.disabled, 'A conta precisa estar ativa e com e-mail confirmado.', 'failed-precondition')
    const ref = membershipRef(companyId, account.uid)
    const previous = await ref.get()
    if (previous.data()?.role === 'owner' && role !== 'owner') requireThat(access.membership.role === 'owner', 'Somente o proprietário pode alterar outro proprietário.', 'permission-denied')
    await ref.set({ companyId, userId: account.uid, email: account.email, role, active: true, updatedAt: now(), ...(previous.exists ? {} : { createdAt: now() }) }, { merge: true })
    return { companyId, userId: account.uid, email: account.email, role }
  }
  async function removeCompanyMember(context, data) {
    const companyId = normalizeCompanyId(data.companyId)
    const access = await companyAccess(context, companyId, 'team:manage')
    const targetUid = id(data.userId)
    const ref = membershipRef(companyId, targetUid)
    const current = (await ref.get()).data()
    requireThat(current, 'Membro não encontrado.', 'not-found')
    requireThat(current.role !== 'owner' || access.membership.role === 'owner', 'Somente o proprietário pode remover outro proprietário.', 'permission-denied')
    requireThat(!(targetUid === context.uid && current.role === 'owner'), 'Transfira a propriedade antes de sair da empresa.', 'failed-precondition')
    await ref.set({ active: false, updatedAt: now(), updatedBy: context.uid }, { merge: true })
    return { removed: true }
  }
  async function saveCompanyProduct(context, data) {
    const companyId = normalizeCompanyId(data.companyId)
    await companyAccess(context, companyId, 'catalog:manage')
    requireThat(companyId !== DEFAULT_COMPANY_ID, 'Use o editor atual do PratoPronto para o catálogo principal.', 'failed-precondition')
    const productId = id(data.productId)
    const nome = publicText(data.nome, 'o nome do produto', 2, 100)
    const descricao = publicText(data.descricao || '', 'a descrição do produto', 0, 300)
    const preco = cents(Number(data.preco)) / 100
    const categoria = publicText(data.categoria || 'Outros', 'a categoria', 2, 40)
    const imagem = text(data.imagem || '', 'a imagem', 0, 500)
    requireThat(!imagem || imagem.startsWith('/') || /^https:\/\//.test(imagem), 'Use uma imagem HTTPS ou um caminho interno.')
    const ref = productRefFor(companyId, productId)
    await ref.set({
      companyId, id: productId, nome, searchName: normalize(nome), descricao, categoria, preco,
      imagem, personalizavel: data.personalizavel === true, disponivel: data.disponivel !== false,
      public: true, updatedAt: now(), updatedBy: context.uid,
    }, { merge: true })
    return { saved: true, productId }
  }
  async function assignPilot(context, data) {
    user(context); await rate(context, 'assign-pilot', 30)
    const ref = orderRef(data.orderId)
    return db.runTransaction(async tx => {
      const order = (await tx.get(ref)).data()
      requireThat(order, 'Pedido não encontrado.', 'not-found')
      const companyId = normalizeCompanyId(order.companyId || DEFAULT_COMPANY_ID)
      await companyAccess(context, companyId, 'pilots:assign', tx)
      const pilotUid = id(data.pilotUid)
      const pilotMembership = (await tx.get(membershipRef(companyId, pilotUid))).data()
      requireThat(pilotMembership?.active !== false && pilotMembership?.role === 'pilot', 'Escolha um Piloto Parceiro ativo desta empresa.', 'failed-precondition')
      requireThat(['confirmado','preparando','pronto'].includes(order.status), 'O piloto só pode ser definido antes da saída para entrega.', 'failed-precondition')
      tx.update(ref, { assignedCourier: pilotUid, updatedAt: now(), updatedBy: context.uid })
      tx.create(ref.collection('events').doc(), { status: order.status, kind: 'pilot_assigned', by: context.uid, pilotUid, at: now() })
      return { assignedCourier: pilotUid }
    })
  }
  async function pilotStartDelivery(context, data) {
    const actor = user(context); await rate(actor, 'pilot-start', 30)
    const ref = orderRef(data.orderId)
    return db.runTransaction(async tx => {
      const order = (await tx.get(ref)).data()
      requireThat(order, 'Pedido não encontrado.', 'not-found')
      await pilotAccess(context, order.companyId || DEFAULT_COMPANY_ID, tx)
      requireThat(order.assignedCourier === actor.uid, 'Este pedido está atribuído a outro piloto.', 'permission-denied')
      requireThat(order.status === 'pronto', 'O pedido precisa estar pronto antes de sair para entrega.', 'failed-precondition')
      tx.update(ref, { status: 'saiu_entrega', updatedAt: now(), updatedBy: actor.uid })
      tx.create(ref.collection('events').doc(), { status: 'saiu_entrega', kind: 'pilot_started', by: actor.uid, at: now() })
      return { status: 'saiu_entrega' }
    })
  }
  async function pilotConfirmDelivery(context, data) {
    const actor = user(context); await rate(actor, 'pilot-delivery', 20)
    const ref = orderRef(data.orderId)
    return db.runTransaction(async tx => {
      const order = (await tx.get(ref)).data()
      requireThat(order, 'Pedido não encontrado.', 'not-found')
      await pilotAccess(context, order.companyId || DEFAULT_COMPANY_ID, tx)
      requireThat(order.assignedCourier === actor.uid, 'Este pedido está atribuído a outro piloto.', 'permission-denied')
      requireThat(order.status === 'saiu_entrega', 'Este pedido não está em rota de entrega.', 'failed-precondition')
      requireThat(order.deliveryVerificationRequired === true && verifyDeliveryCode(ref.id, data.code, order.deliveryCodeHash), 'Senha de entrega incorreta.', 'permission-denied')
      const payment = { ...order.pagamento }
      if (payment.status === 'pendente_entrega') {
        requireThat(data.received === true, 'Confirme o recebimento do pagamento na entrega.')
        payment.status = 'recebido_entrega'
        payment.recebidoPor = actor.uid
        payment.recebidoEm = now()
      }
      tx.update(ref, { status: 'entregue', pagamento: payment, deliveryConfirmedAt: now(), deliveryConfirmedBy: actor.uid, updatedAt: now(), updatedBy: actor.uid })
      tx.create(ref.collection('events').doc(), { status: 'entregue', kind: 'pilot_confirmed', by: actor.uid, at: now() })
      return { status: 'entregue' }
    })
  }

  async function privacyRequest(context) {
    const actor = user(context); await rate(actor, 'privacy', 2)
    const ref = db.doc('privacyRequests/' + actor.uid)
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).exists) return
      tx.create(ref, { userId: actor.uid, status: 'pendente', createdAt: now(), updatedAt: now() })
    })
    return { requested: true }
  }
  return { storefront, quote, checkout, resume, advance, requestRefund, decide, confirmManualRefund, saveSettings, readiness, privacyRequest,
    migrateDefaultCompany, listMyCompanies, createCompany, saveCompanyMember, removeCompanyMember, saveCompanyProduct, assignPilot, pilotStartDelivery, pilotConfirmDelivery,
    admin, companyAccess, rate }
}
