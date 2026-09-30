import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AccountIdentifier from './AccountIdentifier.jsx'
import PilotIntroModal from './PilotIntroModal.jsx'

export function ProfileIcon({ name }) {
  const paths = {
    edit: 'm16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5',
    pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
    id: 'M3 5h18v14H3V5Zm4 4h3v3H7V9Zm-1 7h5m3-6h4m-4 5h4',
    shop: 'M4 10v11h16V10M3 10l2-7h14l2 7H3Zm6 11v-7h6v7',
    bike: 'M8 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm16 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 17l5-9 5 9H4Zm10 0 5-12h-4M7 5h5',
    arrow: 'm9 5 7 7-7 7',
    exit: 'M9 4H4v16h5m5-13 5 5-5 5m-5-5h10',
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.arrow} /></svg>
}

function ProfileAvatar({ usuario }) {
  const [failedUrl, setFailedUrl] = useState('')
  const image = /^https:\/\//i.test(usuario.avatarUrl || '') && failedUrl !== usuario.avatarUrl
  return <div className="account-avatar">
    {image ? <img src={usuario.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(usuario.avatarUrl)} />
      : <span aria-hidden="true">{(usuario.nome || usuario.email || 'P').trim().charAt(0).toUpperCase()}</span>}
  </div>
}

function MenuItem({ icon, title, subtitle, to, onClick }) {
  const Tag = to ? Link : 'button'
  return <Tag className="account-menu-item" {...(to ? { to } : { type: 'button', onClick })}>
    <span className="account-menu-icon"><ProfileIcon name={icon} /></span>
    <span><strong>{title}</strong><small>{subtitle}</small></span>
    <ProfileIcon name="arrow" />
  </Tag>
}

export default function ProfileOverview({ usuario, staffCompanies = [], pilotProfile, platformAdmin = false, stats = { loading: true }, onEdit, onRefreshStats, incomplete, sair, enviarVerificacaoEmail }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [pilotIntroOpen, setPilotIntroOpen] = useState(false)
  const pilotStatus = pilotProfile?.approval_status || ''
  const hasPilotArea = ['pending', 'approved', 'rejected'].includes(pilotStatus)
  const city = [usuario.cidade, usuario.uf].filter(Boolean).join(', ')
  const count = key => !stats.loading && !stats.error && Number.isInteger(stats[key]) ? stats[key].toLocaleString('pt-BR') : '—'

  async function logout() {
    if (busy) return
    setBusy('logout'); setError('')
    try { await sair(); navigate('/login', { replace: true }) }
    catch { setError('Não foi possível sair. Confira a conexão e tente novamente.'); setBusy('') }
  }
  async function verify() {
    if (busy) return
    setBusy('verify'); setError('')
    try { await enviarVerificacaoEmail(); setMessage('Verificação enviada. Confira sua caixa de entrada.') }
    catch (err) { setError(err.message || 'Não foi possível enviar a verificação.') }
    finally { setBusy('') }
  }

  return <>
    <div className="account-overview">
      <div className="account-overview__top">
        <ProfileAvatar usuario={usuario} />
        <dl className="account-stats" aria-label="Sua atividade" aria-busy={stats.loading}>
          {[['orders', 'Pedidos'], ['delivered', 'Entregues'], ['reviews', 'Avaliações']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{count(key)}</dd></div>)}
        </dl>
      </div>
      <h1>{usuario.nome || 'Cliente PratoPronto'}</h1>
      <p className="account-type">Sua conta no PratoPronto</p>
      <div className="account-details">
        {city && <span><ProfileIcon name="pin" />{city}</span>}
        <span className={usuario.emailVerificado ? 'account-verified' : ''}><ProfileIcon name="shield" />{usuario.emailVerificado ? 'Conta verificada' : 'Verificação pendente'}</span>
      </div>
      {stats.error && <p className="account-stats-error" role="status">Não foi possível carregar os contadores. <button type="button" onClick={onRefreshStats}>Tentar novamente</button></p>}
      {incomplete && <p className="account-incomplete">Complete seus dados e endereço para fazer pedidos.</p>}
      <div className="account-actions">
        <button type="button" onClick={() => onEdit()}>{incomplete ? 'Completar perfil' : 'Editar perfil'}</button>
        <Link to="/acompanhamento">Meus pedidos</Link>
      </div>
    </div>
    <div className="account-menu">
      <h2>Minha conta</h2>
      <MenuItem icon="pin" title="Endereço de entrega" subtitle={city || 'Cadastre onde quer receber'} onClick={() => onEdit('endereco')} />
      <MenuItem icon="shield" title="Privacidade e meus dados" subtitle="Acesso, preferências e exclusão" to="/privacidade" />
      <details className="account-id-details"><summary className="account-menu-item"><span className="account-menu-icon"><ProfileIcon name="id" /></span><span><strong>ID da conta</strong><small>Seu identificador no PratoPronto</small></span><ProfileIcon name="arrow" /></summary><AccountIdentifier accountId={usuario.uid} hint /></details>
    </div>
    <div className="account-menu account-work">
      <h2>No PratoPronto</h2>
      {!!staffCompanies.length && <MenuItem icon="shop" title="Área da empresa" subtitle="Pedidos, cardápio e equipe" to="/empresa/pedidos" />}
      {hasPilotArea
        ? <MenuItem icon="bike" title="Área Piloto Parceiro" subtitle="Acompanhe seu cadastro e suas entregas" to="/piloto" />
        : <MenuItem icon="bike" title="Se torne um piloto das entregas" subtitle="Conheça o programa de parceiros" onClick={() => {
            try { sessionStorage.removeItem('pratopronto:pilot-intro-accepted') } catch {}
            setPilotIntroOpen(true)
          }} />}
      {platformAdmin && <>
        <MenuItem icon="shop" title="Administrar empresas" subtitle="Administração da plataforma" to="/plataforma/empresas" />
        <MenuItem icon="bike" title="Analisar cadastros de pilotos" subtitle="Aprovações da plataforma" to="/plataforma/pilotos" />
      </>}
    </div>
    {!usuario.emailVerificado && <button className="account-verify-button" type="button" onClick={verify} disabled={!!busy}>{busy === 'verify' ? 'Enviando...' : 'Enviar verificação'}</button>}
    <button className="account-logout" type="button" onClick={logout} disabled={!!busy}><ProfileIcon name="exit" />{busy === 'logout' ? 'Saindo...' : 'Sair da conta'}</button>
    <div className="account-feedback" aria-live="polite">{message && <p className="success-note" role="status">{message}</p>}{error && <p className="form-error dark-error" role="alert">{error}</p>}</div>
    <PilotIntroModal
      open={pilotIntroOpen}
      onClose={() => setPilotIntroOpen(false)}
      onConfirm={() => {
        try { sessionStorage.setItem('pratopronto:pilot-intro-accepted', '1') } catch {}
        setPilotIntroOpen(false)
        navigate('/piloto/cadastro')
      }}
    />
  </>
}
