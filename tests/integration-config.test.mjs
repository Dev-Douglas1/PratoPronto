import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { assertCurrentBackend } from '../src/config/backend.js'

test('legacy checkout configuration cannot silently switch payment servers', () => {
  assert.doesNotThrow(() => assertCurrentBackend({}))
  assert.doesNotThrow(() => assertCurrentBackend({ VITE_SECURE_ORDER_BACKEND: 'false' }))
  for (const value of ['true', 'TRUE', 'invalid']) {
    assert.throws(() => assertCurrentBackend({ VITE_SECURE_ORDER_BACKEND: value }), /Cloudflare/)
  }
})

test('secure rule generation preserves rules and rejects permissive order writes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pratopronto-rules-'))
  const script = resolve('scripts/build-secure-rules.mjs')
  const source = readFileSync('firestore.rules', 'utf8')
  try {
    writeFileSync(join(directory, 'firestore.rules'), source)
    let run = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(readFileSync(join(directory, 'firestore.secure.rules'), 'utf8'), source)
    rmSync(join(directory, 'firestore.secure.rules'))
    writeFileSync(join(directory, 'firestore.rules'), source.replace('match /orders/{orderId} {', 'match /orders/{orderId} {\n      allow create: if true;'))
    run = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' })
    assert.notEqual(run.status, 0)
    assert.throws(() => readFileSync(join(directory, 'firestore.secure.rules')))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('production configuration requires App Check and rejects development bypasses', () => {
  const env = {
    ...process.env,
    VITE_FIREBASE_API_KEY: 'fixture', VITE_FIREBASE_AUTH_DOMAIN: 'fixture.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'fixture', VITE_FIREBASE_STORAGE_BUCKET: 'fixture.appspot.com',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123', VITE_FIREBASE_APP_ID: 'fixture',
    VITE_CONTROLLER_NAME: 'PratoPronto', VITE_PRIVACY_EMAIL: 'teste@example.com',
    VITE_FIREBASE_APPCHECK_SITE_KEY: 'fixture', VITE_FIREBASE_APPCHECK_DEBUG: 'false',
    VITE_SECURE_ORDER_BACKEND: 'false', VITE_ENABLE_CARD_DEMO: 'false',
  }
  const run = values => spawnSync(process.execPath, ['scripts/check-production-env.mjs'], { env: { ...env, ...values }, encoding: 'utf8' })
  assert.equal(run({}).status, 0)
  for (const values of [
    { VITE_SECURE_ORDER_BACKEND: 'true' }, { VITE_FIREBASE_APPCHECK_DEBUG: 'true' },
    { VITE_ENABLE_CARD_DEMO: 'true' }, { VITE_FIREBASE_APPCHECK_SITE_KEY: '' },
  ]) assert.notEqual(run(values).status, 0)
})
