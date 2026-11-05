import { useEffect, useState } from 'react'
import { advanceOrder, decideRefund, replyReview, saveProduct, savePromotion, subscribeCompany } from '../services/company.js'
import { accessError, COMPANY_SOURCES, initialSources } from '../utils/dataAccess.js'
import { assertRespectful } from '../shared/input-policy.js'
import { validatePromotion } from '../shared/promotions.js'

const empty = { orders: [], refunds: [], reviews: [], settings: [], events: {} }

// Carrega exclusivamente dados reais da empresa autorizada pelo contexto de sessão.
export default function useCompanyData(companyId) {
  const [data, setData] = useState(empty)
  const [sources, setSources] = useState(() => initialSources())
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!companyId) {
      setData(empty)
      setSources(initialSources())
      return
    }

    let live = true
    setData(empty)
    setSources(initialSources())
    const unsubscribe = []

    for (const [name, key] of [['orders', 'orders'], ['refundRequests', 'refunds'], ['reviews', 'reviews'], ['productSettings', 'settings']]) {
      const fail = err => {
        if (!live) return
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
  }, [attempt, companyId])

  async function advance(id, next, received) {
    if (!companyId) throw new Error('Nenhuma empresa autorizada está selecionada.')
    return advanceOrder(id, next, received)
  }
  async function decide(id, approve, resposta) {
    assertRespectful(resposta, 'a resposta')
    if (!companyId) throw new Error('Nenhuma empresa autorizada está selecionada.')
    return decideRefund(id, approve, resposta)
  }
  async function reply(id, resposta) {
    assertRespectful(resposta, 'a resposta')
    if (!companyId) throw new Error('Nenhuma empresa autorizada está selecionada.')
    return replyReview(id, resposta)
  }
  async function product(id, settings) {
    if (!companyId) throw new Error('Nenhuma empresa autorizada está selecionada.')
    return saveProduct(id, settings, companyId)
  }
  async function promotion(id, input) {
    if (!companyId) throw new Error('Nenhuma empresa autorizada está selecionada.')
    return savePromotion(id, validatePromotion(input), companyId)
  }

  const status = Object.values(sources)
  return {
    ...data,
    sources,
    loading: status.some(value => value.loading),
    error: status.map(value => value.error).filter(Boolean).join(' '),
    fromCache: status.some(value => value.fromCache),
    retry: () => setAttempt(value => value + 1),
    advance,
    decide,
    reply,
    product,
    promotion,
    simulate: () => { throw new Error('A criação de pedidos fictícios foi removida.') },
    reset: () => setData(empty),
  }
}
