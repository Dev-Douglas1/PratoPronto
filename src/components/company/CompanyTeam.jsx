import { useEffect, useState } from 'react'
import { removeCompanyMember, saveCompanyMember, subscribeCompanyMembers } from '../../services/marketplace.js'
import { roleLabel } from '../../config/marketplace.js'
import AccountIdentifier from '../AccountIdentifier.jsx'

const ROLES = [
  ['admin', 'Administrador'],
  ['attendant', 'Atendente'],
  ['kitchen', 'Cozinha'],
]

export default function CompanyTeam({ companyId, actorRole, actorId }) {
  const [members, setMembers] = useState([])
  const [identifier, setIdentifier] = useState('')
  const [role, setRole] = useState('attendant')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const canManage = ['owner', 'admin'].includes(actorRole)
  const allowedRoles = ROLES.filter(([id]) => id !== 'admin' || actorRole === 'owner')
  const selectedRole = allowedRoles.some(([id]) => id === role) ? role : 'attendant'

  const canEdit = member => canManage && member.role !== 'owner' && member.userId !== actorId
    && (member.role !== 'admin' || actorRole === 'owner')

  useEffect(() => {
    setIdentifier(''); setRole('attendant'); setNotice('')
  }, [companyId])

  useEffect(() => {
    setMembers([]); setError('')
    if (!companyId) return
    return subscribeCompanyMembers(companyId, setMembers, err => setError(err.message || 'Não foi possível carregar a equipe.'))
  }, [companyId, revision])

  async function add(event) {
    event.preventDefault()
    if (busy || !canManage) return
    setBusy(true); setError(''); setNotice('')
    try {
      await saveCompanyMember({ companyId, identifier: identifier.trim(), role: selectedRole })
      setIdentifier('')
      setNotice('Acesso da equipe atualizado.')
      setRevision(value => value + 1)
    } catch (err) { setError(err.message || 'Não foi possível adicionar o membro.') }
    finally { setBusy(false) }
  }

  async function remove(member) {
    if (busy || !canEdit(member)) return
    if (!confirm(`Remover ${member.email || member.userId} desta empresa?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await removeCompanyMember({ companyId, userId: member.userId })
      setNotice('Acesso removido.')
      setRevision(value => value + 1)
    } catch (err) { setError(err.message || 'Não foi possível remover o acesso.') }
    finally { setBusy(false) }
  }

  return <div className="company-team">
    <section className="company-panel">
      <h2>Membros da empresa</h2>
      <p>A equipe da empresa é formada por proprietário, administrador, atendente e cozinha. Piloto Parceiro é um cadastro separado e não faz parte dos membros internos da empresa.</p>
      <p>Peça à pessoa o ID disponível em Meu perfil. O acesso vale somente para esta empresa. Só o proprietário pode conceder ou alterar a função de administrador da empresa.</p>
      {error && <p className="company-alert" role="alert">{error}</p>}
      {notice && <p className="company-notice" role="status">{notice}</p>}
      {canManage && <form className="settings-grid" onSubmit={add}>
        <label>ID da conta ou e-mail
          <input type="text" required maxLength="254" autoComplete="off" autoCapitalize="none" spellCheck={false} value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="Cole o ID completo ou digite o e-mail" />
        </label>
        <label>Função
          <select value={selectedRole} onChange={e => setRole(e.target.value)}>
            {allowedRoles.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
        </label>
        <button className="company-button primary" disabled={busy || !identifier.trim()}>{busy ? 'Salvando…' : 'Salvar acesso'}</button>
      </form>}
    </section>
    <section className="company-panel">
      <h2>Equipe ativa</h2>
      {!members.length ? <p>Nenhum membro cadastrado nesta empresa.</p> : members.map(member =>
        <article className="team-member" key={member.id}>
          <div className="operation-row">
            <p><b>{member.email || 'Conta verificada por telefone'}</b><br /><span>{roleLabel(member.role)}{member.userId === actorId ? ' · Você' : ''}</span></p>
            {canEdit(member) && <div className="inline-actions">
              <button className="company-button secondary" type="button" disabled={busy} onClick={() => { setIdentifier(member.userId); setRole(member.role); setNotice('Escolha a função no formulário acima e salve o acesso.') }}>Alterar função</button>
              <button className="company-button secondary" type="button" disabled={busy} onClick={() => remove(member)}>Remover</button>
            </div>}
          </div>
          <AccountIdentifier accountId={member.userId} />
        </article>
      )}
    </section>
  </div>
}
