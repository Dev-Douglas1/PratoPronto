import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { createCompany } from '../services/marketplace.js'

export default function CompanyOnboarding() {
  const navigate = useNavigate()
  const [cnpj, setCnpj] = useState('')
  const [legalName, setLegalName] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const digits = cnpj.replace(/\\D/g, '')
    if (digits.length !== 14) { setError('Informe um CNPJ com 14 números.'); return }
    if (legalName.trim().length < 2 || name.trim().length < 2) { setError('Preencha a razão social e o nome fantasia.'); return }
    if (phone.replace(/\\D/g, '').length < 10) { setError('Informe um telefone com DDD.'); return }
    setBusy(true); setError('')
    try {
      await createCompany({ cnpj: digits, legalName: legalName.trim(), name: name.trim(), phone })
      setSent(true)
    } catch (err) { setError(err.message || 'Não foi possível enviar a solicitação.') }
    finally { setBusy(false) }
  }

  return <AppScreen>
    <TopBar titulo="Cadastro de empresa" />
    <div className="page-heading"><span className="eyebrow">PRATOPRONTO PARA EMPRESAS</span><h1>Solicitar cadastro empresarial</h1><p>O cadastro é vinculado à sua conta pessoal. A loja só será criada depois da análise da equipe PratoPronto.</p></div>
    {sent ? <section className="light-card" role="status">
      <h2>Solicitação enviada</h2>
      <p>Seu pedido está pendente de análise. O CNPJ ficará reservado enquanto a solicitação estiver em análise. Você poderá acompanhar o resultado pelo seu perfil.</p>
      <button className="btn btn-primary wide-button" type="button" onClick={() => navigate('/perfil', { replace: true })}>Voltar ao perfil</button>
    </section> : <form className="light-card" onSubmit={submit}>
      <label htmlFor="company-cnpj">CNPJ<input id="company-cnpj" required inputMode="numeric" autoComplete="off" maxLength={18} value={cnpj} onChange={event => setCnpj(event.target.value.replace(/[^0-9./-]/g, '').slice(0,18))} placeholder="00.000.000/0000-00" /></label>
      <label htmlFor="company-legal-name">Razão social<input id="company-legal-name" required minLength={2} maxLength={160} autoComplete="organization" value={legalName} onChange={event => setLegalName(event.target.value)} /></label>
      <label htmlFor="company-trade-name">Nome fantasia<input id="company-trade-name" required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      <label htmlFor="company-contact-phone">Telefone de contato<input id="company-contact-phone" required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={phone} onChange={event => setPhone(event.target.value)} placeholder="(41) 99999-9999" /></label>
      <p className="form-hint">Apenas informar o CNPJ não comprova vínculo com a empresa. A equipe poderá solicitar documentos e confirmação do responsável antes da aprovação.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary wide-button" disabled={busy}>{busy ? 'Enviando solicitação…' : 'Enviar para análise'}</button>
    </form>}
  </AppScreen>
}
