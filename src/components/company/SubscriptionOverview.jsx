import { useEffect, useState } from 'react'
import { callServer } from '../../services/server.js'

const money = cents => cents == null ? 'Preço não definido' : cents === 0 ? 'Gratuito' : (cents / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) + '/mês'
const statusLabel = status => ({active:'Ativa',trialing:'Período de teste',pending_payment:'Aguardando pagamento',past_due:'Pagamento pendente',canceled:'Cancelada',expired:'Expirada',missing:'Não encontrada'})[status] || status || 'Indefinida'
function Usage({label,value,limit}) {
  const unlimited = limit == null
  const percent = unlimited ? 0 : Math.min(100,Math.round(value / Math.max(1,limit) * 100))
  return <div className="subscription-usage">
    <div><span>{label}</span><b>{value}{unlimited ? ' / sem limite' : ' / ' + limit}</b></div>
    {!unlimited && <div className="subscription-meter" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax={limit} aria-valuenow={Math.min(value,limit)}><i style={{width:percent+'%'}} /></div>}
  </div>
}
export default function SubscriptionOverview({companyId}) {
  const [data,setData]=useState(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  useEffect(()=>{
    let alive=true
    setLoading(true);setError('')
    callServer('appSubscription',{companyId}).then(value=>{if(alive)setData(value)}).catch(err=>{if(alive)setError(err.message||'Não foi possível consultar a assinatura.')}).finally(()=>{if(alive)setLoading(false)})
    return ()=>{alive=false}
  },[companyId])
  return <section className="company-panel subscription-overview">
    <h2>Plano e assinatura</h2>
    {loading && <p>Consultando plano e utilização…</p>}
    {error && <p className="company-alert" role="alert">{error}</p>}
    {!loading && data && <>
      <div className="subscription-plan-heading"><div><strong>{data.plan?.name || 'Plano não definido'}</strong><small>{data.plan?.description}</small></div><span className={'subscription-status '+(data.entitled?'is-active':'is-blocked')}>{statusLabel(data.status)}</span></div>
      <p className="subscription-price">{money(data.plan?.monthlyPriceCents)}</p>
      {data.periodEnd && <p className="muted">Período atual até {new Date(data.periodEnd).toLocaleDateString('pt-BR')}{data.cancelAtPeriodEnd ? ' · cancelamento programado' : ''}</p>}
      <div className="subscription-usage-grid">
        <Usage label="Produtos cadastrados" value={Number(data.usage?.products||0)} limit={data.plan?.productLimit}/>
        <Usage label="Membros ativos" value={Number(data.usage?.members||0)} limit={data.plan?.memberLimit}/>
        <Usage label="Pedidos neste mês" value={Number(data.usage?.monthlyOrders||0)} limit={data.plan?.monthlyOrderLimit}/>
      </div>
      {!data.entitled && <p className="company-alert">A assinatura não está liberada. Novos cadastros e pedidos podem ser bloqueados até a regularização.</p>}
      {data.status==='pending_payment' && <p className="muted">O plano pago foi solicitado, mas ainda não há integração de cobrança ativa. Não foi realizada cobrança.</p>}
    </>}
  </section>
}
