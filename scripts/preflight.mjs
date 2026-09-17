import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
const { values } = parseArgs({ options:{ project:{ type:'string' } } })
if (!/^[a-z][a-z0-9-]{4,62}$/.test(values.project || '')) throw new Error('Use --project ID_DO_PROJETO')
async function env(path) {
  try { return Object.fromEntries((await readFile(path,'utf8')).split('\n').filter(line => /^[A-Z_]+\s*=/.test(line)).map(line => { const index=line.indexOf('='); return [line.slice(0,index).trim(),line.slice(index+1).trim().replace(/^['"]|['"]$/g,'')] })) } catch { return {} }
}
const frontend={ ...await env('.env'), ...await env('.env.local'), ...process.env }
const backend=await env('functions/.env.' + values.project)
const report={
  firebaseWebConfigured:['API_KEY','AUTH_DOMAIN','PROJECT_ID','APP_ID'].every(key => Boolean(frontend['VITE_FIREBASE_' + key])),
  appCheckSiteKeyConfigured:Boolean(frontend.VITE_FIREBASE_APPCHECK_SITE_KEY),
  backendParametersPresent:Object.keys(backend).length>0,
  paymentEnvironment:backend.PAYMENT_ENV || 'disabled',
  liveOrdersEnabled:backend.LIVE_ORDERS_ENABLED==='true',
  receiverIdConfigured:Boolean(backend.MP_COLLECTOR_ID),
  backupBucketConfigured:Boolean(backend.BACKUP_BUCKET),
  note:'Este diagnóstico local não verifica segredos remotos nem substitui a homologação do provedor.',
}
console.log(JSON.stringify(report,null,2))
