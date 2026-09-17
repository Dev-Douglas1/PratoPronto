import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret, defineString } from 'firebase-functions/params'
import * as logger from 'firebase-functions/logger'
import { DomainError } from './domain.js'
import { identityService } from './identity.js'
import { emailServiceStatus, securityEmail } from './security-email.js'

const emailKey = defineSecret('RESEND_API_KEY')
const codeKey = defineSecret('EMAIL_CODE_SECRET')
const emailFrom = defineString('SECURITY_EMAIL_FROM', { default: '' })
const options = { region: 'southamerica-east1', maxInstances: 5, concurrency: 10, timeoutSeconds: 45, memory: '256MiB' }
const secrets = [emailKey, codeKey]
const runtime = () => identityService({ db: getFirestore(), authAdmin: getAuth(), secret: codeKey.value(), mail: securityEmail({ apiKey: emailKey.value(), from: emailFrom.value() }) })
export const appEmailServiceStatus = onCall({ ...options, secrets, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }, () => {
  try { return emailServiceStatus({ apiKey: emailKey.value(), from: emailFrom.value(), secret: codeKey.value() }) }
  catch { throw new HttpsError('failed-precondition', 'A confirmação por e-mail ainda não foi ativada pela empresa.') }
})

function callable(method) {
  return onCall({ ...options, secrets, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }, async request => {
    try {
      const context = request.auth ? { ...request.auth.token, uid: request.auth.uid } : null
      const data = method === 'loginNotice' ? { device: request.rawRequest.get('user-agent') || '' } : request.data || {}
      return await runtime()[method](context, data)
    } catch (error) {
      if (error instanceof DomainError) throw new HttpsError(error.code, error.message)
      if (error?.code === 'auth/user-not-found') throw new HttpsError('unauthenticated', 'Entre novamente para continuar.')
      logger.error('identity_failed', { operation: method, code: error?.code || 'internal' })
      throw new HttpsError('unavailable', 'O serviço de confirmação não respondeu. Tente novamente em instantes.')
    }
  })
}
export const appSendEmailCode = callable('sendCode')
export const appConfirmEmailCode = callable('confirmCode')
export const appLoginNotice = callable('loginNotice')
export const sendLoginEmail = onDocumentCreated({ ...options, secrets, document: 'loginEmailJobs/{id}', retry: true }, event => runtime().deliverLoginNotice(event.params.id))
export const cleanEmailSecurityData = onSchedule({ ...options, schedule: 'every 60 minutes', maxInstances: 1 }, async () => {
  const db = getFirestore()
  for (const collection of ['emailChallenges', 'emailCodeLimits', 'loginEmailJobs', 'loginEmailLimits']) {
    const expired = await db.collection(collection).where('expiresAt', '<=', new Date()).limit(400).get()
    if (expired.empty) continue
    const batch = db.batch()
    expired.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
  }
})
