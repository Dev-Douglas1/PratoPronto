import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { createCompany, uploadCompanyRegistrationDocument, getMyCompanyRegistrationRequest } from '../services/marketplace.js'

export default function CompanyOnboarding() {
  const navigate = useNavigate()
  const [cnpj, setCnpj] = useState('')
  const [legalName, setLegalName] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [files, setFiles] = useState({ cnpj_card: null, identity: null, proof_of_address: null })
  const [currentRequest, setCurrentRequest] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    getMyCompanyRegistrationRequest().then(row => { if (active) { setCurrentRequest(row); if (row?.status === 'pending') setRequestId(row.id) } }).catch(() => {}).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) { setError('Informe um CNPJ com 14 números.'); return }
    if (legalName.trim().length < 2 || name.trim().length < 2) { setError('Preencha a razão social e o nome fantasia.'); return }
    if (phone.replace(/\D/g, '').length < 10) { setError('Informe um telefone com DDD.'); return }
    setBusy(true); setError('')
    try {
      let id = requestId
      if (!id) { const result = await createCompany({ cnpj: digits, legalName: legalName.trim(), name: name.trim(), phone }); id = result?.requestId || result?.request_id || result?.id || '' }
      if (!id) throw new Error('Solicitação criada, mas não foi possível identificar seu protocolo. Atualize a página antes de reenviar.')
      setRequestId(id)
      for (const kind of ['cnpj_card','identity','proof_of_address']) { if (files[kind]) await uploadCompanyRegistrationDocument(id,kind,files[kind]) }
      setSent(true)
    } catch (err) { setError(err.message || 'Não foi possível enviar a solicitação.') }
    finally { setBusy(false) }
  }

  return <AppScreen>
    <TopBar titulo="Cadastro de empresa" />
    <div className="page-heading"><span className="eyebrow">PRATOPRONTO PARA EMPRESAS</span><h1>Solicitar cadastro empresarial</h1><p>O cadastro é vinculado à sua conta pessoal. A loja só será criada depois da análise da equipe PratoPronto.</p></div>
    {checking && <section className="light-card">Consultando suas solicitações…</section>}
    {currentRequest && <section className="light-card" aria-live="polite"><h2>Acompanhamento da solicitação</h2><p><b>Protocolo:</b> {currentRequest.id}</p><p><b>Status:</b> {({pending:'Em análise',approved:'Aprovada',rejected:'Rejeitada'})[currentRequest.status] || currentRequest.status}</p>{currentRequest.review_note && <p><b>Retorno da análise:</b> {currentRequest.review_note}</p>}{currentRequest.status === 'pending' && <p>Se a equipe solicitar correções, você poderá reenviar documentos nesta tela.</p>}</section>}
    {sent ? <section className="light-card" role="status">
      <h2>Solicitação enviada</h2>
      <p>Seu pedido está pendente de análise. Os documentos obrigatórios foram enviados com acesso privado. Protocolo: {requestId}</p>
      <button className="btn btn-primary wide-button" type="button" onClick={() => navigate('/perfil', { replace: true })}>Voltar ao perfil</button>
    </section> : <form className="light-card" onSubmit={submit}>
      <label htmlFor="company-cnpj">CNPJ<input id="company-cnpj" required inputMode="numeric" autoComplete="off" maxLength={18} value={cnpj} onChange={event => setCnpj(event.target.value.replace(/[^0-9./-]/g, '').slice(0,18))} placeholder="00.000.000/0000-00" /></label>
      <label htmlFor="company-legal-name">Razão social<input id="company-legal-name" required minLength={2} maxLength={160} autoComplete="organization" value={legalName} onChange={event => setLegalName(event.target.value)} /></label>
      <label htmlFor="company-trade-name">Nome fantasia<input id="company-trade-name" required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      <label htmlFor="company-contact-phone">Telefone de contato<input id="company-contact-phone" required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={phone} onChange={event => setPhone(event.target.value)} placeholder="(41) 99999-9999" /></label>
      <h2>Documentos obrigatórios</h2>
      <p className="form-hint">Envie arquivos legíveis em PDF, JPG, PNG ou WEBP, com até 5 MB cada. Os documentos ficam privados e só podem ser consultados pelo titular e pela administração autorizada.</p>
      {[['cnpj_card','Comprovante de inscrição e situação cadastral do CNPJ'],['identity','Documento de identidade do responsável'],['proof_of_address','Comprovante de endereço da empresa']].map(([kind,label]) => <label key={kind}>{label}<input type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={event => setFiles(current => ({...current,[kind]:event.target.files?.[0] || null}))} /></label>)}
      <p className="form-hint">Apenas informar o CNPJ não comprova vínculo com a empresa. A aprovação depende da conferência documental.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary wide-button" disabled={busy || (!requestId && Object.values(files).some(file => !file))}>{busy ? 'Enviando solicitação e documentos…' : requestId ? 'Concluir envio dos documentos' : 'Enviar solicitação e documentos'}</button>
    </form>}
  </AppScreen>
}
