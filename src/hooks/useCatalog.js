import { useEffect, useMemo, useState } from 'react'
import { promotionStatus } from '../shared/promotions.js'
import { getSupabase, supabaseConfigured } from '../lib/supabase.js'

export default function useCatalog(enabled = true) {
  const [now, setNow] = useState(Date.now())
  const [rows, setRows] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setRows([]); setCompanies([]); setLoading(false); setError(''); setConfirmed(false)
      return undefined
    }
    if (!supabaseConfigured) {
      setRows([]); setCompanies([]); setLoading(false); setConfirmed(false)
      setError('Configure o Supabase para carregar preços e disponibilidade.')
      return undefined
    }

    const supabase = getSupabase()
    let alive = true
    let channel
    let requestVersion = 0

    async function load() {
      const version = ++requestVersion
      setLoading(true)
      const { data: restaurants, error: restaurantError } = await supabase
        .from('restaurantes').select('id,slug,nome,ativo').eq('ativo', true).order('nome').limit(100)
      if (restaurantError) throw restaurantError
      if (!alive || version !== requestVersion) return

      const activeCompanies = restaurants || []
      const restaurantIds = activeCompanies.map(company => company.id)
      let products = []
      if (restaurantIds.length) {
        const { data, error: productError } = await supabase
          .from('products').select('*').in('restaurant_id', restaurantIds).order('name').limit(1000)
        if (productError) throw productError
        products = data || []
      }

      if (!alive || version !== requestVersion) return
      const companyById = new Map(activeCompanies.map(company => [company.id, company]))
      setCompanies(activeCompanies)
      setRows(products.map(row => ({
        ...row,
        companyId: companyById.get(row.restaurant_id)?.slug,
        companyName: companyById.get(row.restaurant_id)?.nome,
      })).filter(row => row.companyId))
      setError('')
      setConfirmed(true)
      setLoading(false)

      if (!channel) {
        channel = supabase.channel('catalog:partner-companies')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => load().catch(fail))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurantes' }, () => load().catch(fail))
          .subscribe()
      }
    }

    function fail(err) {
      if (!alive) return
      setError(err?.message || 'Não foi possível atualizar o cardápio.')
      setConfirmed(false)
      setLoading(false)
    }

    load().catch(fail)
    return () => { alive = false; if (channel) supabase.removeChannel(channel) }
  }, [enabled, attempt])

  const catalog = useMemo(() => rows.map(row => {
    const promotion = row.promotion || undefined
    return {
      id: row.slug,
      uuid: row.id,
      companyId: row.companyId,
      companyName: row.companyName,
      nome: row.name,
      descricao: row.description || '',
      preco: Number(row.price_cents || 0) / 100,
      precoBase: Number(row.price_cents || 0) / 100,
      imagem: row.image_url || '/icons/app-icon.svg',
      categoria: row.category,
      // Customização de adicionais foi adiada; usar o preço cadastrado do produto.
      personalizavel: false,
      config: row.config || {},
      promocao: promotion,
      ofertaAtiva: row.active !== false && promotionStatus(promotion, now) === 'ativa',
      disponivel: row.active !== false,
    }
  }), [rows, now])

  return { catalog, companies, companyCount: companies.length, loading, error, confirmed, retry: () => setAttempt(value => value + 1) }
}
