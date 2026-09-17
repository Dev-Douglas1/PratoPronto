import { useEffect, useState } from 'react'
import { callServer } from '../services/server.js'

let cached = null
let pending = null
async function load() {
  if (cached && Date.now() - cached.at < 60000) return cached.value
  if (!pending) pending = callServer('appStorefront').then(value => { cached = { value, at: Date.now() }; return value }).finally(() => { pending = null })
  return pending
}
export default function useStorefront() {
  const [state, setState] = useState({ store: cached?.value || null, loading: !cached, error: '' })
  useEffect(() => {
    let live = true
    const refresh = () => load().then(store => { if (live) setState({ store, loading: false, error: '' }) }, () => { if (live) setState({ store: null, loading: false, error: 'A loja está sendo preparada para receber pedidos. Tente novamente em alguns instantes.' }) })
    refresh()
    const timer = setInterval(refresh, 60000)
    window.addEventListener('online', refresh)
    return () => { live = false; clearInterval(timer); window.removeEventListener('online', refresh) }
  }, [])
  return state
}
