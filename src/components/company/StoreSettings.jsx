import { useEffect, useState } from 'react'
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase.js'
import { callServer } from '../../services/server.js'
import AddressFields from '../AddressFields.jsx'
import { DEFAULT_COMPANY_ID } from '../../config/marketplace.js'

const days = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const empty = () => ({ name: '', legalName: '', document: '', phone: '', privacyEmail: '', address: { endereco: '', numero: '', bairro: '', complemento: '', cep: '', cidade: '', uf: '' }, timezone: 'America/Sao_Paulo', estimateMinutes: 45, retentionDays: 90, acceptingOrders: false, methods: ['maquina_entrega'], hours: days.map(() => []), zones: [{ bairro: '', fee: '', min: '', freeAbove: '' }] })
const clock = minutes => String(Math.floor(minutes / 60)).padStart(2,'0') + ':' + String(minutes % 60).padStart(2,'0')
const minutes = value => { const [h,m] = value.split(':').map(Number); return h * 60 + m }
const fromStored = data => ({ ...empty(), ...data, hours: days.map((_,index) => data.hours?.[index] || []), zones: data.zones.map(zone => ({ bairro: zone.bairro, fee: zone.feeCents / 100, min: zone.minCents / 100, freeAbove: zone.freeAboveCents === null ? '' : zone.freeAboveCents / 100 })) })

export default function StoreSettings({ demo, companyId = DEFAULT_COMPANY_ID }) {
  const [form, setForm] = useState(empty)
  const [ready, setReady] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [requests, setRequests] = useState([])
  const [backup, setBackup] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  function change(event) { const { name, value, type, checked } = event.target; setForm(current => ({ ...current, [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value })) }
  function addressChange(event) { const { name, value } = event.target; setForm(current => ({ ...current, address: { ...current.address, [name]: value } })) }
  async function refresh() {
    if (demo) return
    setBusy(true); setError('')
    try { setReady(await callServer('appReadiness', { companyId })) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  useEffect(() => {
    if (demo) return
    refresh()
    const fail = () => setError('Não foi possível ler as configurações. Confira o acesso da empresa e as regras do banco.')
    const settingsRef = companyId === DEFAULT_COMPANY_ID
      ? doc(db,'settings','restaurant')
      : doc(db,'companies',companyId,'settings','store')
    const stops = [
      onSnapshot(settingsRef, snapshot => { if (snapshot.exists()) setForm(fromStored(snapshot.data())) }, fail),
    ]
    if (companyId === DEFAULT_COMPANY_ID) {
      stops.push(
        onSnapshot(doc(db,'operations','backup'), snapshot => setBackup(snapshot.data() || null), fail),
        onSnapshot(query(collection(db,'operationAlerts'), where('state','==','open'), limit(50)), snapshot => setAlerts(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))), fail),
        onSnapshot(query(collection(db,'privacyRequests'), where('status','!=','concluido'), limit(50)), snapshot => setRequests(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))), fail),
      )
    }
    return () => stops.forEach(stop => stop())
  }, [demo, companyId])
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      if (!demo) await callServer('appSaveSettings', { ...form, companyId })
      setNotice(demo ? 'Configuração de demonstração alterada nesta tela. Nenhuma loja real foi aberta.' : 'Configurações salvas. Os próximos pedidos usarão estes horários e valores.')
      if (!demo) setReady(await callServer('appReadiness', { companyId }))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  function slot(day, index, key, value) { setForm(current => ({ ...current, hours: current.hours.map((slots,d) => d !== day ? slots : slots.map((slot,i) => i === index ? { ...slot, [key]: value } : slot)) })) }
  function zone(index,key,value) { setForm(current => ({ ...current, zones: current.zones.map((zone,i) => i === index ? { ...zone, [key]: value } : zone) })) }
  const checks = ready ? [['Configuração da empresa', ready.restaurantConfigured], ['Proteção App Check', ready.appCheck], ['Credenciais do pagamento', ready.paymentSecrets], ['Conta recebedora conferida', ready.receiverVerified], ['Endereço público do app', ready.publicUrlConfigured], ['Operação real liberada', ready.liveEnabled && ready.environment === 'production'], ['Backup concluído', backup?.state === 'succeeded']] : []
  return <div className="store-settings">
    <section className="company-panel"><h2>Preparação da loja</h2><p>{demo ? 'Veja os campos que a empresa terá para configurar a operação. Preencha os dados reais na sua área administrativa.' : 'Confira os serviços antes de abrir a loja. Os valores de acesso ao pagamento são configurados no servidor.'}</p>{checks.length > 0 && <ul className="readiness-list">{checks.map(([name,ok]) => <li key={name}><span>{name}</span><b className={ok ? 'ready' : 'pending'}>{ok ? 'Conferido' : 'Pendente'}</b></li>)}</ul>}{ready && <p>Ambiente: <b>{ready.environment === 'production' ? 'produção' : ready.environment === 'test' ? 'teste' : 'desativado'}</b></p>}{!demo && <button className="company-button secondary" disabled={busy} onClick={refresh}>Conferir serviços novamente</button>}</section>
    {error && <p className="company-alert" role="alert">{error}</p>}{notice && <p className="company-notice" role="status">{notice}</p>}
    <form className="company-panel settings-form" onSubmit={save}>
      <h2>Dados e atendimento</h2>
      <div className="settings-grid">{[['name','Nome da empresa'],['legalName','Nome do responsável legal'],['document','CPF/CNPJ da empresa (quando aplicável)'],['phone','Telefone de atendimento'],['privacyEmail','E-mail de privacidade']].map(([name,label]) => <label key={name}>{label}<input name={name} value={form[name]} onChange={change} type={name === 'privacyEmail' ? 'email' : 'text'} maxLength={name === 'privacyEmail' ? 254 : 160} required={name !== 'document'} /></label>)}</div>
      <h3>Endereço da empresa</h3><AddressFields data={form.address} onChange={addressChange} />
      <div className="settings-grid">{[['endereco','Rua'],['numero','Número'],['bairro','Bairro'],['complemento','Complemento']].map(([name,label]) => <label key={name}>{label}<input name={name} value={form.address[name]} onChange={addressChange} maxLength={180} required={name !== 'complemento'} /></label>)}</div>
      <h3>Horários de recebimento de pedidos</h3><label>Fuso horário<select name="timezone" value={form.timezone} onChange={change}>{['America/Sao_Paulo','America/Manaus','America/Rio_Branco','America/Noronha','America/Cuiaba'].map(zone => <option key={zone}>{zone}</option>)}</select></label>
      <p className="muted">Sem intervalos significa fechado. Para atender após a meia-noite, adicione outro intervalo no dia seguinte.</p>
      {days.map((day,d) => <div key={day} className="hours-row"><b>{day}</b>{form.hours[d].map((period,i) => <div key={i} className="hours-period"><input aria-label={day + ' abertura'} type="time" required value={clock(period.start)} onChange={event => slot(d,i,'start',minutes(event.target.value))} /><span>até</span><input aria-label={day + ' fechamento'} type="time" required value={period.end === 1440 ? '23:59' : clock(period.end)} onChange={event => slot(d,i,'end',event.target.value === '23:59' ? 1440 : minutes(event.target.value))} /><button type="button" className="company-button subtle" aria-label={'Remover intervalo de ' + day} onClick={() => setForm(current => ({ ...current, hours: current.hours.map((slots,n) => n !== d ? slots : slots.filter((_,j) => j !== i)) }))}>×</button></div>)}{form.hours[d].length < 3 && <button className="company-button subtle" type="button" onClick={() => setForm(current => ({ ...current, hours: current.hours.map((slots,n) => n === d ? [...slots,{ start: 1080, end: 1380 }] : slots) }))}>+ Intervalo</button>}</div>)}
      <h3>Bairros atendidos</h3><p>As entregas ficam limitadas à cidade e ao estado da empresa. Cadastre cada bairro, inclusive quando a taxa for zero.</p>
      {form.zones.map((item,i) => <div className="zone-row" key={i}><label>Bairro<input value={item.bairro} onChange={event => zone(i,'bairro',event.target.value)} maxLength={100} required /></label>{[['fee','Taxa (R$)'],['min','Pedido mínimo (R$)'],['freeAbove','Grátis a partir de (R$)']].map(([key,label]) => <label key={key}>{label}<input type="number" min="0" step="0.01" value={item[key]} onChange={event => zone(i,key,event.target.value)} required={key === 'fee'} placeholder={key === 'freeAbove' ? 'Não oferecer' : '0,00'} /></label>)}<button type="button" className="company-button subtle" disabled={form.zones.length === 1} onClick={() => setForm(current => ({ ...current, zones: current.zones.filter((_,n) => n !== i) }))}>Remover bairro</button></div>)}
      <button className="company-button secondary" type="button" disabled={form.zones.length >= 100} onClick={() => setForm(current => ({ ...current, zones: [...current.zones,{ bairro: '', fee: '', min: '', freeAbove: '' }] }))}>+ Bairro</button>
      <h3>Pagamentos e operação</h3>{[['pix','Pix online'],['cartao_online','Cartão online'],['maquina_entrega','Maquininha na entrega']].map(([method,label]) => <label className="company-checkbox" key={method}><input type="checkbox" checked={form.methods.includes(method)} onChange={event => setForm(current => ({ ...current, methods: event.target.checked ? [...current.methods,method] : current.methods.filter(m => m !== method) }))} />{label}</label>)}
      <div className="settings-grid"><label>Previsão de entrega (minutos)<input type="number" name="estimateMinutes" min="10" max="240" value={form.estimateMinutes} onChange={change} required /></label><label>Retenção operacional dos dados de entrega (dias)<input name="retentionDays" type="number" min="30" max="3650" value={form.retentionDays} onChange={change} required /></label></div><p className="muted">Defina a retenção conforme a operação e as obrigações da empresa. Transações e pendências financeiras têm tratamento separado.</p>
      <label className="company-checkbox"><input name="acceptingOrders" type="checkbox" checked={form.acceptingOrders} onChange={change} />Receber pedidos nos horários configurados</label>
      <button className="company-button primary" disabled={busy} type="submit">{busy ? 'Salvando…' : 'Salvar configurações'}</button>
    </form>
    {!demo && companyId === DEFAULT_COMPANY_ID && <section className="company-panel"><h2>Ocorrências operacionais</h2>{!alerts.length ? <p>Nenhuma ocorrência registrada.</p> : alerts.map(alert => <div className="operation-row" key={alert.id}><p><b>Pedido #{alert.orderId?.slice(-8)}</b><br />{alert.kind} · {alert.code}</p><button className="company-button secondary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await callServer('appRetryPayment',{ orderId: alert.orderId }); setNotice('Consulta realizada. Acompanhe o status do pedido; a devolução precisa da confirmação do provedor.') } catch (err) { setError(err.message) } finally { setBusy(false) } }}>Reconsultar pagamento</button></div>)}</section>}
    {!demo && companyId === DEFAULT_COMPANY_ID && <section className="company-panel"><h2>Solicitações de privacidade</h2>{!requests.length ? <p>Nenhuma solicitação pendente.</p> : requests.map(request => <p key={request.id}>Conta {request.userId.slice(-8)} · {({ pendente: 'Exclusão em processamento', aguardando_pedidos: 'Aguardando concluir pedidos ou devoluções', transferir_administracao: 'Transfira a administração antes de encerrar esta conta' })[request.status] || request.status}</p>)}</section>}
  </div>
}
