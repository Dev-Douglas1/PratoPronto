import { validateName, validatePhone, phoneInput } from '../shared/input-policy.js'
import AddressFields from '../components/AddressFields.jsx'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'
import BottomNav from '../components/BottomNav.jsx'

export default function Perfil() {
  const navigate = useNavigate()
  const { usuario, loading, atualizar, sair, enviarVerificacaoEmail } = useUser()
  const { staffCompanies, pilotProfile, platformAdmin } = useCompany()
  const [form, setForm] = useState({})
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (usuario) setForm(usuario)
  }, [usuario])

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    if (name === 'telefone' && phoneInput(value).length > 11) { setErro('O telefone deve ter no máximo 11 números, incluindo o DDD.'); return }
    setForm((atual) => ({ ...atual, [name]: type === 'checkbox' ? checked : name === 'telefone' ? phoneInput(value) : value }))
  }

  async function salvar(event) {
    event.preventDefault()
    if (salvando) return
    setErro('')
    setMensagem('')
    try { validateName(form.nome); validatePhone(form.telefone) } catch (error) { setErro(error.message); return }
    if (!form.nome?.trim() || !form.telefone?.trim()) {
      setErro('Preencha nome e telefone.')
      return
    }
    if (!form.endereco?.trim() || !form.numero?.trim() || !form.bairro?.trim()) {
      setErro('Preencha rua, número e bairro para calcular e realizar a entrega.')
      return
    }
    try {
      setSalvando(true)
      await atualizar(form)
      setMensagem('Dados atualizados com sucesso.')
    } catch (error) {
      setErro(error.message)
    } finally { setSalvando(false) }
  }

  async function verificarEmail() {
    try {
      setErro('')
      await enviarVerificacaoEmail()
      setMensagem('E-mail de verificação enviado. Confira sua caixa de entrada.')
    } catch (error) {
      setErro(error.message)
    }
  }

  if (loading) return <AppScreen><div className="light-card">Carregando...</div></AppScreen>
  if (!usuario) return <Navigate to="/login" replace />

  return (
    <AppScreen className="screen-with-nav">
      <TopBar titulo="Meu perfil" />
      <div className="profile-heading">
        <div className="profile-avatar">{(usuario.nome || usuario.email || 'U').charAt(0).toUpperCase()}</div>
        <div><span className="eyebrow">MINHA CONTA</span><h1>{usuario.nome || 'Cliente PratoPronto'}</h1><p>{usuario.email}</p></div>
      </div>
      <form className="light-card form-card" onSubmit={salvar}>
        <div className={`account-badge ${usuario.emailVerificado ? 'is-verified' : ''}`}>
          <strong>{usuario.emailVerificado ? '✓ E-mail verificado' : '! E-mail ainda não verificado'}</strong>
          {!usuario.emailVerificado && <button type="button" onClick={verificarEmail}>Enviar verificação</button>}
        </div>
        <label htmlFor="perfil-nome">Nome (2 a 80 caracteres)</label>
        <input id="perfil-nome" minLength={2} maxLength={80} autoComplete="name" required name="nome" value={form.nome ?? ''} onChange={handleChange} />
        <label htmlFor="perfil-email">E-mail</label>
        <input id="perfil-email" value={form.email ?? ''} disabled />
        <label htmlFor="perfil-telefone">Telefone com DDD (10 ou 11 números)</label>
        <input id="perfil-telefone" type="tel" inputMode="tel" maxLength={32} autoComplete="tel-national" required name="telefone" value={form.telefone ?? ''} onChange={handleChange} />
        <AddressFields data={form} onChange={handleChange} />
        <label htmlFor="perfil-endereco">Endereço</label>
        <input id="perfil-endereco" maxLength={180} name="endereco" value={form.endereco ?? ''} onChange={handleChange} />
        <div className="payment-grid">
          <div>
            <label htmlFor="perfil-numero">Número</label>
            <input id="perfil-numero" maxLength={20} name="numero" value={form.numero ?? ''} onChange={handleChange} />
          </div>
          <div>
            <label htmlFor="perfil-bairro">Bairro</label>
            <input id="perfil-bairro" maxLength={100} name="bairro" value={form.bairro ?? ''} onChange={handleChange} />
          </div>
        </div>
        <label htmlFor="perfil-complemento">Complemento</label>
        <input id="perfil-complemento" maxLength={180} name="complemento" value={form.complemento ?? ''} onChange={handleChange} />
        <label className="checkbox-line"><input type="checkbox" name="aceitarMarketing" checked={Boolean(form.aceitarMarketing)} onChange={handleChange} /> Receber promoções por e-mail</label>
        {mensagem && <p className="success-note">{mensagem}</p>}
        {erro && <p className="form-error dark-error" role="alert">{erro}</p>}
        <button className="btn btn-primary" type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar dados'}</button>
        <button className="btn ghost-button" type="button" onClick={() => navigate('/privacidade')}>Privacidade e meus dados</button>
        {!!staffCompanies.length && <button className="btn admin-button" type="button" onClick={() => navigate('/empresa/pedidos')}>Área da empresa</button>}
        {platformAdmin && <button className="btn admin-button" type="button" onClick={() => navigate('/plataforma/pilotos')}>Analisar cadastros de pilotos</button>}
        <button className="btn ghost-button" type="button" onClick={() => navigate(pilotProfile ? '/piloto' : '/piloto/cadastro')}>
          {pilotProfile ? 'Área Piloto Parceiro' : 'Se torne um piloto das entregas'}
        </button>
        <button className="btn btn-secondary" type="button" onClick={async () => { await sair(); navigate('/login') }}>Sair</button>
      </form>
      <BottomNav />
    </AppScreen>
  )
}
