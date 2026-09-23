import { validateCep, validateName, validatePhone, phoneInput, normalizeCep } from '../shared/input-policy.js'
import AddressFields from '../components/AddressFields.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import ProfileOverview, { ProfileIcon } from '../components/ProfileOverview.jsx'
import { profileComplete } from '../utils/access.js'
import './Perfil.css'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { getProfileStats, PRIVACY_POLICY_VERSION, TERMS_VERSION } from '../services/storage.js'

export default function Perfil() {
  const user = useUser()
  const company = useCompany()
  const [params, setParams] = useSearchParams()
  const [stats, setStats] = useState({ loading: true })
  const [attempt, setAttempt] = useState(0)
  const [message, setMessage] = useState('')
  const editing = params.has('editar')
  const wasEditing = useRef(editing)
  const title = useRef(null)
  useEffect(() => {
    if (wasEditing.current && !editing) {
      title.current?.focus({ preventScroll: true })
      title.current?.scrollIntoView({ block: 'start' })
    }
    wasEditing.current = editing
  }, [editing])
  const uid = user.usuario?.uid
  useEffect(() => {
    if (!uid) return
    let active = true
    setStats({ loading: true, uid })
    getProfileStats(uid).then(data => {
      if (active) setStats({ ...data, loading: false, uid })
    }).catch(() => {
      if (active) setStats({ loading: false, error: true, uid })
    })
    return () => { active = false }
  }, [uid, attempt])
  if (user.loading) return <AppScreen><div className="light-card" role="status">Carregando perfil...</div></AppScreen>
  if (!user.usuario) return <Navigate to="/login" replace />
  const edit = (area = 'dados') => { setMessage(''); setParams({ editar: area }) }
  return <AppScreen className="screen-with-nav profile-page">
    <section className="account-sheet" aria-label="Minha conta">
      <header className="account-topbar">
        <Link to={editing ? '/perfil' : '/pizzas'} className="account-icon-button" aria-label={editing ? 'Voltar ao perfil' : 'Voltar ao cardápio'}>←</Link>
        <span ref={title} tabIndex={-1}>{editing ? 'Editar perfil' : 'Meu perfil'}</span>
        {!editing && <button className="account-icon-button" type="button" aria-label="Editar meus dados" onClick={() => edit()}><ProfileIcon name="edit" /></button>}
      </header>
      {editing ? <ProfileEditor key={uid} usuario={user.usuario} atualizar={user.atualizar} area={params.get('editar')} onSaved={() => { setMessage('Perfil atualizado com sucesso.'); setParams({}, { replace: true }) }} />
        : <ProfileOverview key={uid} {...user} {...company} stats={stats.uid === uid ? stats : { loading: true }} onEdit={edit} onRefreshStats={() => setAttempt(value => value + 1)} incomplete={!profileComplete(user.usuario)} />}
      {!editing && message && <p className="account-saved success-note" role="status">{message}</p>}
    </section>
    <BottomNav />
  </AppScreen>
}

export function ProfileEditor({ usuario, atualizar, area, onSaved }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(() => ({ ...usuario, aceitarPolitica: usuario.privacyPolicyVersion === PRIVACY_POLICY_VERSION, aceitarTermos: usuario.termsVersion === TERMS_VERSION }))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (usuario) {
      setForm({
        ...usuario,
        aceitarPolitica: usuario.privacyPolicyVersion === PRIVACY_POLICY_VERSION,
        aceitarTermos: usuario.termsVersion === TERMS_VERSION,
      })
    }
  }, [usuario])

  useEffect(() => {
    const target = document.getElementById(area === 'endereco' ? 'profile-address-title' : 'profile-editor-title')
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'start' })
  }, [area])

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    if (name === 'telefone' && phoneInput(value).length > 11) { setErro('O telefone deve ter no máximo 11 números, incluindo o DDD.'); return }
    setForm((atual) => ({ ...atual, [name]: type === 'checkbox' ? checked : name === 'telefone' ? phoneInput(value) : name === 'cep' ? normalizeCep(value) : value }))
  }

  async function salvar(event) {
    event.preventDefault()
    if (salvando) return
    setErro('')
    try { validateName(form.nome); validatePhone(form.telefone); validateCep(form.cep) } catch (error) { setErro(error.message); return }
    if (!form.nome?.trim() || !form.telefone?.trim()) {
      setErro('Preencha nome e telefone.')
      return
    }
    if (!form.endereco?.trim() || !form.numero?.trim() || !form.bairro?.trim() || !form.cidade?.trim() || !form.uf) {
      setErro('Complete o endereço de entrega, incluindo cidade e estado.')
      return
    }
    if (!form.aceitarPolitica) {
      setErro('É necessário aceitar a Política de Privacidade para continuar.')
      return
    }
    if (!form.aceitarTermos) {
      setErro('É necessário aceitar os Termos de Uso para continuar.')
      return
    }
    try {
      setSalvando(true)
      await atualizar({
        ...form,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        termsVersion: TERMS_VERSION,
        consentTimestamp: form.consentTimestamp || new Date().toISOString(),
      })
      onSaved()
    } catch (error) {
      setErro(error.message)
    } finally { setSalvando(false) }
  }

  return (
      <form className="light-card form-card account-editor" onSubmit={salvar}>
        <h1 id="profile-editor-title" tabIndex={-1}>Seus dados</h1>
        <p className="account-editor-intro">Mantenha tudo certo para o próximo pedido.</p>
        <label htmlFor="perfil-nome">Nome (2 a 80 caracteres)</label>
        <input id="perfil-nome" minLength={2} maxLength={80} autoComplete="name" required name="nome" value={form.nome ?? ''} onChange={handleChange} />
        <label htmlFor="perfil-email">E-mail</label>
        <input id="perfil-email" value={form.email || 'Conta criada por telefone'} disabled />
        <label htmlFor="perfil-telefone">Telefone com DDD (10 ou 11 números)</label>
        <input id="perfil-telefone" type="tel" inputMode="tel" maxLength={32} autoComplete="tel-national" required name="telefone" value={form.telefone ?? ''} onChange={handleChange} />
        <h2 id="profile-address-title" tabIndex={-1}>Endereço de entrega</h2>
        <AddressFields data={form} onChange={handleChange} />
        <label htmlFor="perfil-endereco">Rua ou avenida</label>
        <input id="perfil-endereco" required autoComplete="address-line1" maxLength={180} name="endereco" value={form.endereco ?? ''} onChange={handleChange} />
        <div className="payment-grid">
          <div>
            <label htmlFor="perfil-numero">Número</label>
            <input id="perfil-numero" required maxLength={20} name="numero" value={form.numero ?? ''} onChange={handleChange} />
          </div>
          <div>
            <label htmlFor="perfil-bairro">Bairro</label>
            <input id="perfil-bairro" required maxLength={100} name="bairro" value={form.bairro ?? ''} onChange={handleChange} />
          </div>
        </div>
        <label htmlFor="perfil-complemento">Complemento</label>
        <input id="perfil-complemento" autoComplete="address-line2" maxLength={180} name="complemento" value={form.complemento ?? ''} onChange={handleChange} />
        <label className="checkbox-line"><input type="checkbox" name="aceitarPolitica" checked={Boolean(form.aceitarPolitica)} onChange={handleChange} /> <span>Li e concordo com a <Link to="/politica-de-privacidade">Política de Privacidade</Link></span></label>
        <label className="checkbox-line"><input type="checkbox" name="aceitarTermos" checked={Boolean(form.aceitarTermos)} onChange={handleChange} /> <span>Li e concordo com os <Link to="/termos-de-uso">Termos de Uso</Link></span></label>
        <label className="checkbox-line"><input type="checkbox" name="aceitarMarketing" checked={Boolean(form.aceitarMarketing)} onChange={handleChange} /> Receber promoções por e-mail</label>
        {erro && <p className="form-error dark-error" role="alert">{erro}</p>}
        <button className="btn btn-primary" type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar alterações'}</button>
        <button className="account-cancel" type="button" disabled={salvando} onClick={() => navigate('/perfil', { replace: true })}>Cancelar</button>
      </form>
  )
}
