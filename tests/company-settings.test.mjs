import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCompanySettings } from '../src/shared/company-settings.js'

const valid = () => ({
  name: 'Restaurante Central',
  legalName: 'Douglas de Souza',
  phone: '41999999999',
  privacyEmail: 'privacidade@example.com',
  address: { endereco: 'Rua A', numero: '10', bairro: 'Centro', complemento: '', cep: '83415235', cidade: 'Colombo', uf: 'PR' },
  timezone: 'America/Sao_Paulo',
  estimateMinutes: 45,
  retentionDays: 90,
  acceptingOrders: true,
  methods: ['maquina_entrega'],
  hours: Array.from({ length: 7 }, () => [{ start: 540, end: 1080 }]),
  zones: [{ bairro: 'Centro', fee: '5.50', min: '20', freeAbove: '100' }],
})

test('valida e normaliza configurações válidas da empresa', () => {
  const result = validateCompanySettings(valid())
  assert.equal(result.phone, '41999999999')
  assert.equal(result.address.cep, '83415235')
  assert.deepEqual(result.methods, ['maquina_entrega'])
  assert.equal(result.zones[0].feeCents, 550)
  assert.equal(result.zones[0].minCents, 2000)
  assert.equal(result.zones[0].freeAboveCents, 10000)
})

test('rejeita horários invertidos e intervalos sobrepostos', () => {
  const inverted = valid()
  inverted.hours[1] = [{ start: 900, end: 600 }]
  assert.throws(() => validateCompanySettings(inverted), /horários de segunda-feira/)
  const overlap = valid()
  overlap.hours[2] = [{ start: 540, end: 800 }, { start: 700, end: 900 }]
  assert.throws(() => validateCompanySettings(overlap), /não podem se sobrepor/)
})

test('rejeita bairros duplicados ignorando caixa e acentos', () => {
  const form = valid()
  form.zones.push({ bairro: 'centro', fee: 4, min: 0, freeAbove: '' })
  assert.throws(() => validateCompanySettings(form), /bairros duplicados/)
})

test('rejeita CEP, telefone, taxa e limites operacionais inválidos', () => {
  const form = valid()
  form.address.cep = '123'
  form.phone = '123'
  form.zones[0].fee = -1
  form.estimateMinutes = 5
  assert.throws(() => validateCompanySettings(form), /telefone válido/)
})
