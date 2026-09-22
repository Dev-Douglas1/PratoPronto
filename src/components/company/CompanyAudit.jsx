import { useEffect, useState } from 'react'
import { listAuditEvents } from '../../services/marketplace.js'

const labels = {
  'orders.insert': 'Pedido criado',
  'orders.update': 'Pedido atualizado',
  'restaurant_members.insert': 'Membro adicionado',
  'restaurant_members.update': 'Membro atualizado',
  'restaurant_members.delete': 'Membro removido',
  'restaurant_settings.insert': 'Configuração criada',
  'restaurant_settings.update': 'Configuração alterada',
  'products.insert': 'Produto criado',
  'products.update': 'Produto alterado',
  'products.delete': 'Produto removido',
  'order_delivery_offers.insert': 'Oferta de entrega criada',
  'order_delivery_offers.update': 'Oferta de entrega atualizada',
  'reviews.insert': 'Avaliação criada',
  'reviews.update': 'Avaliação respondida/atualizada',
  'refund_requests.insert': 'Solicitação de atendimento criada',
  'refund_requests.update': 'Solicitação de atendimento atualizada',
  'restaurant_pilot_contacts.insert': 'Contato de piloto criado',
  'restaurant_pilot_contacts.update': 'Contato de piloto atualizado',
  'restaurant_pilot_contacts.delete': 'Contato de piloto removido',
}

export default function CompanyAudit({ restaurantId }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    if (!restaurantId) return
    setLoading(true); setError('')
    try {
      setEvents(await listAuditEvents({ restaurantId, limit: 150 }))
    } catch (err) {
      setError(err.message || 'Não foi possível carregar a auditoria da empresa.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [restaurantId])

  return <section className="company-panel">
    <div className="section-heading">
      <div><h2>Auditoria da empresa</h2><p>Histórico técnico das alterações mais importantes.</p></div>
      <button className="company-button secondary" type="button" disabled={loading} onClick={load}>Atualizar</button>
    </div>
    {error && <p className="company-alert" role="alert">{error}</p>}
    {loading ? <p>Carregando auditoria…</p> : !events.length ? <p className="muted">Nenhum evento registrado ainda.</p> :
      <div className="audit-list">
        {events.map(event => <article className="operation-row" key={event.id}>
          <p>
            <b>{labels[event.action] || event.action}</b><br />
            <span>{event.target_type}{event.target_id ? ' · #' + String(event.target_id).slice(-8) : ''}</span>
            {event.metadata && Object.keys(event.metadata).length > 0 &&
              <small> · {Object.entries(event.metadata).filter(([,value]) => value != null && value !== '').map(([key,value]) => key + ': ' + value).join(' · ')}</small>}
          </p>
          <time>{new Date(event.created_at).toLocaleString('pt-BR')}</time>
        </article>)}
      </div>}
  </section>
}
