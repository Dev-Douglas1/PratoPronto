import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { project: { type:'string' }, email: { type:'string' }, apply: { type:'boolean', default:false }, revoke: { type:'boolean', default:false } } })
if (!/^[a-z][a-z0-9-]{4,62}$/.test(values.project || '') || !values.email?.includes('@')) throw new Error('Informe --project ID --email EMAIL. Sem --apply, somente confere o usuário.')
initializeApp({ projectId:values.project, credential:applicationDefault() })
try {
  const user = await getAuth().getUserByEmail(values.email)
  if (!user.emailVerified || user.disabled) throw new Error('O usuário precisa confirmar o e-mail e ter uma conta ativa.')
  const db = getFirestore()
  const ref = db.doc('admins/' + user.uid)
  console.log(JSON.stringify({ projeto:values.project, uid:user.uid, email:user.email, acao:values.revoke ? 'remover administração' : 'conceder administração', aplicado:values.apply }))
  if (values.apply) {
    if (values.revoke) {
      const others = await db.collection('admins').where('role','==','restaurant_admin').get()
      if (!others.docs.some(doc => doc.id !== user.uid)) throw new Error('Cadastre outro administrador antes de remover o último.')
      await ref.delete()
    } else {
      await ref.set({ role:'restaurant_admin', grantedAt:new Date(), grantedVia:'trusted-admin-script' })
    }
    await db.collection('auditEvents').add({ action:values.revoke ? 'admin_revoked' : 'admin_granted', target:user.uid, by:'trusted-admin-script', at:new Date() })
    console.log('Acesso atualizado. Saia e entre novamente no aplicativo.')
  }
} catch (error) {
  console.error(error.code === 'auth/user-not-found' ? 'Cadastre a conta no aplicativo antes de conceder acesso.' : 'Não foi possível concluir. Confira a autenticação Google, a permissão no projeto e se o usuário confirmou o e-mail.')
  process.exitCode=1
}
