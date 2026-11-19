import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCompanyPaymentSettings, validateCompanyPaymentSettings } from '../src/shared/company-payment-settings.js'

test('normaliza métodos duplicados e remove métodos desconhecidos', () => {
  const value = normalizeCompanyPaymentSettings({ methods: ['pix_manual', 'pix_manual', 'maquina_entrega', 'fake'] })
  assert.deepEqual(value.methods, ['pix_manual', 'maquina_entrega'])
})

test('exige chave Pix, tipo e titular quando Pix manual está habilitado', () => {
  assert.throws(() => validateCompanyPaymentSettings({ methods: ['pix_manual'] }), /chave Pix/)
  assert.throws(() => validateCompanyPaymentSettings({ methods: ['pix_manual'], pixKeyType: 'cpf', pixKey: '123', pixHolderName: 'Loja', pixHolderDocument: '123' }), /CPF ou CNPJ/)
  assert.doesNotThrow(() => validateCompanyPaymentSettings({ methods: ['pix_manual'], pixKeyType: 'email', pixKey: 'loja@example.com', pixHolderName: 'Loja Exemplo', pixHolderDocument: '12345678901' }))
})

test('não permite salvar sem nenhum meio de pagamento', () => {
  assert.throws(() => validateCompanyPaymentSettings({ methods: [] }), /pelo menos um/)
})

test('dados bancários parciais são rejeitados e não normalizam conta incompleta como válida', () => {
  assert.throws(() => validateCompanyPaymentSettings({ methods: ['cash_delivery'], bankName: 'Banco Exemplo' }), /preencha todos/)
  assert.doesNotThrow(() => validateCompanyPaymentSettings({ methods: ['cash_delivery'] }))
})
