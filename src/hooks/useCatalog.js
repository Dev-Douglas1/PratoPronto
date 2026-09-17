import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { promotionStatus } from '../../functions/src/promotions.js'
import { db } from '../firebase.js'
import { produtos } from '../data/produtos.js'
import { accessError } from '../utils/dataAccess.js'

export default function useCatalog(enabled = true) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!enabled) return; const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer) }, [enabled])
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled) { setSettings({}); setLoading(false); setError(''); setConfirmed(false); return }
    let live = true
    setLoading(true)
    setError('')
    setConfirmed(false)
    if (!db) { setError('O cardápio está disponível para consulta. A empresa ainda precisa ativar os pedidos.'); setLoading(false); return }
    const fail = err => { if (!live) return; setSettings({}); setError(accessError(err)); setConfirmed(false); setLoading(false) }
    const stop = onSnapshot(collection(db, 'productSettings'), { includeMetadataChanges: true }, snapshot => {
      if (!live) return
      if (snapshot.metadata.fromCache) {
        setConfirmed(false)
        setLoading(false)
        setError('Sem confirmação do restaurante. Os preços e a disponibilidade precisam ser atualizados.')
        return
      }
      setSettings(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()])))
      setError(''); setLoading(false); setConfirmed(true)
    }, fail)
    return () => { live = false; stop() }
  }, [enabled, attempt])
  useEffect(() => {
    if (!enabled) return
    const refresh = () => setAttempt(value => value + 1)
    window.addEventListener('online', refresh)
    return () => window.removeEventListener('online', refresh)
  }, [enabled])
  const catalog = useMemo(() => produtos.map(product => {
    const preco = settings[product.id]?.preco ?? product.preco
    return { ...product, preco, precoBase: preco, promocao: confirmed ? settings[product.id]?.promocao : undefined, ofertaAtiva: confirmed && settings[product.id]?.disponivel !== false && promotionStatus(settings[product.id]?.promocao, now) === 'ativa', disponivel: settings[product.id]?.disponivel !== false }
  }), [settings, now, confirmed])
  return { catalog, loading, error, confirmed, retry: () => setAttempt(value => value + 1) }
}
