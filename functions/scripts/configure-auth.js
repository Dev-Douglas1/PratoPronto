import { applicationDefault } from 'firebase-admin/app'
import { parseArgs } from 'node:util'
const { values } = parseArgs({ options: { project:{ type:'string' }, origin:{ type:'string' }, apply:{ type:'boolean',default:false } } })
if (!/^[a-z][a-z0-9-]{4,62}$/.test(values.project || '')) throw new Error('Informe --project ID e --origin https://dominio-do-app. Use --apply para aplicar.')
const origin = new URL(values.origin)
if (origin.protocol !== 'https:' || origin.origin !== values.origin) throw new Error('Informe somente a origem HTTPS do aplicativo.')
try {
  const token = (await applicationDefault().getAccessToken()).access_token
  const headers = { Authorization:'Bearer ' + token, 'Content-Type':'application/json' }
  const url = 'https://identitytoolkit.googleapis.com/admin/v2/projects/' + values.project + '/config'
  const response = await fetch(url,{ headers,signal:AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('read-config-failed')
  const current = await response.json()
  const strength = current.passwordPolicyConfig?.passwordPolicyVersions?.[0]?.customStrengthOptions || {}
  const minimum = Math.max(12, strength.minPasswordLength || 0)
  const maximum = Math.max(minimum, Math.min(128, strength.maxPasswordLength || 128))
  const body = {
    authorizedDomains:[...new Set([...(current.authorizedDomains || []),origin.hostname])],
    signIn:{ email:{ enabled:true,passwordRequired:true } },
    emailPrivacyConfig:{ enableImprovedEmailPrivacy:true },
    passwordPolicyConfig:{ passwordPolicyEnforcementState:'ENFORCE', forceUpgradeOnSignin:current.passwordPolicyConfig?.forceUpgradeOnSignin || false, passwordPolicyVersions:[{ customStrengthOptions:{ ...strength, minPasswordLength:minimum, maxPasswordLength:maximum, containsNumericCharacter:true } }] },
  }
  if (values.apply) {
    const updateMask='authorizedDomains,signIn.email,emailPrivacyConfig,passwordPolicyConfig'
    const result = await fetch(url + '?updateMask=' + encodeURIComponent(updateMask),{ method:'PATCH',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000) })
    if (!result.ok) throw new Error('update-config-failed')
    console.log('Domínio e proteção da autenticação atualizados.')
  }
  console.log(JSON.stringify({ projeto:values.project, dominio:origin.hostname, emailSenha:true, protecaoEnumeracao:true, senhaMinima:minimum, senhaMaxima:maximum, aplicado:values.apply }))
} catch {
  console.error('Não foi possível acessar a configuração do Firebase. Autentique a conta Google responsável e confira as permissões do projeto. Nenhuma credencial foi exibida.')
  process.exitCode=1
}
