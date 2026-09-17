import test from 'node:test'
import assert from 'node:assert/strict'
import { identityClient, emailServiceUnavailable, IdentityError } from '../src/services/identity-client.js'
import { criarErroFirebase, traduzirErroFirebase } from '../src/utils/firebaseError.js'

test('sem App Check o fluxo para antes de chamar qualquer serviço de identidade', async () => {
  let requests = 0
  const client = identityClient({ verifyApp: async () => { throw emailServiceUnavailable() }, transport: async () => { requests++ } })
  for (const operation of [client.checkEmailService, () => client.call('appSendEmailCode'), () => client.call('appConfirmEmailCode', { code: '0042' })]) {
    await assert.rejects(operation, { code: 'identity/service-not-ready' })
  }
  assert.equal(requests, 0)
})
test('cadastro exige uma resposta positiva e compatível do serviço de e-mail', async () => {
  for (const response of [undefined, {}, { ready: false }, { ready: true, codeLength: 6 }, { ready: 'true', codeLength: 4 }]) {
    const client = identityClient({ verifyApp: async () => {}, transport: async () => response })
    await assert.rejects(client.checkEmailService, { code: 'identity/service-not-ready' })
  }
  const client = identityClient({ verifyApp: async () => {}, transport: async (name, data) => {
    assert.equal(name, 'appEmailServiceStatus')
    assert.deepEqual(data, {})
    return { ready: true, codeLength: 4 }
  } })
  await client.checkEmailService()
})
test('erro de serviço chega à mensagem vermelha sem virar erro de dados do cliente', async () => {
  const client = identityClient({ verifyApp: async () => {}, transport: async () => { throw { code: 'functions/not-found', message: 'private provider detail' } } })
  try { await client.checkEmailService(); assert.fail('deveria falhar') }
  catch (error) {
    assert.ok(error instanceof IdentityError)
    assert.match(traduzirErroFirebase(criarErroFirebase(error)), /empresa precisa ativar/)
    assert.doesNotMatch(traduzirErroFirebase(error), /private provider|Confira os dados/)
  }
})
test('código vencido e falha de conexão têm instruções diferentes', async () => {
  for (const [code, expected] of [['functions/failed-precondition', /expirou/], ['functions/internal', /conexão/]]) {
    const client = identityClient({ verifyApp: async () => {}, transport: async () => { throw { code } } })
    await assert.rejects(() => client.call('appConfirmEmailCode', { code: '0042' }), expected)
  }
})
