import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import {
  listAuditEvents, listPlatformRestaurants, setRestaurantAccountStatus,
} from '../services/marketplace.js'

const LABEL = {
  active: 'Ativa',
  suspended: 'Suspensa',
  blocked: 'Bloqueada',
}

export default function PlatformCompanies() {
  const [companies, setCompanies] = useState([])
  const [audit, setAudit] = useState([])
  const [selected, setSelected] = useState(null)
  const [reason, setReason] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [rows, events] = await Promise.all([
        listPlatformRestaurants(),
        listAuditEvents({ limit: 80 }),
      ])
      setCompanies(rows)
      setAudit(events)
      if (selected) {
        const current = rows.find(item => item.slug === selected.slug)
        if (current) setSelected(current)
      }
    } catch (err) {
      setError(err.message || 'Não foi possível carregar a administração de empresas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return companies
    return companies.filter(item => [item.name, item.slug, item.account_status].some(value => String(value || '').toLowerCase().includes(needle)))
  }, [companies, search])

  async function moderate(nextStatus) {
    if (!selected || busy) return
    if (nextStatus !== 'active' && reason.trim().length < 3) {
      setError('Informe o motivo da suspensão ou bloqueio.')
      return
    }

    setBusy(true); setError(''); setNotice('')
    try {
      await setRestaurantAccountStatus(selected.slug, nextStatus, reason.trim())
      setNotice(nextStatus === 'active'
        ? 'Empresa reativada. Ela continua fechada até o responsável habilitar novos pedidos nas configurações.'
        : nextStatus === 'blocked'
          ? 'Empresa bloqueada. A loja foi retirada da busca e novos pedidos foram impedidos.'
          : 'Empresa suspensa. Novos pedidos foram pausados.')
      setReason('')
      await load()
    } catch (err) {
      setError(err.message || 'Não foi possível alterar o status da empresa.')
    } finally {
      setBusy(false)
    }
  }

  return <AppScreen>
    <TopBar titulo="Administração de empresas" />
    <div className="page-heading">
      <span className="eyebrow">ADMINISTRAÇÃO PRATOPRONTO</span>
      <h1>Empresas da plataforma</h1>
      <p>Controle suspensões e bloqueios sem apagar histórico de pedidos, equipe ou auditoria.</p>
    </div>

    <section className="light-card">
      <label htmlFor="platform-company-search">Buscar empresa</label>
      <input id="platform-company-search" value={search} onChange={event => setSearch(event.target.value)}
        placeholder="Nome, identificador ou status..." />
      {error && <p className="form-error dark-error" role="alert">{error}</p>}
      {notice && <p className="success-note" role="status">{notice}</p>}
    </section>

    <section className="marketplace-results">
      {loading && <div className="light-card">Carregando empresas…</div>}
      {!loading && filtered.map(company =>
        <article className="light-card" key={company.restaurant_id}>
          <div className="section-heading">
            <div><strong>{company.name}</strong><small>/{company.slug}</small></div>
            <span>{LABEL[company.account_status] || company.account_status}</span>
          </div>
          <p>{company.open && company.account_status === 'active' ? 'Loja recebendo pedidos.' : 'Loja sem receber novos pedidos.'}</p>
          {company.blocked_reason && <p className="form-error dark-error">{company.blocked_reason}</p>}
          <button className="btn btn-secondary" type="button" onClick={() => { setSelected(company); setReason(''); setError('') }}>
            Gerenciar empresa
          </button>
        </article>
      )}
      {!loading && !filtered.length && <div className="light-card"><h2>Nenhuma empresa encontrada</h2></div>}
    </section>

    {selected && <section className="light-card">
      <div className="section-heading">
        <div><h2>{selected.name}</h2><small>/{selected.slug}</small></div>
        <button className="btn btn-secondary" type="button" onClick={() => setSelected(null)}>Fechar</button>
      </div>
      <p><b>Status:</b> {LABEL[selected.account_status] || selected.account_status}</p>
      {selected.blocked_reason && <p><b>Motivo atual:</b> {selected.blocked_reason}</p>}
      <label htmlFor="company-moderation-reason">Motivo da suspensão/bloqueio</label>
      <textarea id="company-moderation-reason" maxLength={500} value={reason} onChange={event => setReason(event.target.value)}
        placeholder="Registre o motivo para auditoria e suporte." />
      <div className="inline-actions">
        {selected.account_status !== 'suspended' && <button className="btn btn-secondary" disabled={busy} type="button" onClick={() => moderate('suspended')}>Suspender</button>}
        {selected.account_status !== 'blocked' && <button className="btn btn-secondary" disabled={busy} type="button" onClick={() => moderate('blocked')}>Bloquear</button>}
        {selected.account_status !== 'active' && <button className="btn btn-primary" disabled={busy} type="button" onClick={() => moderate('active')}>Reativar</button>}
      </div>
    </section>}

    <section className="light-card">
      <div className="section-heading"><h2>Auditoria recente</h2><button type="button" className="btn btn-secondary" onClick={load}>Atualizar</button></div>
      {!audit.length ? <p>Nenhum evento registrado ainda.</p> : audit.slice(0, 40).map(event =>
        <p key={event.id}>
          <b>{event.action}</b> · {event.target_type} {event.target_id ? '#' + event.target_id.slice(-8) : ''}
          <br /><small>{new Date(event.created_at).toLocaleString('pt-BR')}</small>
        </p>
      )}
    </section>

    <div className="light-card">
      <div className="inline-actions">
        <Link className="btn btn-secondary" to="/plataforma/pilotos">Analisar pilotos</Link>
        <Link className="btn btn-secondary" to="/perfil">Voltar ao perfil</Link>
      </div>
    </div>
  </AppScreen>
}
