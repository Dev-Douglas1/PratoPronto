import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import {
  listPilotApplications, listPilotDocumentCleanupQueue, pilotDocumentUrl, processPilotDocumentCleanup,
  reviewPilotApplication, setPilotAccountStatus,
} from '../services/marketplace.js'

const STATUS_LABEL = {
  pending: 'Pendentes',
  approved: 'Aprovados',
  rejected: 'Reprovados',
}

export default function PilotReview() {
  const [status, setStatus] = useState('pending')
  const [applications, setApplications] = useState([])
  const [selected, setSelected] = useState(null)
  const [documents, setDocuments] = useState({})
  const [reason, setReason] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cleanupQueue, setCleanupQueue] = useState([])

  async function load(nextStatus = status) {
    setLoading(true); setError('')
    try {
      const [values, queue] = await Promise.all([
        listPilotApplications(nextStatus),
        listPilotDocumentCleanupQueue(),
      ])
      setApplications(values)
      setCleanupQueue(queue)
      if (selected && !values.some(item => item.profile_id === selected.profile_id)) {
        setSelected(null); setDocuments({})
      }
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os cadastros de pilotos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(status) }, [status])

  const selectedApplication = useMemo(
    () => applications.find(item => item.profile_id === selected?.profile_id) || selected,
    [applications, selected],
  )

  async function open(application) {
    setSelected(application); setDocuments({}); setReason(''); setBlockReason(''); setError('')
    try {
      const pairs = await Promise.all([
        ['Foto do piloto', application.profile_photo_path],
        ['Foto da moto', application.motorcycle_photo_path],
        ['CNH — frente', application.cnh_front_path],
        ['CNH — verso', application.cnh_back_path],
      ].map(async ([label, path]) => [label, await pilotDocumentUrl(path)]))
      setDocuments(Object.fromEntries(pairs))
    } catch (err) {
      setError(err.message || 'Não foi possível abrir os documentos privados.')
    }
  }

  async function decide(approve) {
    if (!selectedApplication || busy) return
    if (!approve && reason.trim().length < 3) {
      setError('Informe o motivo da reprovação.')
      return
    }
    setBusy(true); setError(''); setNotice('')
    try {
      await reviewPilotApplication(selectedApplication.profile_id, approve, reason.trim())
      setNotice(approve ? 'Piloto aprovado e liberado para receber ofertas.' : 'Cadastro reprovado. O piloto poderá corrigir e reenviar.')
      setSelected(null); setDocuments({}); setReason('')
      await load(status)
    } catch (err) {
      setError(err.message || 'Não foi possível concluir a análise.')
    } finally {
      setBusy(false)
    }
  }


  async function moderate(nextStatus) {
    if (!selectedApplication || busy) return
    if (nextStatus !== 'active' && blockReason.trim().length < 3) {
      setError('Informe o motivo da suspensão ou bloqueio.')
      return
    }
    setBusy(true); setError(''); setNotice('')
    try {
      await setPilotAccountStatus(selectedApplication.profile_id, nextStatus, blockReason.trim())
      setNotice(nextStatus === 'active' ? 'Acesso operacional do piloto reativado.' : nextStatus === 'blocked' ? 'Piloto bloqueado. Novas ofertas e entregas ficaram impedidas.' : 'Piloto suspenso temporariamente.')
      setBlockReason('')
      await load(status)
    } catch (err) {
      setError(err.message || 'Não foi possível alterar o acesso do piloto.')
    } finally {
      setBusy(false)
    }
  }

  async function processCleanup() {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await processPilotDocumentCleanup()
      setNotice(`Retenção processada: ${result.done || 0} removidos, ${result.skipped || 0} preservados, ${result.failed || 0} falhas.`)
      await load(status)
    } catch (err) {
      setError(err.message || 'Não foi possível processar a retenção de documentos.')
    } finally {
      setBusy(false)
    }
  }

  return <AppScreen>
    <TopBar titulo="Análise de pilotos" />
    <div className="page-heading">
      <span className="eyebrow">ADMINISTRAÇÃO PRATOPRONTO</span>
      <h1>Pilotos Parceiros</h1>
      <p>Revise cadastro, moto e documentação antes de liberar ofertas de entrega.</p>
    </div>

    <div className="light-card">
      <div className="inline-actions">
        {Object.entries(STATUS_LABEL).map(([id, label]) =>
          <button key={id} type="button" className={status === id ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => { setStatus(id); setSelected(null); setDocuments({}) }}>
            {label}
          </button>
        )}
      </div>
      <div className="inline-actions">
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={processCleanup}>Processar retenção de documentos</button>
        <small>{cleanupQueue.filter(item => item.status === 'pending').length} itens pendentes · {cleanupQueue.filter(item => item.status === 'failed').length} com falha</small>
      </div>
      {error && <p className="form-error dark-error" role="alert">{error}</p>}
      {notice && <p className="success-note" role="status">{notice}</p>}
    </div>

    <section className="marketplace-results">
      {loading && <div className="light-card">Carregando cadastros…</div>}
      {!loading && applications.map(application =>
        <article className="light-card" key={application.profile_id}>
          <strong>{application.display_name}</strong>
          <p>{application.city} · {application.motorcycle_type} · {application.vehicle_color}</p>
          <small>Placa: {application.vehicle_plate} · CNH {application.cnh_category} · validade {application.cnh_expiry || '—'} · acesso {application.account_status || 'active'}</small>
          <div className="inline-actions">
            <button className="btn btn-secondary" type="button" onClick={() => open(application)}>Analisar documentos</button>
          </div>
        </article>
      )}
      {!loading && !applications.length && <div className="light-card"><h2>Nenhum cadastro</h2><p>Não há pilotos nesta situação.</p></div>}
    </section>

    {selectedApplication && <section className="light-card">
      <div className="section-heading"><h2>{selectedApplication.display_name}</h2><button className="btn btn-secondary" type="button" onClick={() => setSelected(null)}>Fechar</button></div>
      <p><b>E-mail:</b> {selectedApplication.email}<br /><b>Telefone:</b> {selectedApplication.telefone}<br /><b>Cidade:</b> {selectedApplication.city}</p>
      <p><b>Moto:</b> {selectedApplication.motorcycle_type} · {selectedApplication.vehicle_color}<br /><b>Placa:</b> {selectedApplication.vehicle_plate}<br /><b>CNH:</b> categoria {selectedApplication.cnh_category}, válida até {selectedApplication.cnh_expiry}</p>

      <p><b>Status operacional:</b> {selectedApplication.account_status === 'blocked' ? 'Bloqueado' : selectedApplication.account_status === 'suspended' ? 'Suspenso' : 'Ativo'}</p>
      {selectedApplication.blocked_reason && <p className="form-error dark-error"><b>Motivo operacional:</b> {selectedApplication.blocked_reason}</p>}

      <div className="marketplace-company-grid">
        {Object.entries(documents).map(([label, url]) =>
          <a key={label} className="light-card marketplace-company-card" href={url} target="_blank" rel="noreferrer">
            <strong>{label}</strong><small>Abrir arquivo privado ↗</small>
          </a>
        )}
      </div>

      {status === 'pending' && <>
        <label htmlFor="pilot-review-reason">Motivo caso seja necessário reprovar</label>
        <textarea id="pilot-review-reason" maxLength={500} value={reason} onChange={event => setReason(event.target.value)}
          placeholder="Ex.: foto da CNH ilegível ou placa diferente da foto da moto." />
        <div className="inline-actions">
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => decide(false)}>Reprovar e pedir correção</button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => decide(true)}>{busy ? 'Salvando…' : 'Aprovar Piloto Parceiro'}</button>
        </div>
      </>}
      {selectedApplication.rejection_reason && <p className="form-error dark-error"><b>Motivo registrado:</b> {selectedApplication.rejection_reason}</p>}

      <hr />
      <h3>Controle operacional</h3>
      <p>Suspender ou bloquear impede novas ofertas e ações de entrega. A documentação permanece preservada para análise e auditoria.</p>
      <label htmlFor="pilot-block-reason">Motivo da suspensão/bloqueio</label>
      <textarea id="pilot-block-reason" maxLength={500} value={blockReason} onChange={event => setBlockReason(event.target.value)}
        placeholder="Descreva o motivo para manter uma trilha clara da decisão." />
      <div className="inline-actions">
        {selectedApplication.account_status !== 'suspended' && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => moderate('suspended')}>Suspender</button>}
        {selectedApplication.account_status !== 'blocked' && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => moderate('blocked')}>Bloquear</button>}
        {selectedApplication.account_status !== 'active' && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => moderate('active')}>Reativar acesso</button>}
      </div>
    </section>}

    <div className="light-card">
      <Link className="btn btn-secondary" to="/perfil">Voltar ao perfil</Link>
    </div>
  </AppScreen>
}
