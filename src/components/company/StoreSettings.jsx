import { useEffect, useState } from 'react'
import { callServer } from '../../services/server.js'
import { getSupabase } from '../../lib/supabase.js'
import { restaurantIdForSlug } from '../../services/company.js'
import AddressFields from '../AddressFields.jsx'
import { DEFAULT_COMPANY_ID } from '../../config/marketplace.js'

const days = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const empty = () => ({
  name: '', legalName: '', document: '', phone: '', privacyEmail: '',
  address: { endereco: '', numero: '', bairro: '', complemento: '', cep: '', cidade: '', uf: '' },
  timezone: 'America/Sao_Paulo', estimateMinutes: 45, retentionDays: 90, acceptingOrders: false,
  methods: ['maquina_entrega'], hours: days.map(() => []),
  zones: [{ bairro: '', fee: '', min: '', freeAbove: '' }],
})
const clock = minutes => String(Math.floor(minutes / 60)).padStart(2,'0') + ':' + String(minutes % 60).padStart(2,'0')
const minutes = value => { const [h,m] = value.split(':').map(Number); return h * 60 + m }
const fromStored = data => {
  const base = empty()
  const zones = Array.isArray(data?.zones) && data.zones.length ? data.zones : base.zones
  return {
    ...base,
    ...(data || {}),
    methods: ['maquina_entrega'],
    address: { ...base.address, ...(data?.address || {}) },
    hours: days.map((_,index) => data?.hours?.[index] || []),
    zones: zones.map(zone => ({
      bairro: zone.bairro || '',
      fee: Number(zone.feeCents ?? Math.round(Number(zone.fee || 0) * 100)) / 100,
      min: Number(zone.minCents ?? Math.round(Number(zone.min || 0) * 100)) / 100,
      freeAbove: zone.freeAboveCents == null && zone.freeAbove === '' ? '' : Number(zone.freeAboveCents ?? Math.round(Number(zone.freeAbove || 0) * 100)) / 100,
    })),
  }
}

export default function StoreSettings({ demo, companyId = DEFAULT_COMPANY_ID }) {
  const [form, setForm] = useState(empty)
  const [ready, setReady] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  function change(event) {
    const { name, value, type, checked } = event.target
    setForm(current => ({ ...current, [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value }))
  }
  function addressChange(event) {
    const { name, value } = event.target
    setForm(current => ({ ...current, address: { ...current.address, [name]: value } }))
  }
  async function refresh() {
    if (demo) return
    setBusy(true); setError('')
    try { setReady(await callServer('appReadiness', { companyId })) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (demo) return
    const supabase = getSupabase()
    let alive = true
    let channel
    async function load() {
      try {
        const rid = await restaurantIdForSlug(companyId)
        const { data, error: readError } = await supabase.from('restaurant_settings').select('data').eq('restaurante_id', rid).maybeSingle()
        if (readError) throw readError
        if (alive && data?.data) setForm(fromStored(data.data))
        if (!channel && alive) {
          channel = supabase.channel('settings:' + companyId)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_settings', filter: 'restaurante_id=eq.' + rid }, () => load())
            .subscribe()
        }
      } catch (err) { if (alive) setError(err.message || 'Não foi possível carregar as configurações.') }
    }
    refresh()
    load()
    return () => { alive = false; if (channel) supabase.removeChannel(channel) }
  }, [demo, companyId])

  async function save(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const zones = form.zones.map(zone => ({
        bairro: zone.bairro.trim(),
        feeCents: Math.round(Number(zone.fee || 0) * 100),
        minCents: Math.round(Number(zone.min || 0) * 100),
        freeAboveCents: zone.freeAbove === '' ? null : Math.round(Number(zone.freeAbove || 0) * 100),
      }))
      if (!demo) await callServer('appSaveSettings', { ...form, zones, methods: ['maquina_entrega'], companyId })
      setNotice(demo ? 'Configuração de demonstração alterada nesta tela.' : 'Configurações salvas no Supabase.')
      if (!demo) setReady(await callServer('appReadiness', { companyId }))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  function slot(day,index,key,value) {
    setForm(current => ({ ...current, hours: current.hours.map((slots,d) => d !== day ? slots : slots.map((item,i) => i === index ? { ...item, [key]: value } : item)) }))
  }
  function zone(index,key,value) {
    setForm(current => ({ ...current, zones: current.zones.map((item,i) => i === index ? { ...item, [key]: value } : item) }))
  }

  const checks = ready ? [
    ['Supabase conectado', true],
    ['Configuração da empresa', ready.restaurantConfigured],
    ['Pedidos com RLS', true],
    ['Pagamento na entrega', true],
  ] : []

  return <div className="store-settings">
    <section className="company-panel">
      <h2>Preparação da loja</h2>
      <p>{demo ? 'Veja os campos disponíveis para configurar a operação.' : 'As configurações desta empresa são isoladas no Supabase. Nesta fase, novos pedidos usam pagamento na entrega.'}</p>
      {checks.length > 0 && <ul className="readiness-list">{checks.map(([name,ok]) => <li key={name}><span>{name}</span><b className={ok ? 'ready' : 'pending'}>{ok ? 'Conferido' : 'Pendente'}</b></li>)}</ul>}
      {!demo && <button className="company-button secondary" disabled={busy} onClick={refresh}>Conferir serviços novamente</button>}
    </section>
    {error && <p className="company-alert" role="alert">{error}</p>}
    {notice && <p className="company-notice" role="status">{notice}</p>}
    <form className="company-panel settings-form" onSubmit={save}>
      <h2>Dados e atendimento</h2>
      <div className="settings-grid">
        {[['name','Nome da empresa'],['legalName','Nome do responsável legal'],['document','CPF/CNPJ da empresa (quando aplicável)'],['phone','Telefone de atendimento'],['privacyEmail','E-mail de privacidade']].map(([name,label]) =>
          <label key={name}>{label}<input name={name} value={form[name]} onChange={change} type={name === 'privacyEmail' ? 'email' : 'text'} maxLength={name === 'privacyEmail' ? 254 : 160} required={name !== 'document'} /></label>
        )}
      </div>
      <h3>Endereço da empresa</h3>
      <AddressFields data={form.address} onChange={addressChange} />
      <div className="settings-grid">
        {[['endereco','Rua'],['numero','Número'],['bairro','Bairro'],['complemento','Complemento']].map(([name,label]) =>
          <label key={name}>{label}<input name={name} value={form.address[name]} onChange={addressChange} maxLength={180} required={name !== 'complemento'} /></label>
        )}
      </div>

      <h3>Horários de recebimento de pedidos</h3>
      <label>Fuso horário<select name="timezone" value={form.timezone} onChange={change}>{['America/Sao_Paulo','America/Manaus','America/Rio_Branco','America/Noronha','America/Cuiaba'].map(value => <option key={value}>{value}</option>)}</select></label>
      {days.map((day,d) => <div key={day} className="hours-row"><b>{day}</b>
        {form.hours[d].map((period,i) => <div key={i} className="hours-period">
          <input aria-label={day + ' abertura'} type="time" required value={clock(period.start)} onChange={event => slot(d,i,'start',minutes(event.target.value))} />
          <span>até</span>
          <input aria-label={day + ' fechamento'} type="time" required value={period.end === 1440 ? '23:59' : clock(period.end)} onChange={event => slot(d,i,'end',event.target.value === '23:59' ? 1440 : minutes(event.target.value))} />
          <button type="button" className="company-button subtle" onClick={() => setForm(current => ({ ...current, hours: current.hours.map((slots,n) => n !== d ? slots : slots.filter((_,j) => j !== i)) }))}>×</button>
        </div>)}
        {form.hours[d].length < 3 && <button className="company-button subtle" type="button" onClick={() => setForm(current => ({ ...current, hours: current.hours.map((slots,n) => n === d ? [...slots,{ start:1080,end:1380 }] : slots) }))}>+ Intervalo</button>}
      </div>)}

      <h3>Bairros atendidos</h3>
      {form.zones.map((item,i) => <div className="zone-row" key={i}>
        <label>Bairro<input value={item.bairro} onChange={event => zone(i,'bairro',event.target.value)} maxLength={100} required /></label>
        {[['fee','Taxa (R$)'],['min','Pedido mínimo (R$)'],['freeAbove','Grátis a partir de (R$)']].map(([key,label]) =>
          <label key={key}>{label}<input type="number" min="0" step="0.01" value={item[key]} onChange={event => zone(i,key,event.target.value)} required={key === 'fee'} /></label>
        )}
        <button type="button" className="company-button subtle" disabled={form.zones.length === 1} onClick={() => setForm(current => ({ ...current, zones: current.zones.filter((_,n) => n !== i) }))}>Remover bairro</button>
      </div>)}
      <button className="company-button secondary" type="button" disabled={form.zones.length >= 100} onClick={() => setForm(current => ({ ...current, zones: [...current.zones,{ bairro:'',fee:'',min:'',freeAbove:'' }] }))}>+ Bairro</button>

      <h3>Pagamento e operação</h3>
      <label className="company-checkbox"><input type="checkbox" checked readOnly />Maquininha na entrega</label>
      <p className="muted">Pix e cartão online ficam desativados até a integração segura do provedor de pagamento com Supabase Edge Functions.</p>
      <div className="settings-grid">
        <label>Previsão de entrega (minutos)<input type="number" name="estimateMinutes" min="10" max="240" value={form.estimateMinutes} onChange={change} required /></label>
        <label>Retenção operacional (dias)<input name="retentionDays" type="number" min="30" max="3650" value={form.retentionDays} onChange={change} required /></label>
      </div>
      <label className="company-checkbox"><input name="acceptingOrders" type="checkbox" checked={form.acceptingOrders} onChange={change} />Receber pedidos</label>
      <button className="company-button primary" disabled={busy} type="submit">{busy ? 'Salvando…' : 'Salvar configurações'}</button>
    </form>
  </div>
}
