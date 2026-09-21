import { useEffect, useState } from 'react'
import { assignPilot, subscribeCompanyPilots } from '../../services/marketplace.js'

export default function PilotAssignment({ companyId, order, disabled, onAssigned }) {
  const [pilots, setPilots] = useState([])
  const [pilotUid, setPilotUid] = useState(order.assignedCourier || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setPilotUid(order.assignedCourier || '')
    if (!companyId) return
    return subscribeCompanyPilots(companyId, setPilots, () => setError('Não foi possível carregar os pilotos desta empresa.'))
  }, [companyId, order.id, order.assignedCourier])

  async function save() {
    if (!pilotUid) return
    setBusy(true); setError('')
    try {
      await assignPilot({ orderId: order.id, pilotUid })
      onAssigned?.(pilotUid)
    } catch (err) { setError(err.message || 'Não foi possível atribuir o piloto.') }
    finally { setBusy(false) }
  }

  return <section className="detail-section">
    <h3>Piloto Parceiro</h3>
    {!pilots.length ? <p className="muted">Adicione um Piloto Parceiro na aba Equipe para atribuir esta entrega.</p> : <>
      <label>Responsável pela entrega
        <select value={pilotUid} disabled={disabled || busy} onChange={e => setPilotUid(e.target.value)}>
          <option value="">Selecione um piloto</option>
          {pilots.map(pilot => <option value={pilot.userId} key={pilot.id}>{pilot.email || pilot.userId}</option>)}
        </select>
      </label>
      <button type="button" className="company-button secondary" disabled={disabled || busy || !pilotUid || pilotUid === order.assignedCourier} onClick={save}>
        {busy ? 'Salvando…' : order.assignedCourier ? 'Trocar piloto' : 'Atribuir piloto'}
      </button>
    </>}
    {error && <p className="company-alert" role="alert">{error}</p>}
  </section>
}
