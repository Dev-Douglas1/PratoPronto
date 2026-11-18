import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { callServer } from '../services/server.js'

const money = cents => cents == null ? 'Não definido' : (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const emptyPlan = {code:'',name:'',description:'',price:'',products:'20',members:'2',orders:'100',active:true,public:true}
const numOrNull = value => value === '' ? null : Number(value)
export default function PlatformSubscriptions() {
  const [plans,setPlans]=useState([])
  const [companies,setCompanies]=useState([])
  const [form,setForm]=useState(emptyPlan)
  const [assign,setAssign]=useState({})
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function load() {
    setLoading(true);setError('')
    try {
      const [p,c]=await Promise.all([callServer('appAdminPlans'),callServer('appAdminSubscriptions')])
      setPlans(p||[]);setCompanies(c||[])
    } catch(err){setError(err.message||'Não foi possível carregar assinaturas.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[])
  async function savePlan(event) {
    event.preventDefault();setBusy(true);setError('');setNotice('')
    try {
      await callServer('appSavePlan',{
        code:form.code.trim().toLowerCase(),name:form.name.trim(),description:form.description,
        monthlyPriceCents:form.price===''?null:Math.round(Number(form.price)*100),
        productLimit:numOrNull(form.products),memberLimit:numOrNull(form.members),monthlyOrderLimit:numOrNull(form.orders),
        active:form.active,public:form.public,
      })
      setNotice('Plano salvo.');setForm(emptyPlan);await load()
    } catch(err){setError(err.message||'Não foi possível salvar o plano.')}
    finally{setBusy(false)}
  }
  async function assignPlan(restaurantId) {
    const choice=assign[restaurantId]
    if(!choice?.planCode){setError('Selecione um plano para a empresa.');return}
    setBusy(true);setError('');setNotice('')
    try {
      const periodEnd=choice.periodEnd?new Date(choice.periodEnd+'T23:59:59').toISOString():null
      const result=await callServer('appAssignPlan',{restaurantId,planCode:choice.planCode,periodEnd})
      setNotice(result.status==='pending_payment'?'Plano pago registrado como aguardando pagamento. Nenhuma cobrança foi realizada.':'Plano gratuito ativado para a empresa.')
      await load()
    } catch(err){setError(err.message||'Não foi possível atualizar a assinatura.')}
    finally{setBusy(false)}
  }
  return <AppScreen>
    <TopBar titulo="Planos e assinaturas" />
    <div className="page-heading"><span className="eyebrow">ADMINISTRAÇÃO PRATOPRONTO</span><h1>Planos e assinaturas</h1><p>Configure limites e atribua planos às empresas. A cobrança automática ainda não está conectada.</p></div>
    {error&&<p className="form-error dark-error" role="alert">{error}</p>}
    {notice&&<p className="success-note" role="status">{notice}</p>}
    <section className="light-card">
      <h2>Planos cadastrados</h2>
      {loading&&<p>Carregando…</p>}
      {!loading&&plans.map(plan=><article className="company-request-card" key={plan.id}>
        <div className="section-heading"><strong>{plan.name} · {plan.code}</strong><span>{plan.is_active?'Ativo':'Inativo'} · {plan.is_public?'Público':'Privado'}</span></div>
        <p>{plan.description}</p><p><b>Preço mensal:</b> {money(plan.monthly_price_cents)}</p>
        <p><b>Limites:</b> {plan.product_limit??'Ilimitado'} produtos · {plan.member_limit??'Ilimitado'} membros · {plan.monthly_order_limit??'Ilimitado'} pedidos/mês</p>
        <button className="btn btn-secondary" type="button" onClick={()=>setForm({code:plan.code,name:plan.name,description:plan.description,price:plan.monthly_price_cents==null?'':String(plan.monthly_price_cents/100),products:plan.product_limit??'',members:plan.member_limit??'',orders:plan.monthly_order_limit??'',active:plan.is_active,public:plan.is_public})}>Editar plano</button>
      </article>)}
    </section>
    <form className="light-card" onSubmit={savePlan}>
      <h2>Criar ou editar plano</h2>
      <div className="settings-grid">
        <label>Código único<input required pattern="[a-z0-9][a-z0-9_-]{1,39}" maxLength={40} value={form.code} onChange={e=>setForm(v=>({...v,code:e.target.value}))} /></label>
        <label>Nome<input required minLength={2} maxLength={80} value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} /></label>
        <label>Preço mensal em reais<input type="number" min="0" step="0.01" placeholder="Vazio = não definido" value={form.price} onChange={e=>setForm(v=>({...v,price:e.target.value}))} /></label>
        <label>Limite de produtos<input type="number" min="0" placeholder="Vazio = ilimitado" value={form.products} onChange={e=>setForm(v=>({...v,products:e.target.value}))} /></label>
        <label>Limite de membros ativos<input type="number" min="1" placeholder="Vazio = ilimitado" value={form.members} onChange={e=>setForm(v=>({...v,members:e.target.value}))} /></label>
        <label>Pedidos por mês<input type="number" min="0" placeholder="Vazio = ilimitado" value={form.orders} onChange={e=>setForm(v=>({...v,orders:e.target.value}))} /></label>
      </div>
      <label>Descrição<textarea maxLength={500} value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))}/></label>
      <label className="checkbox-line"><input type="checkbox" checked={form.active} onChange={e=>setForm(v=>({...v,active:e.target.checked}))}/>Plano ativo</label>
      <label className="checkbox-line"><input type="checkbox" checked={form.public} onChange={e=>setForm(v=>({...v,public:e.target.checked}))}/>Exibir publicamente</label>
      <button className="btn btn-primary" disabled={busy}>{busy?'Salvando…':'Salvar plano'}</button>
    </form>
    <section className="light-card">
      <h2>Assinaturas das empresas</h2>
      {companies.map(company=><article className="company-request-card" key={company.restaurant_id}>
        <div className="section-heading"><strong>{company.restaurant_name}</strong><span>{company.status||'Sem assinatura'}</span></div>
        <p>/{company.restaurant_slug} · Plano atual: {company.plan_name||'Não definido'} · Vencimento: {company.period_end?new Date(company.period_end).toLocaleDateString('pt-BR'):'Sem vencimento'}</p>
        <div className="settings-grid">
          <label>Plano<select value={assign[company.restaurant_id]?.planCode||'gratuito'} onChange={e=>setAssign(v=>({...v,[company.restaurant_id]:{...v[company.restaurant_id],planCode:e.target.value}}))}>{plans.filter(p=>p.is_active).map(p=><option key={p.code} value={p.code}>{p.name} · {money(p.monthly_price_cents)}</option>)}</select></label>
          <label>Fim do período (opcional)<input type="date" value={assign[company.restaurant_id]?.periodEnd||''} onChange={e=>setAssign(v=>({...v,[company.restaurant_id]:{...v[company.restaurant_id],periodEnd:e.target.value}}))}/></label>
        </div>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>assignPlan(company.restaurant_id)}>Aplicar plano</button>
      </article>)}
      {!companies.length&&!loading&&<p>Nenhuma empresa cadastrada.</p>}
    </section>
    <div className="light-card"><Link className="btn btn-secondary" to="/plataforma/empresas">Voltar à administração de empresas</Link></div>
  </AppScreen>
}
