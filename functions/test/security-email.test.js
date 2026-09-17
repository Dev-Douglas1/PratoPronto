import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailServiceStatus, securityEmail } from '../src/security-email.js'
import { generateEmailCode, deviceLabel } from '../src/identity.js'

test('gera quatro dígitos e não conserva dados arbitrários do navegador', () => {
  for (let i = 0; i < 25; i++) assert.match(generateEmailCode(), /^\d{4}$/)
  assert.equal(deviceLabel('<script>segredo</script>'), 'navegador em dispositivo não identificado')
})
test('transporta e-mail somente ao provedor fixo com remetente configurado e chave de idempotência', async () => {
  let request
  const mail = securityEmail({ apiKey: 'test', from: 'PratoPronto <security@example.test>', fetcher: async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ id: 'message-test' }) } } })
  await mail.send({ to: 'ana@example.test', subject: 'Confirmação', text: 'Código 0042', key: 'verification/test' })
  assert.equal(request.url, 'https://api.resend.com/emails')
  assert.equal(request.options.headers['Idempotency-Key'], 'verification/test')
  assert.deepEqual(JSON.parse(request.options.body).to, ['ana@example.test'])
})
test('sem configuração ou com erro não relata envio e não revela resposta do provedor', async () => {
  await assert.rejects(() => securityEmail({}).send({}), /não foi ativado/)
  await assert.rejects(() => securityEmail({ apiKey: 'test', from: 'security@example.test', fetcher: async () => ({ ok: false, json: async () => ({ sensitive: 'secret' }) }) }).send({}), error => !error.message.includes('secret') && error.code === 'unavailable')
})
test('consulta antes do cadastro rejeita configuração incompleta e não divulga segredos', () => {
  const config = { apiKey: 'test-provider-secret', from: 'PratoPronto <security@example.test>', secret: 'test-only-secret-32-characters-long' }
  for (const field of ['apiKey', 'from', 'secret']) {
    assert.throws(() => emailServiceStatus({ ...config, [field]: '' }), { code: 'failed-precondition' })
  }
  assert.throws(() => emailServiceStatus({ ...config, from: 'security@example.test\nBcc: person@example.test' }), { code: 'failed-precondition' })
  assert.deepEqual(emailServiceStatus(config), { ready: true, codeLength: 4 })
})
