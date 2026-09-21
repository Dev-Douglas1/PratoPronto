import { useEffect, useState } from 'react'
import { listAvailablePilots, listPilotContacts, savePilotContact } from '../../services/marketplace.js'

const initial = { relationType: 'own', label: '', contactType: 'whatsapp', contactValue: '', notes: '', pilotProfileId: '' }

export default function CompanyPilotContacts({ companyId }) {
  const [contacts, setContacts] = useState([])
  const [pilots, setPilots] = useState([])
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    try {
      const [contactRows, pilotRows] = await Promise.all([listPilotContacts(companyId), listAvailablePilots()])
      setContacts(contactRows)
      setPilots(pilotRows)
    } catch (err) { setError(err.message || 'Não foi possível carregar os contatos de entrega.') }
  }
  useEffect(() => { load() }, [companyId])

  async function save(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      await savePilotContact(companyId, { ...form, pilotProfileId: form.pilotProfileId || null })
      setForm(initial)
      setNotice('Contato de entrega salvo.')
      await load()
    } catch (err) { setError(err.message || 'Não foi possível salvar o contato.') }
    finally { setBusy(false) }
  }

  function contactHref(item) {
    const value = String(item.contact_value || '').trim()
    if (item.contact_type === 'email') return 'mailto:' + value
    const digits = value.replace(/\D/g, '')
    if (item.contact_type === 'whatsapp') return 'https://wa.me/55' + digits.replace(/^55/, '')
    if (item.contact_type === 'phone') return 'tel:+' + (digits.startsWith('55') ? digits : '55' + digits)
    return null
  }

  return <section className="company-panel">
    <h2>Contatos de pilotos</h2>
    <p>Cadastre o contato de um piloto próprio ou parceiro. Se ele também tiver perfil de Piloto Parceiro, você pode vinculá-lo à conta para enviar ofertas pelo app.</p>
    {error && <p className="company-alert" role="alert">{error}</p>}
    {notice && <p className="company-notice" role="status">{notice}</p>}
    <form className="settings-form" onSubmit={save}>
      <div className="settings-grid">
        <label>Relação
          <select value={form.relationType} onChange={e => setForm(v => ({ ...v, relationType: e.target.value }))}>
            <option value="own">Piloto próprio</option>
            <option value="partner">Piloto parceiro</option>
          </select>
        </label>
        <label>Nome/identificação
          <input required minLength="2" maxLength="100" value={form.label} onChange={e => setForm(v => ({ ...v, label: e.target.value }))} placeholder="Ex.: João - turno da noite" />
        </label>
        <label>Meio de contato
          <select value={form.contactType} onChange={e => setForm(v => ({ ...v, contactType: e.target.value }))}>
            <option value="whatsapp">WhatsApp</option><option value="phone">Telefone</option><option value="email">E-mail</option><option value="other">Outro</option>
          </select>
        </label>
        <label>Contato
          <input required maxLength="254" value={form.contactValue} onChange={e => setForm(v => ({ ...v, contactValue: e.target.value }))} />
        </label>
        <label>Vincular a Piloto Parceiro (opcional)
          <select value={form.pilotProfileId} onChange={e => setForm(v => ({ ...v, pilotProfileId: e.target.value }))}>
            <option value="">Não vincular</option>
            {pilots.map(p => <option key={p.profile_id} value={p.profile_id}>{p.display_name} · {p.vehicle_type}</option>)}
          </select>
        </label>
      </div>
      <label>Observações
        <textarea maxLength="500" value={form.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))} />
      </label>
      <button className="company-button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar contato'}</button>
    </form>
    <div className="company-contact-list">
      {contacts.map(item => {
        const href = contactHref(item)
        return <div className="operation-row" key={item.id}>
          <p><b>{item.label}</b><br /><span>{item.relation_type === 'own' ? 'Piloto próprio' : 'Parceiro'} · {item.contact_type}: {item.contact_value}</span></p>
          {href && <a className="company-button secondary" href={href} target={item.contact_type === 'whatsapp' ? '_blank' : undefined} rel="noreferrer">Contatar</a>}
        </div>
      })}
      {!contacts.length && <p className="muted">Nenhum contato cadastrado.</p>}
    </div>
  </section>
}
