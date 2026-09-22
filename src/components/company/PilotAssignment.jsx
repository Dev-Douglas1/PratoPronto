import { useEffect, useState } from 'react'
import { listAvailablePilots, offerDelivery } from '../../services/marketplace.js'

export default function PilotAssignment({ companyId, order, disabled, onAssigned }) {
  const [pilots, setPilots] = useState([])
  const [pilotUid, setPilotUid] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    listAvailablePilots().then(values => { if (alive) setPilots(values) }).catch(err => { if (alive) setError(err.message) })
    return () => { alive = false }
  }, [companyId, order.id])

  async function sendOffer() {
    if (!pilotUid) return
    setBusy(true); setError(''); setNotice('')
    try {
      await offerDelivery({ orderId: order.id, pilotProfileId: pilotUid, message })
      setNotice('Oferta enviada. O Piloto Parceiro pode aceitar ou recusar pelo aplicativo.')
      setMessage('')
      onAssigned?.()
    } catch (err) { setError(err.message || 'Não foi possível enviar a oferta.') }
    finally { setBusy(false) }
  }

  return <section className="detail-section">
    <h3>Piloto Parceiro</h3>
    {order.assignedCourier
      ? <p className="company-notice">Entrega aceita por um Piloto Parceiro. Ele iniciará a rota quando o pedido estiver pronto.</p>
      : <>
        <p className="muted">Envie uma oferta para um piloto cadastrado. O pedido só fica atribuído depois que ele aceitar.</p>
        {!pilots.length ? <p className="muted">Nenhum piloto cadastrado está disponível agora. Use os contatos próprios/parceiros na aba Equipe.</p> : <>
          <label>Piloto disponível
            <select value={pilotUid} disabled={disabled || busy} onChange={e => setPilotUid(e.target.value)}>
              <option value="">Selecione um piloto</option>
              {pilots.map(pilot => <option value={pilot.profile_id} key={pilot.profile_id}>{pilot.display_name} · {pilot.vehicle_type}{pilot.city ? ' · ' + pilot.city : ''}</option>)}
            </select>
          </label>
          <label>Mensagem opcional
            <input maxLength="500" value={message} onChange={e => setMessage(e.target.value)} placeholder="Ex.: retirada em até 15 minutos" />
          </label>
          <button type="button" className="company-button secondary" disabled={disabled || busy || !pilotUid} onClick={sendOffer}>
            {busy ? 'Enviando…' : 'Enviar oferta de entrega'}
          </button>
        </>}
      </>}
    {notice && <p className="company-notice" role="status">{notice}</p>}
    {error && <p className="company-alert" role="alert">{error}</p>}
  </section>
}
