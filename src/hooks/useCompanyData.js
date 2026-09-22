import { useEffect, useState } from 'react'
import { makeCompanyDemo, makeDemoOrder } from '../data/companyDemo.js'
import { advanceOrder, decideRefund, replyReview, saveProduct, savePromotion, subscribeCompany } from '../services/company.js'
import { canAdvanceOrder } from '../config/orderStatus.js'
import { accessError, COMPANY_SOURCES, initialSources } from '../utils/dataAccess.js'

import { assertRespectful } from '../shared/input-policy.js'
import { validatePromotion } from '../shared/promotions.js'
import { produtos } from '../data/produtos.js'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'

const empty = { orders: [], refunds: [], reviews: [], settings: [], events: {} }
export default function useCompanyData(demo, companyId = DEFAULT_COMPANY_ID) {
  const [data, setData] = useState(() => demo ? makeCompanyDemo() : empty)
  const [sources, setSources] = useState(() => initialSources(demo))
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (demo) { setSources(initialSources(true)); return }
    let live = true
    setSources(initialSources())
    const unsubscribe = []
    for (const [name, key] of [['orders', 'orders'], ['refundRequests', 'refunds'], ['reviews', 'reviews'], ['productSettings', 'settings']]) {
      const fail = err => {
        if (!live) return
        // A denied collection must not hide successfully loaded collections.
        setData(current => ({ ...current, [key]: [] }))
        setSources(current => ({ ...current, [key]: { loading: false, error: accessError(err, COMPANY_SOURCES[key], true), fromCache: true } }))
      }
      try {
        unsubscribe.push(subscribeCompany(name, companyId, (values, metadata) => {
          if (!live) return
          setData(current => ({ ...current, [key]: values }))
          setSources(current => ({ ...current, [key]: { loading: false, error: '', fromCache: metadata?.fromCache !== false } }))
        }, fail))
      } catch (err) { fail(err) }
    }
    return () => { live = false; unsubscribe.forEach(fn => fn()) }
  }, [demo, attempt, companyId])

  async function advance(id, next, received) {
    if (!demo) return advanceOrder(id, next, received)
    const order = data.orders.find(item => item.id === id)
    if (!order || !canAdvanceOrder(order, next)) throw new Error('O pedido já mudou de etapa.')
    if (next === 'entregue' && order.pagamento.status === 'pendente_entrega' && !received) throw new Error('Confirme o recebimento na entrega.')
    setData(current => ({ ...current,
      orders: current.orders.map(item => item.id !== id ? item : { ...item, status: next, updatedAt: Date.now(), pagamento: { ...item.pagamento, status: next === 'entregue' && item.pagamento.status === 'pendente_entrega' ? 'recebido_demo' : item.pagamento.status } }),
      events: { ...current.events, [id]: [...(current.events[id] || []), { id: String(Date.now()), status: next, at: Date.now(), by: 'empresa-demo' }] },
    }))
  }
  async function decide(id, approve, resposta) {
    assertRespectful(resposta, 'a resposta')
    if (!demo) return decideRefund(id, approve, resposta)
    if (resposta.trim().length < 3) throw new Error('Escreva uma resposta para o cliente.')
    setData(current => ({ ...current,
      refunds: current.refunds.map(item => item.id === id ? { ...item, status: approve ? 'aprovado_demo' : 'recusado', resposta: resposta.trim() } : item),
      orders: current.orders.map(item => item.id !== id || !approve ? item : { ...item, status: 'cancelado', pagamento: { ...item.pagamento, status: item.pagamento.status === 'pendente_entrega' ? 'cancelado_demo' : 'reembolsado_demo' } }),
    }))
  }
  async function reply(id, resposta) {
    assertRespectful(resposta, 'a resposta')
    if (!demo) return replyReview(id, resposta)
    if (resposta.trim().length < 3) throw new Error('Escreva uma resposta de pelo menos 3 caracteres.')
    setData(current => ({ ...current, reviews: current.reviews.map(item => item.id === id ? { ...item, resposta: resposta.trim() } : item) }))
  }
  async function product(id, settings) {
    if (!demo) return saveProduct(id, settings, companyId)
    const preco = Math.round(Number(settings.preco) * 100) / 100
    if (!(preco > 0 && preco <= 2000)) throw new Error('Confira o preço informado.')
    setData(current => ({ ...current, settings: [...current.settings.filter(item => item.id !== id), { ...current.settings.find(item => item.id === id), id, disponivel: settings.disponivel, preco }] }))
  }
  async function promotion(id, input) {
    const promocao = validatePromotion(input)
    if (!demo) return savePromotion(id, promocao, companyId)
    const base = produtos.find(item => item.id === id)
    if (!base) throw new Error('Escolha um produto do cardápio.')
    setData(current => ({ ...current, settings: [...current.settings.filter(item => item.id !== id), { preco: base.preco, disponivel: true, ...current.settings.find(item => item.id === id), id, promocao }] }))
  }
  function simulate() {
    setData(current => ({ ...current, orders: [makeDemoOrder(Math.max(1047, ...current.orders.map(o => Number(o.id.replace('PP-', '')))) + 1), ...current.orders] }))
  }
  const status = Object.values(sources)
  return { ...data, sources, loading: status.some(value => value.loading), error: status.map(value => value.error).filter(Boolean).join(' '), fromCache: status.some(value => value.fromCache), retry: () => setAttempt(value => value + 1), advance, decide, reply, product, promotion, simulate, reset: () => setData(makeCompanyDemo()) }
}
