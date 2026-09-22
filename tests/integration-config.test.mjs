import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { assertCurrentBackend } from '../src/config/backend.js'
import { validateCep, validatePassword } from '../src/shared/input-policy.js'

const valid = {
  VITE_SUPABASE_URL: 'https://fixture.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
}

test('backend exige URL HTTPS do Supabase e chave publishable', () => {
  assert.doesNotThrow(() => assertCurrentBackend(valid))
  assert.throws(() => assertCurrentBackend({}), /Supabase/)
  assert.throws(() => assertCurrentBackend({ ...valid, VITE_SUPABASE_URL: 'http://fixture.supabase.co' }), /HTTPS/)
  assert.throws(() => assertCurrentBackend({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: 'service_role_secret' }), /publishable/)
})

test('produção exige somente configuração pública do Supabase', () => {
  const env = {
    ...process.env,
    ...valid,
    VITE_CONTROLLER_NAME: 'PratoPronto',
    VITE_PRIVACY_EMAIL: 'teste@example.com',
    VITE_ENABLE_CARD_DEMO: 'false',
  }
  const run = values => spawnSync(process.execPath, ['scripts/check-production-env.mjs'], { env: { ...env, ...values }, encoding: 'utf8' })
  assert.equal(run({}).status, 0)
  assert.notEqual(run({ VITE_SUPABASE_URL: '' }).status, 0)
  assert.notEqual(run({ VITE_SUPABASE_PUBLISHABLE_KEY: '' }).status, 0)
  assert.notEqual(run({ VITE_ENABLE_CARD_DEMO: 'true' }).status, 0)
})


test('senha local acompanha os requisitos fortes configurados no Supabase', () => {
  assert.equal(validatePassword('PratoPronto1!'), 'PratoPronto1!')
  assert.throws(() => validatePassword('pratopronto1!'), /maiúscula/)
  assert.throws(() => validatePassword('PRATOPRONTO1!'), /minúscula/)
  assert.throws(() => validatePassword('PratoPronto!!'), /número/)
  assert.throws(() => validatePassword('PratoPronto12'), /símbolo/)
})

test('CEP exige exatamente oito números', () => {
  assert.equal(validateCep('83415235'), '83415235')
  assert.equal(validateCep('83415-235'), '83415235')
  assert.throws(() => validateCep('000000001'), /8 números/)
  assert.throws(() => validateCep('1234567'), /8 números/)
})
