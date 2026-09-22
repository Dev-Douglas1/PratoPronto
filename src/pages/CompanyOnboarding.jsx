import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { createCompany } from '../services/marketplace.js'
import { useCompany } from '../context/CompanyContext.jsx'

const slugify = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)

export default function CompanyOnboarding() {
  const navigate = useNavigate()
  const { refresh, selectCompany } = useCompany()
  const [name, setName] = useState('')
  const [customId, setCustomId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const suggested = useMemo(() => slugify(name), [name])
  const companyId = customId || suggested

  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await createCompany({ companyId, name })
      await refresh()
      selectCompany(result.companyId)
      navigate('/empresa/configuracoes', { replace: true })
    } catch (err) { setError(err.message || 'Não foi possível criar a empresa.') }
    finally { setBusy(false) }
  }

  return <AppScreen>
    <TopBar titulo="Nova empresa" />
    <div className="page-heading"><span className="eyebrow">PRATOPRONTO PARA EMPRESAS</span><h1>Cadastre sua empresa</h1><p>Depois você poderá montar o cardápio, adicionar membros e Pilotos Parceiros.</p></div>
    <form className="light-card" onSubmit={submit}>
      <label>Nome da empresa<input required minLength="2" maxLength="100" value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Pizzaria do Centro" /></label>
      <label>Identificador da loja<input required minLength="2" maxLength="64" pattern="[a-z0-9][a-z0-9_-]{1,63}" value={companyId} onChange={event => setCustomId(slugify(event.target.value))} /></label>
      <small>Sua loja ficará em /loja/{companyId || 'nome-da-empresa'}.</small>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary wide-button" disabled={busy || !companyId}>{busy ? 'Criando…' : 'Criar empresa'}</button>
    </form>
  </AppScreen>
}
