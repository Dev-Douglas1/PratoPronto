import { traduzirErroSupabase } from './supabaseError.js'

export const COMPANY_SOURCES = { orders: 'pedidos', refunds: 'solicitações de atendimento', reviews: 'avaliações', settings: 'cardápio e ofertas' }

export function accessError(error, resource = 'dados', company = false) {
  const code = String(error?.code || '').replace(/^firestore\//, '')
  if (code === 'permission-denied') {
    return company
      ? `O Supabase recusou a leitura de ${resource}. Entre novamente. Se continuar, confira as políticas RLS e o vínculo desta conta com a empresa.`
      : 'Não foi possível atualizar preços e disponibilidade. Você pode consultar os produtos; adicionar ao pedido ficará disponível após reconectar.'
  }
  return company ? `Não foi possível atualizar ${resource}. ${traduzirErroSupabase(error)}`
    : 'Não foi possível atualizar o cardápio. Confira a conexão e tente novamente. Os preços abaixo precisam de confirmação.'
}

export function initialSources(demo = false) {
  return Object.fromEntries(Object.keys(COMPANY_SOURCES).map(key => [key, { loading: !demo, error: '', fromCache: !demo }]))
}

export function companyTabState(sources, tab) {
  const keys = { pedidos: ['orders'], entregas: ['orders'], concluidos: ['orders'], avaliacoes: ['reviews'], cardapio: ['settings'], promocoes: ['settings'], atendimento: ['orders', 'refunds'], equipe: [], configuracoes: [] }[tab] || []
  const values = keys.map(key => sources[key])
  return { loading: values.some(value => value.loading), error: values.map(value => value.error).filter(Boolean).join(' '), fromCache: values.some(value => value.fromCache) }
}
