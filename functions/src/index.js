import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret, defineString, defineBoolean } from 'firebase-functions/params'
import * as logger from 'firebase-functions/logger'
import { DomainError, requireThat, verifyWebhook, hash } from './domain.js'
import { mercadoPago } from './mercadopago.js'
import { createService } from './service.js'
import { paymentProcessor } from './payments.js'
import { maintenance } from './maintenance.js'
// Registration uses Firebase Authentication's native email action handler.
// Custom four-digit verification endpoints are no longer published.
export { appLoginNotice, sendLoginEmail, cleanEmailSecurityData } from './identity-functions.js'

const credential = applicationDefault()
initializeApp({ credential })
const db = getFirestore()
const authAdmin = getAuth()
const token = defineSecret('MP_ACCESS_TOKEN')
const webhookSecret = defineSecret('MP_WEBHOOK_SECRET')
const environment = defineString('PAYMENT_ENV', { default: 'disabled' })
const appOrigin = defineString('APP_PUBLIC_URL', { default: '' })
const collector = defineString('MP_COLLECTOR_ID', { default: '' })
const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== 'true'
const liveEnabled = defineBoolean('LIVE_ORDERS_ENABLED', { default: false })
const backupBucket = defineString('BACKUP_BUCKET', { default: '' })
const region = 'southamerica-east1'
const options = { region, maxInstances: 10, concurrency: 20, memory: '256MiB', timeoutSeconds: 60 }
const secrets = [token, webhookSecret]
const log = (kind, data) => logger.warn(kind, data)
async function contextFor(request) {
  requireThat(request.auth, 'Entre na conta para continuar.', 'unauthenticated')
  try {
    const account = await authAdmin.getUser(request.auth.uid)
    requireThat(!account.disabled && account.emailVerified && Number(request.auth.token.auth_time) * 1000 >= new Date(account.tokensValidAfterTime || 0).getTime(), 'Entre novamente e confirme seu e-mail.', 'unauthenticated')
    return { ...request.auth.token, uid: account.uid, email: account.email, email_verified: account.emailVerified }
  } catch (error) {
    if (error instanceof DomainError) throw error
    if (error.code === 'auth/user-not-found') throw new DomainError('unauthenticated', 'Esta conta foi encerrada. Entre novamente para continuar.')
    throw error
  }
}
function runtime() {
  const origin = appOrigin.value().replace(/\/$/, '')
  if (origin) { const url = new URL(origin); requireThat(url.protocol === 'https:' && url.origin === origin, 'APP_PUBLIC_URL deve conter apenas a origem HTTPS.', 'failed-precondition') }
  const config = { environment: environment.value(), origin, collectorId: collector.value(), enforceAppCheck, liveEnabled: liveEnabled.value(), hasPaymentSecrets: Boolean(token.value() && webhookSecret.value()), backupBucket: backupBucket.value(), projectId: process.env.GCLOUD_PROJECT }
  const mp = mercadoPago({ token: token.value(), origin, environment: config.environment, webhookUrl: `https://${region}-${config.projectId}.cloudfunctions.net/mpWebhook` })
  const dependencies = { db, authAdmin, config, mp, log, credential }
  return { service: createService(dependencies), processor: paymentProcessor(dependencies), maintenance: maintenance(dependencies), config }
}
function callable(method, publicAccess = false) {
  return onCall({ ...options, secrets, enforceAppCheck: publicAccess ? false : enforceAppCheck }, async request => {
    try {
      const context = publicAccess ? null : await contextFor(request)
      return await runtime().service[method](...(publicAccess ? [request.data || {}] : [context, request.data || {}]))
    } catch (error) {
      if (error instanceof DomainError) throw new HttpsError(error.code, error.message, error.restartCheckout ? { restartCheckout: true } : undefined)
      logger.error('callable_failed', { method, code: error.code || 'internal' })
      throw new HttpsError('internal', 'O serviço não concluiu a operação. Consulte o pedido antes de tentar novamente.')
    }
  })
}
export const appStorefront = callable('storefront', true)
export const appQuote = callable('quote')
export const appCheckout = callable('checkout')
export const appResume = callable('resume')
export const appAdvance = callable('advance')
export const appRefundRequest = callable('requestRefund')
export const appRefundDecision = callable('decide')
export const appConfirmManualRefund = callable('confirmManualRefund')
export const appSaveSettings = callable('saveSettings')
export const appReadiness = callable('readiness')
export const appPrivacyRequest = callable('privacyRequest')
export const appMigrateDefaultCompany = callable('migrateDefaultCompany')
export const appMyCompanies = callable('listMyCompanies')
export const appCreateCompany = callable('createCompany')
export const appSaveCompanyMember = callable('saveCompanyMember')
export const appRemoveCompanyMember = callable('removeCompanyMember')
export const appSaveCompanyProduct = callable('saveCompanyProduct')
export const appAssignPilot = callable('assignPilot')
export const appPilotStartDelivery = callable('pilotStartDelivery')
export const appPilotConfirmDelivery = callable('pilotConfirmDelivery')
export const appRetryPayment = onCall({ ...options, secrets, enforceAppCheck }, async request => {
  const { service, processor } = runtime()
  try {
    const context = await contextFor(request)
    await service.admin(context); await service.rate(context, 'retry', 5)
    const orderId = request.data?.orderId
    requireThat(typeof orderId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(orderId), 'Pedido inválido.')
    const jobs = await db.collection('refundJobs').where('orderId','==',orderId).get()
    for (const job of jobs.docs) if (job.data().state === 'action_required') await job.ref.update({ state: 'pending', attempts: 0, leaseUntil: null, nextAttemptAt: new Date() })
    await processor.watch(db.doc('paymentWatches/' + orderId))
    for (const job of jobs.docs) await processor.refundJob(job.id)
    return { checked: true }
  } catch (error) { throw new HttpsError(error instanceof DomainError ? error.code : 'internal', error instanceof DomainError ? error.message : 'Não foi possível consultar o provedor agora.') }
})
export const mpWebhook = onRequest({ ...options, secrets, cors: false, timeoutSeconds: 20 }, async (request, response) => {
  if (request.method !== 'POST') return response.sendStatus(405)
  const dataId = request.query['data.id']
  const requestId = request.get('x-request-id')
  const signature = request.get('x-signature')
  if (!verifyWebhook({ dataId, requestId, signature, secret: webhookSecret.value() })) return response.sendStatus(401)
  if (request.body?.type !== 'payment' || String(request.body?.data?.id) !== dataId) return response.sendStatus(400)
  const ref = db.doc('webhookEvents/' + hash([dataId, requestId, signature]))
  try {
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).exists) return
      tx.create(ref, { paymentId: dataId, state: 'pending', attempts: 0, createdAt: new Date(), nextAttemptAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000) })
    })
    return response.sendStatus(200)
  } catch { logger.error('webhook_persist_failed'); return response.sendStatus(503) }
})
export const processWebhook = onDocumentCreated({ ...options, secrets, document: 'webhookEvents/{eventId}', retry: true }, event => runtime().processor.webhookEvent(event.params.eventId))
export const processRefund = onDocumentCreated({ ...options, secrets, document: 'refundJobs/{jobId}', retry: true }, event => runtime().processor.refundJob(event.params.jobId))
export const processPrivacy = onDocumentCreated({ ...options, secrets, document: 'privacyRequests/{uid}', retry: true }, event => runtime().maintenance.privacy(event.params.uid))
export const reconcilePayments = onSchedule({ ...options, secrets, schedule: 'every 5 minutes', timeoutSeconds: 540, maxInstances: 1 }, () => runtime().processor.reconcile())
export const maintainData = onSchedule({ ...options, secrets, schedule: 'every 60 minutes', timeoutSeconds: 540, maxInstances: 1 }, () => runtime().maintenance.clean())
export const backupDatabase = onSchedule({ ...options, secrets, schedule: 'every 60 minutes', timeoutSeconds: 120, maxInstances: 1 }, () => runtime().maintenance.backup())
