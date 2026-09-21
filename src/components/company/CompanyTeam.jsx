import { useEffect, useState } from 'react'
import { removeCompanyMember, saveCompanyMember, subscribeCompanyMembers } from '../../services/marketplace.js'
import { roleLabel } from '../../config/marketplace.js'

const ROLES = [
  ['admin', 'Administrador'],
  ['member', 'Membro da empresa'],
  ['kitchen', 'Cozinha'],
  ['support', 'Atendimento'],
  ['pilot', 'Piloto Parceiro'],
]

export default function CompanyTeam({ companyId }) {
  const [members, setMembers] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setMembers([]); setError('')
    if (!companyId) return
    return subscribeCompanyMembers(companyId, setMembers, err => setError(err.message || 'Não foi possível carregar a equipe.'))
  }, [companyId])

  async function add(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      await saveCompanyMember({ companyId, email: email.trim().toLowerCase(), role })
      setEmail('')
      setNotice(role === 'pilot' ? 'Piloto Parceiro adicionado à empresa.' : 'Membro adicionado à empresa.')
    } catch (err) { setError(err.message || 'Não foi possível adicionar o membro.') }
    finally { setBusy(false) }
  }

  async function remove(member) {
    if (!confirm(`Remover ${member.email || member.userId} desta empresa?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await removeCompanyMember({ companyId, userId: member.userId })
      setNotice('Acesso removido.')
    } catch (err) { setError(err.message || 'Não foi possível remover o acesso.') }
    finally { setBusy(false) }
  }

  return <div className="company-team">
    <section className="company-panel">
      <h2>Membros da empresa</h2>
      <p>Adicione pessoas que podem acompanhar pedidos, imprimir comandas e atuar conforme a função escolhida. Pilotos recebem apenas os pedidos atribuídos a eles.</p>
      {error && <p className="company-alert" role="alert">{error}</p>}
      {notice && <p className="company-notice" role="status">{notice}</p>}
      <form className="settings-grid" onSubmit={add}>
        <label>E-mail da conta no PratoPronto
          <input type="email" required maxLength="254" value={email} onChange={e => setEmail(e.target.value)} placeholder="membro@empresa.com" />
        </label>
        <label>Função
          <select value={role} onChange={e => setRole(e.target.value)}>
            {ROLES.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
        </label>
        <button className="company-button primary" disabled={busy || !email.trim()}>{busy ? 'Salvando…' : 'Adicionar à equipe'}</button>
      </form>
    </section>
    <section className="company-panel">
      <h2>Equipe ativa</h2>
      {!members.length ? <p>Nenhum membro cadastrado nesta empresa.</p> : members.map(member =>
        <div className="operation-row" key={member.id}>
          <p><b>{member.email || member.userId}</b><br /><span>{roleLabel(member.role)}</span></p>
          <button className="company-button secondary" type="button" disabled={busy || member.role === 'owner'} onClick={() => remove(member)}>
            {member.role === 'owner' ? 'Proprietário' : 'Remover'}
          </button>
        </div>
      )}
    </section>
  </div>
}
