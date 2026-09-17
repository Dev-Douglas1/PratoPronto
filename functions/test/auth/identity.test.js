import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp as clientApp, deleteApp as deleteClient } from 'firebase/app'
import { initializeAuth, inMemoryPersistence, connectAuthEmulator, createUserWithEmailAndPassword, reload, getIdTokenResult, applyActionCode, signOut, signInWithEmailAndPassword } from 'firebase/auth'
import { identityService } from '../../src/identity.js'
import { startPrivateSession } from '../../../src/services/auth-session.js'
import { registerPendingAccount } from '../../../src/services/registration.js'
import { refreshEmailVerification, sendVerificationLink } from '../../../src/services/email-verification.js'

for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[key] || '')) throw new Error('Exige emuladores locais; não executar em produção.')
}
// The script runs suites sequentially so both use the Auth emulator's project.
const projectId = 'demo-pratopronto'
let app, db, auth, service, clock, mail, messages, code, actor
before(() => { app = initializeApp({ projectId }, 'identity'); db = getFirestore(app); auth = getAuth(app) })
after(async () => { await db.terminate(); await deleteApp(app) })
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' })
  clock = new Date(); code = '0042'; messages = []
  mail = { send: async data => { messages.push(data) } }
  await auth.createUser({ uid: 'ana', email: 'ana@example.test', password: 'TestingOnlyPassword123', emailVerified: false })
  actor = { uid: 'ana', email: 'ana@example.test', auth_time: Math.floor(clock.getTime() / 1000) }
  service = identityService({ db, authAdmin: auth, mail, secret: 'test-only-secret-32-characters-long', now: () => clock, generateCode: () => code })
})
const send = () => service.sendCode(actor)
const confirm = value => service.confirmCode(actor, { code: value })

const emailLinks = async email => {
  const result = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/oobCodes`)
  assert.equal(result.ok, true)
  return (await result.json()).oobCodes.filter(item => item.email === email && item.requestType === 'VERIFY_EMAIL')
}

test('cadastro envia link nativo sem Resend; só confirmar no Firebase atualiza a permissão', async () => {
  const client = clientApp({ apiKey: 'fake-emulator-key', projectId }, 'registration-link')
  const clientAuth = initializeAuth(client, { persistence: inMemoryPersistence })
  connectAuthEmulator(clientAuth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true })
  const data = { nome: 'Bia', telefone: '41999999999', email: 'bia@example.test', senha: 'TestingOnlyPassword123' }
  try {
    const user = await registerPendingAccount({ auth: clientAuth, data, saveProfile: async user => {
      assert.equal(user.emailVerified, false)
      await db.doc('users/' + user.uid).set({ nome: data.nome, email: user.email })
    } })
    assert.equal((await auth.getUser(user.uid)).emailVerified, false)
    const profile = (await db.doc('users/' + user.uid).get()).data()
    assert.deepEqual(profile, { nome: data.nome, email: data.email })
    assert.equal((await sendVerificationLink(clientAuth)).sent, true)
    assert.equal(clientAuth.languageCode, 'pt-BR')
    assert.equal(messages.length, 0, 'o Resend não deve enviar a confirmação')
    const links = await emailLinks(data.email)
    assert.equal(links.length, 1)
    assert.equal(await refreshEmailVerification(clientAuth), false, 'o botão sozinho não confirma a conta')
    assert.equal((await getIdTokenResult(user)).claims.email_verified, false)
    await applyActionCode(clientAuth, links[0].oobCode)
    assert.equal(await refreshEmailVerification(clientAuth), true)
    assert.equal((await getIdTokenResult(user)).claims.email_verified, true)
    assert.deepEqual(await sendVerificationLink(clientAuth), { verified: true, sent: false })
    assert.equal((await emailLinks(data.email)).length, 0, 'link consumido e nenhum novo envio para conta já verificada')
    await signOut(clientAuth)
    await signInWithEmailAndPassword(clientAuth, data.email, data.senha)
    assert.equal(await refreshEmailVerification(clientAuth), true, 'login posterior preserva a confirmação')
  } finally { await deleteClient(client) }
})
test('falha ao salvar perfil desfaz a conta recém-criada e não deixa sessão ativa', async () => {
  const client = clientApp({ apiKey: 'fake-emulator-key', projectId }, 'registration-rollback')
  const clientAuth = initializeAuth(client, { persistence: inMemoryPersistence })
  connectAuthEmulator(clientAuth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true })
  const data = { nome: 'Bia', telefone: '41999999999', email: 'bia@example.test', senha: 'TestingOnlyPassword123' }
  try {
    await assert.rejects(() => registerPendingAccount({ auth: clientAuth, data, saveProfile: async () => { throw new Error('profile-write-failed') } }), /profile-write-failed/)
    assert.equal(clientAuth.currentUser, null)
    await assert.rejects(() => auth.getUserByEmail(data.email), { code: 'auth/user-not-found' })
  } finally { await deleteClient(client) }
})

test('link inválido, de outra conta ou já consumido não libera a conta atual', async () => {
  const client = clientApp({ apiKey: 'fake-emulator-key', projectId }, 'link-ownership')
  const clientAuth = initializeAuth(client, { persistence: inMemoryPersistence })
  connectAuthEmulator(clientAuth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true })
  try {
    const first = (await createUserWithEmailAndPassword(clientAuth, 'primeira@example.test', 'TestingOnlyPassword123')).user
    await sendVerificationLink(clientAuth)
    const [link] = await emailLinks(first.email)
    await signOut(clientAuth)
    const second = (await createUserWithEmailAndPassword(clientAuth, 'segunda@example.test', 'TestingOnlyPassword123')).user
    await assert.rejects(() => applyActionCode(clientAuth, 'invalid-test-link'), { code: 'auth/invalid-action-code' })
    assert.equal(await refreshEmailVerification(clientAuth), false)
    await applyActionCode(clientAuth, link.oobCode)
    assert.equal((await auth.getUser(first.uid)).emailVerified, true)
    assert.equal(await refreshEmailVerification(clientAuth), false)
    assert.equal((await getIdTokenResult(second)).claims.email_verified, false)
    await assert.rejects(() => applyActionCode(clientAuth, link.oobCode), { code: 'auth/invalid-action-code' })
  } finally { await deleteClient(client) }
})

test('sessão encerrada ou conta desativada não anuncia envio nem confirmação', async () => {
  const client = clientApp({ apiKey: 'fake-emulator-key', projectId }, 'link-failure')
  const clientAuth = initializeAuth(client, { persistence: inMemoryPersistence })
  connectAuthEmulator(clientAuth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true })
  try {
    await assert.rejects(() => sendVerificationLink(clientAuth), { code: 'auth/user-token-expired' })
    const user = (await createUserWithEmailAndPassword(clientAuth, 'falha@example.test', 'TestingOnlyPassword123')).user
    await auth.updateUser(user.uid, { disabled: true })
    await assert.rejects(() => sendVerificationLink(clientAuth))
    assert.equal((await emailLinks(user.email)).length, 0)
    assert.equal((await auth.getUser(user.uid)).emailVerified, false)
    await signOut(clientAuth)
    await assert.rejects(() => refreshEmailVerification(clientAuth), { code: 'auth/user-token-expired' })
  } finally { await deleteClient(client) }
})

test('conta permanece bloqueada antes do código; apenas o destinatário recebe os quatro números', async () => {
  assert.equal((await auth.getUser('ana')).emailVerified, false)
  const result = await send()
  assert.equal(result.sent, true)
  assert.equal(result.code, undefined)
  assert.equal(messages[0].to, actor.email)
  assert.match(messages[0].text, /0042/)
  const challenge = (await db.doc('emailChallenges/ana').get()).data()
  assert.equal(challenge.code, undefined)
  assert.match(challenge.digest, /^[a-f0-9]{64}$/)
  assert.equal((await auth.getUser('ana')).emailVerified, false)
  await confirm('0042')
  assert.equal((await auth.getUser('ana')).emailVerified, true)
  assert.equal((await db.doc('emailChallenges/ana').get()).data().digest, null)
})
test('envio com erro não anuncia sucesso nem permite ativar a conta', async () => {
  mail.send = async () => { throw new Error('provider rejected') }
  await assert.rejects(send, /não foi enviado/)
  assert.equal((await auth.getUser('ana')).emailVerified, false)
  assert.equal((await db.doc('emailChallenges/ana').get()).data().state, 'failed')
  await assert.rejects(() => confirm('0042'), /expirou|usado/)
})
test('código consumido e e-mail alterado não reutilizam a confirmação', async () => {
  await send(); await confirm('0042')
  await auth.updateUser('ana', { emailVerified: false })
  await assert.rejects(() => confirm('0042'), /expirou|usado/)
  clock = new Date(clock.getTime() + 61000); await send()
  await auth.updateUser('ana', { email: 'mudou@example.test', emailVerified: false })
  await assert.rejects(() => confirm('0042'), /novamente/)
  await assert.rejects(() => service.confirmCode({ ...actor, email: 'mudou@example.test' }, { code: '0042' }), /expirou|usado/)
  assert.equal((await auth.getUser('ana')).emailVerified, false)
})
test('código incorreto consome tentativa; reenviar não reinicia as tentativas', async () => {
  await send()
  for (let i = 0; i < 3; i++) await assert.rejects(() => confirm('9999'), /incorreto/)
  clock = new Date(clock.getTime() + 61000)
  code = '1234'; await send()
  for (let i = 0; i < 2; i++) await assert.rejects(() => confirm('9999'), /incorreto/)
  await assert.rejects(() => confirm('1234'), /Limite/)
  clock = new Date(clock.getTime() + 61000)
  await assert.rejects(send, /Limite/)
  assert.equal((await auth.getUser('ana')).emailVerified, false)
})
test('expiração e substituição invalidam o código antigo; aguardar uma hora libera novo envio', async () => {
  await send()
  await assert.rejects(send, /um minuto/)
  clock = new Date(clock.getTime() + 61000); code = '5555'; await send()
  await assert.rejects(() => confirm('0042'), /incorreto/)
  clock = new Date(clock.getTime() + 10 * 60000)
  await assert.rejects(() => confirm('5555'), /expirou/)
  clock = new Date(clock.getTime() + 60 * 60000); actor.auth_time = Math.floor(clock.getTime() / 1000)
  code = '1000'; await send(); await confirm('1000')
  assert.equal((await auth.getUser('ana')).emailVerified, true)
})
test('requisições concorrentes não duplicam envio nem ultrapassam cinco palpites', async () => {
  const sent = await Promise.allSettled([send(), send(), send()])
  assert.equal(sent.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(messages.length, 1)
  const guesses = await Promise.allSettled(Array.from({ length: 10 }, () => confirm('7777')))
  assert.ok(guesses.every(result => result.status === 'rejected'))
  const limit = (await db.collection('emailCodeLimits').get()).docs[0].data()
  assert.equal(limit.failures, 5)
})
test('recriar a conta com o mesmo e-mail não contorna limites; código não confirma outra conta', async () => {
  await send()
  await auth.createUser({ uid: 'bia', email: 'bia@example.test', password: 'TestingOnlyPassword123' })
  await assert.rejects(() => service.confirmCode({ ...actor, uid: 'bia', email: 'bia@example.test' }, { code: '0042' }))
  await auth.deleteUser('ana')
  await auth.createUser({ uid: 'outra', email: actor.email, password: 'TestingOnlyPassword123' })
  const recreated = await auth.getUser('outra')
  const currentSession = { ...actor, uid: 'outra', auth_time: Math.ceil(new Date(recreated.tokensValidAfterTime).getTime() / 1000) }
  await assert.rejects(() => service.sendCode(currentSession), /um minuto/)
  await assert.rejects(() => service.confirmCode({ ...actor, uid: 'outra' }, { code: '0042' }))
})
test('aviso exige conta verificada; uma sessão gera só uma mensagem e não outro código', async () => {
  await assert.rejects(() => service.loginNotice(actor), /Confirme/)
  await send(); await confirm('0042'); messages = []
  await Promise.all([service.loginNotice(actor, { device: 'Chrome/100 Android' }), service.loginNotice(actor, { device: 'Chrome/100 Android' })])
  const jobs = await db.collection('loginEmailJobs').get()
  assert.equal(jobs.size, 1)
  await service.deliverLoginNotice(jobs.docs[0].id)
  await service.deliverLoginNotice(jobs.docs[0].id)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].to, actor.email)
  assert.match(messages[0].subject, /Novo acesso/)
  assert.match(messages[0].text, /Android/)
  assert.doesNotMatch(messages[0].text, /0042/)
  const sessionTooOld = { ...actor, auth_time: actor.auth_time - 3600 }
  await assert.rejects(() => service.loginNotice(sessionTooOld), /novamente/)
})
test('erro do provedor preserva aviso para nova tentativa sem trocar a chave de envio', async () => {
  await auth.updateUser('ana', { emailVerified: true })
  await service.loginNotice(actor)
  const id = (await db.collection('loginEmailJobs').get()).docs[0].id
  mail.send = async data => { messages.push(data); throw new Error('timeout after acceptance') }
  await assert.rejects(() => service.deliverLoginNotice(id))
  mail.send = async data => { messages.push(data) }
  await service.deliverLoginNotice(id)
  assert.equal(messages[0].key, messages[1].key)
  assert.equal((await db.doc('loginEmailJobs/' + id).get()).data().state, 'sent')
})
test('SDK atualiza confirmação real e inicialização segura remove uma sessão anterior', async () => {
  const config = { apiKey: 'fake-emulator-key', projectId }
  let client = clientApp(config, 'session')
  let clientAuth = initializeAuth(client, { persistence: inMemoryPersistence })
  connectAuthEmulator(clientAuth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true })
  try {
    const { user } = await createUserWithEmailAndPassword(clientAuth, 'nova@example.test', 'TestingOnlyPassword123')
    const claims = (await getIdTokenResult(user)).claims
    assert.equal(claims.email_verified, false)
    const context = { ...claims, uid: user.uid }
    await service.sendCode(context)
    await service.confirmCode(context, { code: '0042' })
    await reload(user)
    assert.equal(user.emailVerified, true)
    assert.equal((await getIdTokenResult(user, true)).claims.email_verified, true)
    await deleteClient(client)
    client = clientApp(config, 'session')
    clientAuth = initializeAuth(client, { persistence: inMemoryPersistence })
    connectAuthEmulator(clientAuth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true })
    await startPrivateSession(clientAuth)
    await clientAuth.authStateReady()
    assert.equal(Boolean(clientAuth.currentUser), false)
  } finally { await deleteClient(client) }
})
