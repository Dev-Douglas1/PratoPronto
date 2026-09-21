import { useEffect, useState } from 'react'
import { callServer } from '../services/server.js'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'

const cached = new Map()
const pending = new Map()

async function load(companyId) {
  const key = companyId || DEFAULT_COMPANY_ID
  const saved = cached.get(key)
  if (saved && Date.now() - saved.at < 60000) return saved.value
  if (!pending.has(key)) {
    pending.set(key, callServer('appStorefront', { companyId: key })
      .then(value => { cached.set(key, { value, at: Date.now() }); return value })
      .finally(() => pending.delete(key)))
  }
  return pending.get(key)
}

export default function useStorefront(companyId = DEFAULT_COMPANY_ID) {
  const key = companyId || DEFAULT_COMPANY_ID
  const initial = cached.get(key)
  const [state, setState] = useState({ store: initial?.value || null, loading: !initial, error: '' })
  useEffect(() => {
    let live = true
    const refresh = () => load(key).then(
      store => { if (live) setState({ store, loading: false, error: '' }) },
      () => { if (live) setState({ store: null, loading: false, error: 'A loja está sendo preparada para receber pedidos. Tente novamente em alguns instantes.' }) },
    )
    setState(current => ({ ...current, loading: !cached.has(key), error: '' }))
    refresh()
    const timer = setInterval(refresh, 60000)
    window.addEventListener('online', refresh)
    return () => { live = false; clearInterval(timer); window.removeEventListener('online', refresh) }
  }, [key])
  return state
}
