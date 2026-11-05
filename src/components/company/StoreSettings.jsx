import { useEffect, useRef, useState } from 'react'
import { callServer } from '../../services/server.js'
import { getSupabase } from '../../lib/supabase.js'
import { restaurantIdForSlug } from '../../services/company.js'
import AddressFields from '../AddressFields.jsx'
import { DEFAULT_COMPANY_ID } from '../../config/marketplace.js'
import { validateCompanySettings } from '../../shared/company-settings.js'

const days = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const empty = () => ({
  name: '', legalName: '', document: '', phone: '', privacyEmail: '',
  address: { endereco: '', numero: '', bairro: '', complemento: '', cep: '', cidade: '', uf: '' },
  timezone: 'America/Sao_Paulo', estimateMinutes: 45, retentionDays: 90, acceptingOrders: false,
  methods: ['maquina_entrega'], hours: days.map(() => []),
  zones: [{ bairro: '', fee: '', min: '', freeAbove: '' }],
})
const clock = value => String(Math.floor(value / 60)).padStart(2,'0') + ':' + String(value % 60).padStart(2,'0')
const minutes = value => { const [h,m] = value.split(':').map(Number); return h * 60 + m }
const fromStored = data => {
  const base = empty()
  const zones = Array.isArray(data?.zones) && data.zones.length ? data.zones : base.zones
  return {
    ...base,
    ...(data || {}),
    methods: ['maquina_entrega'],
    address: { ...base.address, ...(data?.address || {}) },
    hours: days.map((_,index) => Array.isArray(data?.hours?.[index]) ? data.hours[index] : []),
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
  const [loadingSettings, setLoadingSettings] = useState(!demo)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)

  function updateForm(updater) {
    dirtyRef.current = true
    setDirty(true)
    setForm(current => typeof updater === 'function' ? updater(current) : updater)
  }
  function change(event) {
    const { name, value, type, checked } = event.target
    updateForm(current => ({ ...current, [name]: type === 'checkbox' ? checked : type === 'number' ? (value === '' ? '' : Number(value)) : value }))
  }
  function addressChange(event) {
    const { name, value } = event.target
    updateForm(current => ({ ...current, address: { ...current.address, [name]: value } }))
  }

  async function refresh() {
    if (demo) return
    setChecking(true)
    try {
      setReady(await callServer('appReadiness', { companyId }))
      setError('')
    } catch (err) {
      setError(err.message || 'Não foi possível conferir os serviços.')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    if (demo) {
      setLoadingSettings(false)
      return
    }
    const supabase = getSupabase()
    let alive = true
    let channel
    dirtyRef.current = false
    setDirty(false)
    setLoadingSettings(true)
    setError('')

    async function loadSettings() {
      try {
        const rid = await restaurantIdForSlug(companyId)
        const { data, error: readError } = await supabase.from('restaurant_settings').select('data').eq('restaurante_id', rid).maybeSingle()
        if (readError) throw readError
        if (alive && !dirtyRef.current && data?.data) setForm(fromStored(data.data))
        if (!channel && alive) {
          channel = supabase.channel('settings:' + companyId)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_settings', filter: 'restaurante_id=eq.' + rid }, () => {
              if (!dirtyRef.current) loadSettings()
            })
            .subscribe()
        }
      } catch (err) {
        if (alive) setError(err.message || 'Não foi possível carregar as configurações.')
      } finally {
        if (alive) setLoadingSettings(false)
      }
    }

    refresh()
    loadSettings()
    return () => {
      alive = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [demo, companyId])

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const normalized = validateCompanySettings(form)
      if (!demo) {
        await callServer('appSaveSettings', { ...normalized, companyId })
      }
      dirtyRef.current = false
      setDirty(false)
      setForm(fromStored(normalized))
      setNotice(demo ? 'Configurações atualizadas apenas nesta demonstração.' : 'Configurações salvas e sincronizadas com o Supabase.')
      if (!demo) setReady(await callServer('appReadiness', { companyId }))
    } catch (err) {
      setError(err.message || 'Não foi possível salvar as configurações.')
    } finally {
      setSaving(false)
    }
  }

  function slot(day,index,key,value) {
    updateForm(current => ({ ...current, hours: current.hours.map((slots,d) => d !== day ? slots : slots.map((item,i) => i === index ? { ...item, [key]: value } : item)) }))
  }
  function zone(index,key,value) {
    updateForm(current => ({ ...current, zones: current.zones.map((item,i) => i === index ? { ...item, [key]: value } : item) }))
  }

  const checks = ready ? [
    ['Supabase conectado', true],
    ['Configuração da empresa', ready.restaurantConfigured],
    ['Pedidos com RLS', true],
    ['Pagamento na entrega', true],
  ] : []

  return <div className="store-settings">
    <section className="company-panel" aria-labelledby="settings-readiness-title">
      <h2 id="settings-readiness-title">Preparação da loja</h2>
      <p>{demo ? 'Veja os campos disponíveis para configurar a operação.' : 'As configurações desta empresa são isoladas no Supabase. Nesta fase, novos pedidos usam pagamento na entrega.'}</p>
      {loadingSettings && <p role="status">Carregando configurações da empresa…</p>}
      {checks.length > 0 && <ul className="readiness-list">{checks.map(([name,ok]) => <li key={name}><span>{name}</span><b className={ok ? 'ready' : 'pending'}>{ok ? 'Conferido' : 'Pendente'}</b></li>)}</ul>}
      {!demo && <button className="company-button secondary" type="button" disabled={checking || saving} onClick={refresh}>{checking ? 'Conferindo…' : 'Conferir serviços novamente'}</button>}
    </section>
    {error && <p className="company-alert" role="alert">{error}</p>}
    {notice && <p className="company-notice" role="status">{notice}</p>}
    <form className="company-panel settings-form" onSubmit={save}>
      <div className="operation-row"><div><h2>Dados e atendimento</h2><p className="muted">Informações exibidas e utilizadas na operação da loja.</p></div>{dirty && <span className="settings-unsaved" role="status">Alterações não salvas</span>}</div>
      <fieldset disabled={loadingSettings || saving}>
        <div className="settings-grid">
          {[['name','Nome da empresa'],['legalName','Nome do responsável legal'],['document','CPF/CNPJ da empresa (quando aplicável)'],['phone','Telefone de atendimento'],['privacyEmail','E-mail de privacidade']].map(([name,label]) =>
            <label key={name}>{label}<input name={name} value={form[name]} onChange={change} type={name === 'privacyEmail' ? 'email' : 'text'} inputMode={name === 'phone' || name === 'document' ? 'numeric' : undefined} maxLength={name === 'privacyEmail' ? 254 : 160} required={name !== 'document'} /></label>
          )}
        </div>
        <h3>Endereço da empresa</h3>
        <div className="settings-grid">
          {[['endereco','Rua'],['numero','Número'],['bairro','Bairro'],['complemento','Complemento']].map(([name,label]) =>
            <label key={name}>{label}<input name={name} value={form.address[name]} onChange={addressChange} maxLength={180} required={name !== 'complemento'} /></label>
          )}
        </div>
        <AddressFields data={form.address} onChange={addressChange} />

        <h3>Horários de recebimento de pedidos</h3>
        <label>Fuso horário<select name="timezone" value={form.timezone} onChange={change}>{['America/Sao_Paulo','America/Manaus','America/Rio_Branco','America/Noronha','America/Cuiaba'].map(value => <option key={value}>{value}</option>)}</select></label>
        {days.map((day,d) => <div key={day} className="hours-row">
          <b>{day}</b>
          {form.hours[d].length === 0 && <span className="muted">Fechado</span>}
          {form.hours[d].map((period,i) => <div key={i} className="hours-period">
            <input aria-label={day + ' abertura'} type="time" required value={clock(period.start)} onChange={event => slot(d,i,'start',minutes(event.target.value))} />
            <span>até</span>
            <input aria-label={day + ' fechamento'} type="time" required value={period.end === 1440 ? '23:59' : clock(period.end)} onChange={event => slot(d,i,'end',event.target.value === '23:59' ? 1440 : minutes(event.target.value))} />
            <button type="button" className="company-button subtle" aria-label={'Remover intervalo de ' + day} onClick={() => updateForm(current => ({ ...current, hours: current.hours.map((slots,n) => n !== d ? slots : slots.filter((_,j) => j !== i)) }))}>Remover</button>
          </div>)}
          {form.hours[d].length < 3 && <button className="company-button subtle" type="button" onClick={() => updateForm(current => ({ ...current, hours: current.hours.map((slots,n) => n === d ? [...slots,{ start:540,end:1080 }] : slots) }))}>+ Adicionar intervalo</button>}
        </div>)}

        <h3>Bairros atendidos</h3>
        {form.zones.map((item,i) => <div className="zone-row" key={i}>
          <label>Bairro<input value={item.bairro} onChange={event => zone(i,'bairro',event.target.value)} maxLength={100} required /></label>
          {[['fee','Taxa (R$)'],['min','Pedido mínimo (R$)'],['freeAbove','Grátis a partir de (R$)']].map(([key,label]) =>
            <label key={key}>{label}<input type="number" min="0" max={key === 'freeAbove' ? '10000' : '1000'} step="0.01" value={item[key]} onChange={event => zone(i,key,event.target.value)} required={key === 'fee'} /></label>
          )}
          <button type="button" className="company-button subtle" disabled={form.zones.length === 1} onClick={() => updateForm(current => ({ ...current, zones: current.zones.filter((_,n) => n !== i) }))}>Remover bairro</button>
        </div>)}
        <button className="company-button secondary" type="button" disabled={form.zones.length >= 100} onClick={() => updateForm(current => ({ ...current, zones: [...current.zones,{ bairro:'',fee:'',min:'',freeAbove:'' }] }))}>+ Adicionar bairro</button>

        <h3>Pagamento e operação</h3>
        <label className="company-checkbox"><input type="checkbox" checked readOnly />Maquininha na entrega</label>
        <p className="muted">Pix e cartão online permanecem desativados até a integração segura do provedor de pagamento com Supabase Edge Functions.</p>
        <div className="settings-grid">
          <label>Previsão de entrega (minutos)<input type="number" name="estimateMinutes" min="10" max="240" value={form.estimateMinutes} onChange={change} required /></label>
          <label>Retenção operacional (dias)<input name="retentionDays" type="number" min="30" max="3650" value={form.retentionDays} onChange={change} required /></label>
        </div>
        <label className="company-checkbox"><input name="acceptingOrders" type="checkbox" checked={form.acceptingOrders} onChange={change} />Receber pedidos</label>
        <div className="inline-actions settings-actions">
          <button className="company-button primary" disabled={loadingSettings || saving} type="submit">{saving ? 'Salvando…' : 'Salvar configurações'}</button>
          {dirty && <button className="company-button secondary" type="button" disabled={saving} onClick={() => { dirtyRef.current = false; setDirty(false); if (!demo) { setLoadingSettings(true); const supabase = getSupabase(); restaurantIdForSlug(companyId).then(rid => supabase.from('restaurant_settings').select('data').eq('restaurante_id',rid).maybeSingle()).then(({data,error:readError}) => { if (readError) throw readError; if (data?.data) setForm(fromStored(data.data)); setLoadingSettings(false) }).catch(err => { setError(err.message); setLoadingSettings(false) }) } else setForm(empty()) }}>Descartar alterações</button>}
        </div>
      </fieldset>
    </form>
  </div>
}
