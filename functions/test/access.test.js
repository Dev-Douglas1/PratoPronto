import test from 'node:test'
import assert from 'node:assert/strict'
import { createDeliveryCode, deliveryCodeHash, normalizeCompanyId, roleCan, verifyDeliveryCode } from '../src/access.js'

test('membro da empresa pode operar pedidos e responder avaliacoes sem administrar equipe', () => {
  assert.equal(roleCan('member', 'orders:advance'), true)
  assert.equal(roleCan('member', 'reviews:reply'), true)
  assert.equal(roleCan('member', 'team:manage'), false)
  assert.equal(roleCan('pilot', 'orders:advance'), false)
  assert.equal(roleCan('pilot', 'pilot:deliver'), true)
})

test('codigo de entrega tem quatro digitos e e validado por hash', () => {
  const code = createDeliveryCode()
  assert.match(code, /^\d{4}$/)
  const hash = deliveryCodeHash('pedido-123', code)
  assert.equal(verifyDeliveryCode('pedido-123', code, hash), true)
  assert.equal(verifyDeliveryCode('pedido-123', code === '0000' ? '0001' : '0000', hash), false)
})

test('company id aceita slug seguro e rejeita caminhos', () => {
  assert.equal(normalizeCompanyId('Minha_Empresa'), 'minha_empresa')
  assert.throws(() => normalizeCompanyId('../outra'))
})
