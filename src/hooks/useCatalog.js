import { useEffect, useMemo, useState } from 'react'
import { promotionStatus } from '../shared/promotions.js'
import { getSupabase, supabaseConfigured } from '../lib/supabase.js'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'

export default function useCatalog(enabled = true, companyId = DEFAULT_COMPANY_ID) {
  const [now, setNow] = useState(Date.now())
  const [rows, setRows] = useState([])
  const [restaurantName, setRestaurantName] = useState('')
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(timer)
  }, [enabled])

  useEffect(() => {
    if (!enabled) { setRows([]); setRestaurantName(''); setLoading(false); setError(''); setConfirmed(false); return }
    if (!supabaseConfigured) {
      setRows([]); setRestaurantName(''); setLoading(false); setConfirmed(false)
      setError('Configure o Supabase para carregar preços e disponibilidade.')
      return
    }
    const supabase = getSupabase()
    let alive = true
    let channel

    async function load() {
      setLoading(true)
      const { data: restaurant, error: restaurantError } = await supabase.from('restaurantes').select('id,slug,nome').eq('slug', companyId).maybeSingle()
      if (restaurantError) throw restaurantError
      if (!restaurant) throw new Error('Empresa não encontrada.')
      const { data, error: productError } = await supabase.from('products').select('*').eq('restaurant_id', restaurant.id).order('name')
      if (productError) throw productError
      if (!alive) return
      setRows(data || [])
      setRestaurantName(restaurant.nome || companyId)
      setError('')
      setConfirmed(true)
      setLoading(false)
      if (!channel) {
        channel = supabase.channel('catalog:' + companyId)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => load().catch(fail))
          .subscribe()
      }
    }

    function fail(err) {
      if (!alive) return
      setError(err.message || 'Não foi possível atualizar o cardápio.')
      setConfirmed(false)
      setLoading(false)
    }

    load().catch(fail)
    return () => { alive = false; if (channel) supabase.removeChannel(channel) }
  }, [enabled, companyId, attempt])

  const catalog = useMemo(() => rows.map(row => {
    const promocao = row.promotion || undefined
    const personalizavel = row.config?.personalizavel === true
    return {
      id: row.slug,
      uuid: row.id,
      companyId,
      companyName: restaurantName,
      nome: row.name,
      descricao: row.description || '',
      preco: Number(row.price_cents || 0) / 100,
      precoBase: Number(row.price_cents || 0) / 100,
      imagem: row.image_url || '/icons/app-icon.svg',
      categoria: row.category,
      personalizavel,
      config: row.config || {},
      promocao,
      ofertaAtiva: row.active !== false && promotionStatus(promocao, now) === 'ativa',
      disponivel: row.active !== false,
    }
  }), [rows, companyId, now, restaurantName])

  return { catalog, loading, error, confirmed, retry: () => setAttempt(value => value + 1) }
}
