import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { createCompany, uploadCompanyRegistrationDocument, getMyCompanyRegistrationRequest } from '../services/marketplace.js'

function onlyDigits(value) {
  return String(value || '').replace(/\\D/g, '')
}

function validCpf(value) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(.)\\1{10}$/.test(cpf)) return false
  let sum = 0
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i)
  let digit = (sum * 10) % 11
  if (digit === 10) digit = 0
  if (digit !== Number(cpf[9])) return false
  sum = 0
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i)
  digit = (sum * 10) % 11
  if (digit === 10) digit = 0
  return digit === Number(cpf[10])
}

const STATUS = { pending: 'Em análise', approved: 'Aprovada', rejected: 'Rejeitada' }
const ACCEPTED_FILES = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'

export default function CompanyOnboarding() {
  const navigate = useNavigate()
  const [personType, setPersonType] = useState('pj')
  const [cnpj, setCnpj] = useState('')
  const [cpf, setCpf] = useState('')
  const [legalName, setLegalName] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [files, setFiles] = useState({ fiscal_document: null, identity: null, proof_of_address: null })
  const [currentRequest, setCurrentRequest] = useState(null)
  const [checking, setChecking] = useState(true)

  const fiscalDocumentType = personType === 'pf' ? 'cpf_card' : 'cnpj_card'
  const fiscalDocumentLabel = personType === 'pf'
    ? 'Comprovante de situação cadastral do CPF'
    : 'Comprovante de inscrição e situação cadastral do CNPJ'

  useEffect(() => {
    let active = true
    getMyCompanyRegistrationRequest()
      .then(row => {
        if (!active || !row) return
        setCurrentRequest(row)
        if (row.status === 'pending') {
          setRequestId(row.id)
          setPersonType(row.person_type || 'pj')
          setCnpj(row.cnpj || '')
          setCpf(row.cpf || '')
          setLegalName(row.legal_name || '')
          setName(row.trade_name || '')
          setPhone(row.contact_phone || '')
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (busy) return

    const fiscalDigits = personType === 'pf' ? onlyDigits(cpf) : onlyDigits(cnpj)
    if (personType === 'pf' && !validCpf(fiscalDigits)) {
      setError('Informe um CPF válido com 11 números.')
      return
    }
    if (personType === 'pj' && fiscalDigits.length !== 14) {
      setError('Informe um CNPJ com 14 números.')
      return
    }
    if (legalName.trim().length < 2 || name.trim().length < 2) {
      setError(personType === 'pf' ? 'Informe o nome completo do responsável e o nome da loja.' : 'Preencha a razão social e o nome fantasia.')
      return
    }
    if (onlyDigits(phone).length < 10 || onlyDigits(phone).length > 11) {
      setError('Informe um telefone com DDD (10 ou 11 números).')
      return
    }
    if (!files.fiscal_document || !files.identity || !files.proof_of_address) {
      setError('Envie os três documentos obrigatórios para concluir a solicitação.')
      return
    }

    setBusy(true)
    setError('')
    try {
      let id = requestId
      if (!id) {
        const result = await createCompany({
          personType,
          cnpj: personType === 'pj' ? fiscalDigits : '',
          cpf: personType === 'pf' ? fiscalDigits : '',
          legalName: legalName.trim(),
          name: name.trim(),
          phone,
        })
        id = result?.requestId || result?.request_id || result?.id || ''
      }
      if (!id) throw new Error('Solicitação criada, mas não foi possível identificar o protocolo. Atualize a página antes de reenviar.')
      setRequestId(id)

      await uploadCompanyRegistrationDocument(id, fiscalDocumentType, files.fiscal_document)
      await uploadCompanyRegistrationDocument(id, 'identity', files.identity)
      await uploadCompanyRegistrationDocument(id, 'proof_of_address', files.proof_of_address)
      setSent(true)
      setCurrentRequest(current => ({ ...(current || {}), id, status: 'pending', person_type: personType }))
    } catch (err) {
      setError(err.message || 'Não foi possível enviar a solicitação.')
    } finally {
      setBusy(false)
    }
  }

  return <AppScreen>
    <TopBar titulo="Cadastro de empresa" />
    <div className="page-heading">
      <span className="eyebrow">PRATOPRONTO PARA EMPRESAS</span>
      <h1>Solicitar cadastro empresarial</h1>
      <p>O cadastro fica vinculado à sua conta pessoal. A loja só será criada depois da análise documental da equipe PratoPronto.</p>
    </div>

    {checking && <section className="light-card" role="status">Consultando suas solicitações…</section>}

    {currentRequest && <section className="light-card" aria-live="polite">
      <h2>Acompanhamento da solicitação</h2>
      <p><b>Protocolo:</b> {currentRequest.id}</p>
      <p><b>Tipo:</b> {currentRequest.person_type === 'pf' ? 'Pessoa física (CPF)' : 'Pessoa jurídica (CNPJ)'}</p>
      <p><b>Status:</b> {STATUS[currentRequest.status] || currentRequest.status}</p>
      {currentRequest.review_note && <p><b>Retorno da análise:</b> {currentRequest.review_note}</p>}
      {currentRequest.status === 'pending' && <p>Envie novamente os três documentos caso a equipe solicite correções.</p>}
    </section>}

    {sent ? <section className="light-card" role="status">
      <h2>Solicitação enviada</h2>
      <p>Seu pedido está pendente de análise. Os documentos foram enviados para armazenamento privado. Protocolo: {requestId}</p>
      <button className="btn btn-primary wide-button" type="button" onClick={() => navigate('/perfil', { replace: true })}>Voltar ao perfil</button>
    </section> : <form className="light-card" onSubmit={submit}>
      <fieldset className="company-person-type">
        <legend>Tipo de cadastro</legend>
        <label>
          <input type="radio" name="person-type" value="pj" checked={personType === 'pj'} disabled={Boolean(requestId)} onChange={() => { setPersonType('pj'); setFiles({ fiscal_document: null, identity: null, proof_of_address: null }); setError('') }} />
          Pessoa jurídica (PJ)
        </label>
        <label>
          <input type="radio" name="person-type" value="pf" checked={personType === 'pf'} disabled={Boolean(requestId)} onChange={() => { setPersonType('pf'); setFiles({ fiscal_document: null, identity: null, proof_of_address: null }); setError('') }} />
          Pessoa física (PF)
        </label>
        {requestId && <small>O tipo de cadastro não pode ser alterado depois que a solicitação é criada.</small>}
      </fieldset>

      {personType === 'pj' ? <>
        <label htmlFor="company-cnpj">CNPJ<input id="company-cnpj" required inputMode="numeric" autoComplete="off" maxLength={18} value={cnpj} disabled={Boolean(requestId)} onChange={event => setCnpj(event.target.value.replace(/[^0-9./-]/g, '').slice(0,18))} placeholder="00.000.000/0000-00" /></label>
        <label htmlFor="company-legal-name">Razão social<input id="company-legal-name" required minLength={2} maxLength={160} autoComplete="organization" value={legalName} disabled={Boolean(requestId)} onChange={event => setLegalName(event.target.value)} /></label>
        <label htmlFor="company-trade-name">Nome fantasia<input id="company-trade-name" required minLength={2} maxLength={100} value={name} disabled={Boolean(requestId)} onChange={event => setName(event.target.value)} /></label>
      </> : <>
        <label htmlFor="company-cpf">CPF do responsável<input id="company-cpf" required inputMode="numeric" autoComplete="off" maxLength={14} value={cpf} disabled={Boolean(requestId)} onChange={event => setCpf(event.target.value.replace(/[^0-9.-]/g, '').slice(0,14))} placeholder="000.000.000-00" /></label>
        <label htmlFor="company-legal-name">Nome completo do responsável<input id="company-legal-name" required minLength={2} maxLength={160} autoComplete="name" value={legalName} disabled={Boolean(requestId)} onChange={event => setLegalName(event.target.value)} /></label>
        <label htmlFor="company-trade-name">Nome da loja<input id="company-trade-name" required minLength={2} maxLength={100} value={name} disabled={Boolean(requestId)} onChange={event => setName(event.target.value)} /></label>
      </>}

      <label htmlFor="company-contact-phone">Telefone de contato<input id="company-contact-phone" required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={phone} disabled={Boolean(requestId)} onChange={event => setPhone(event.target.value)} placeholder="(41) 99999-9999" /></label>

      <h2>Documentos obrigatórios</h2>
      <p className="form-hint">Envie arquivos legíveis em PDF, JPG, PNG ou WEBP, com até 5 MB cada. Os documentos ficam privados e só podem ser consultados pelo titular e pela administração autorizada.</p>
      {[
        ['fiscal_document', fiscalDocumentLabel],
        ['identity', 'Documento de identidade do responsável (RG ou CNH)'],
        ['proof_of_address', personType === 'pf' ? 'Comprovante de endereço do responsável ou local de operação' : 'Comprovante de endereço da empresa'],
      ].map(([kind, label]) => <label key={kind}>{label}<input type="file" required accept={ACCEPTED_FILES} onChange={event => setFiles(current => ({ ...current, [kind]: event.target.files?.[0] || null }))} /></label>)}

      <p className="form-hint">O cadastro PF é uma alternativa para quem não possui CNPJ, mas não dispensa licenças, autorizações sanitárias, fiscais ou municipais que sejam exigidas para a atividade e localidade.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary wide-button" disabled={busy || checking}>
        {busy ? 'Enviando solicitação e documentos…' : requestId ? 'Concluir envio dos documentos' : 'Enviar solicitação e documentos'}
      </button>
    </form>}
  </AppScreen>
}
