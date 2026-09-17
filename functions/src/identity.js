import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { DomainError, requireThat } from './domain.js'

const MINUTE = 60000
const HOUR = 60 * MINUTE
const millis = value => value?.toMillis?.() ?? new Date(value || 0).getTime()
export const generateEmailCode = () => String(randomInt(0, 10000)).padStart(4, '0')
const limited = () => new DomainError('resource-exhausted', 'Limite de tentativas atingido. Aguarde uma hora antes de solicitar outro código.')

export function identityService({ db, authAdmin, mail, secret, now = () => new Date(), generateCode = generateEmailCode }) {
  function digest(value) {
    requireThat(typeof secret === 'string' && secret.length >= 32, 'A confirmação de e-mail ainda está sendo configurada pela empresa.', 'failed-precondition')
    return createHmac('sha256', secret).update(JSON.stringify(value)).digest('hex')
  }
  async function account(context, verified = false) {
    requireThat(context?.uid && context.email && Number.isFinite(context.auth_time), 'Entre novamente para confirmar seu e-mail.', 'unauthenticated')
    const user = await authAdmin.getUser(context.uid)
    requireThat(!user.disabled && user.email === context.email && context.auth_time * 1000 >= millis(user.tokensValidAfterTime), 'Entre novamente para continuar.', 'unauthenticated')
    requireThat(!verified || user.emailVerified, 'Confirme seu e-mail antes de entrar no aplicativo.', 'permission-denied')
    return user
  }
  function recent(context) {
    const age = now().getTime() - context.auth_time * 1000
    requireThat(age >= -MINUTE && age <= 15 * MINUTE, 'Entre novamente com sua senha para continuar.', 'unauthenticated')
  }

  async function sendCode(context) {
    const user = await account(context)
    recent(context)
    if (user.emailVerified) return { verified: true }
    const time = now()
    const emailHash = digest(['email', user.email.toLowerCase()])
    const limitRef = db.doc('emailCodeLimits/' + emailHash)
    const ref = db.doc('emailChallenges/' + user.uid)
    const code = generateCode()
    const challengeId = randomUUID()
    const expiresAt = new Date(time.getTime() + 10 * MINUTE)
    await db.runTransaction(async tx => {
      const old = (await tx.get(limitRef)).data() || {}
      const limit = millis(old.windowStart) > time.getTime() - HOUR ? old : { windowStart: time, issued: 0, failures: 0 }
      if (limit.issued >= 5 || limit.failures >= 5) throw limited()
      requireThat(millis(old.lastSentAt) <= time.getTime() - MINUTE, 'Aguarde um minuto antes de solicitar outro código.', 'resource-exhausted')
      tx.set(limitRef, { ...limit, issued: limit.issued + 1, lastSentAt: time, expiresAt: new Date(time.getTime() + 2 * HOUR) })
      tx.set(ref, { challengeId, emailHash, digest: digest([user.uid, emailHash, challengeId, code]), state: 'sending', attempts: 0, createdAt: time, expiresAt })
    })
    try {
      await mail.send({ to: user.email, subject: 'Confirme seu cadastro no PratoPronto',
        text: `Seu código do PratoPronto é: ${code}\n\nDigite os 4 números no aplicativo. O código vale por 10 minutos e só pode ser usado uma vez. Não o compartilhe.\n\nSe você não solicitou este cadastro, ignore esta mensagem. A conta não será liberada sem a confirmação.`,
        key: 'verify/' + challengeId })
    } catch (error) {
      await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data()
        if (current?.challengeId === challengeId) tx.update(ref, { state: 'failed', digest: null })
      })
      throw error instanceof DomainError ? error : new DomainError('unavailable', 'O e-mail não foi enviado. Aguarde um minuto e solicite outro código.')
    }
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data()
      requireThat(current?.challengeId === challengeId && current.state === 'sending', 'Este código foi substituído. Use o e-mail mais recente.', 'failed-precondition')
      tx.update(ref, { state: 'active' })
    })
    return { sent: true, expiresAt: expiresAt.toISOString(), retryAfterSeconds: 60 }
  }

  async function confirmCode(context, { code } = {}) {
    const user = await account(context)
    if (user.emailVerified) return { verified: true }
    requireThat(typeof code === 'string' && /^\d{4}$/.test(code), 'Digite os 4 números recebidos por e-mail.')
    const time = now()
    const emailHash = digest(['email', user.email.toLowerCase()])
    const ref = db.doc('emailChallenges/' + user.uid)
    const limitRef = db.doc('emailCodeLimits/' + emailHash)
    const accepted = await db.runTransaction(async tx => {
      const [challengeSnap, limitSnap] = await Promise.all([tx.get(ref), tx.get(limitRef)])
      const challenge = challengeSnap.data()
      const limit = limitSnap.data() || {}
      if (millis(limit.windowStart) > time.getTime() - HOUR && limit.failures >= 5) throw limited()
      requireThat(challenge?.emailHash === emailHash && challenge.state === 'active' && millis(challenge.expiresAt) > time.getTime(), 'O código expirou ou já foi usado. Solicite um novo.', 'failed-precondition')
      const candidate = digest([user.uid, emailHash, challenge.challengeId, code])
      const correct = typeof challenge.digest === 'string' && challenge.digest.length === candidate.length && timingSafeEqual(Buffer.from(challenge.digest), Buffer.from(candidate))
      if (!correct) {
        const failures = (limit.failures || 0) + 1
        tx.set(limitRef, { ...limit, failures }, { merge: true })
        tx.update(ref, { attempts: challenge.attempts + 1, ...(failures >= 5 ? { state: 'locked', digest: null } : {}) })
        return false // Commit the failed attempt; throwing inside would roll it back.
      }
      tx.update(ref, { state: 'consumed', digest: null, consumedAt: time })
      return true
    })
    requireThat(accepted, 'Código incorreto. Confira os 4 números no último e-mail recebido.', 'invalid-argument')
    // Bind the verified flag to the exact address that received this code, even
    // if another request changes the account's email while confirmation runs.
    await authAdmin.updateUser(user.uid, { email: user.email, emailVerified: true })
    return { verified: true }
  }

  async function loginNotice(context, { device = '' } = {}) {
    const user = await account(context, true)
    recent(context)
    const time = now()
    const deviceName = deviceLabel(device)
    const id = digest(['login', user.uid, context.auth_time, deviceName])
    const ref = db.doc('loginEmailJobs/' + id)
    const limitRef = db.doc('loginEmailLimits/' + digest(['email', user.email.toLowerCase()]))
    const result = await db.runTransaction(async tx => {
      const [job, limitSnap] = await Promise.all([tx.get(ref), tx.get(limitRef)])
      if (job.exists) return { queued: true }
      const old = limitSnap.data() || {}
      const limit = millis(old.windowStart) > time.getTime() - HOUR ? old : { windowStart: time, count: 0 }
      requireThat(limit.count < 10, 'Limite de avisos de login atingido. O próximo aviso poderá ser enviado em uma hora.', 'resource-exhausted')
      tx.set(limitRef, { ...limit, count: limit.count + 1, expiresAt: new Date(time.getTime() + 2 * HOUR) })
      tx.create(ref, { uid: user.uid, email: user.email, device: deviceName, loginAt: new Date(context.auth_time * 1000), createdAt: time, expiresAt: new Date(time.getTime() + 7 * 24 * HOUR), state: 'pending', attempts: 0 })
      return { queued: true }
    })
    return result
  }

  async function deliverLoginNotice(id) {
    const ref = db.doc('loginEmailJobs/' + id)
    const job = await db.runTransaction(async tx => {
      const item = (await tx.get(ref)).data()
      if (!item || ['sent', 'failed', 'cancelled'].includes(item.state)) return null
      requireThat(millis(item.leaseUntil) <= now().getTime(), 'Envio em andamento.', 'unavailable')
      // Retry only inside the provider's 24-hour idempotency window.
      if (item.attempts >= 5 || millis(item.createdAt) + 23 * HOUR <= now().getTime()) { tx.update(ref, { state: 'failed' }); return null }
      tx.update(ref, { state: 'sending', leaseUntil: new Date(now().getTime() + MINUTE), attempts: item.attempts + 1 })
      return item
    })
    if (!job) return
    try {
      const user = await authAdmin.getUser(job.uid)
      if (!user.emailVerified || user.disabled || user.email !== job.email) { await ref.update({ state: 'cancelled', leaseUntil: null }); return }
      const date = new Date(millis(job.loginAt)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      await mail.send({ to: job.email, subject: 'Novo acesso à sua conta PratoPronto',
        text: `Sua conta cadastrada no PratoPronto foi acessada em ${date} (horário de Brasília).\nDispositivo informado pelo navegador: ${job.device}.\n\nSe foi você, não precisa fazer nada. Se não reconhece esse acesso, abra o PratoPronto pelo endereço que você costuma usar, escolha “Esqueci minha senha” e altere a senha. Não compartilhe sua senha nem códigos de verificação.`, key: 'login/' + id })
      await ref.update({ state: 'sent', sentAt: now(), leaseUntil: null })
    } catch (error) {
      await ref.update({ state: job.attempts + 1 >= 5 ? 'failed' : 'pending', leaseUntil: null })
      throw error
    }
  }
  return { sendCode, confirmCode, loginNotice, deliverLoginNotice }
}

// Do not store a full user-agent, IP, precise location or arbitrary client text.
export function deviceLabel(userAgent = '') {
  const ua = String(userAgent).slice(0, 500)
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'dispositivo não identificado'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'navegador'
  return `${browser} em ${os}`
}
