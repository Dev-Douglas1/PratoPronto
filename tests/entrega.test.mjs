import test from 'node:test'
import assert from 'node:assert/strict'
import { estimarEntrega } from '../src/utils/entrega.js'

const user = { cidade: 'Colombo', uf: 'PR', bairro: 'São João' }
const store = { address: { cidade: 'Colombo', uf: 'PR' }, zones: [{ bairro: 'São João', feeCents: 500, freeAboveCents: 10000 }] }

test('abrir sem login e antes da loja carregar não derruba o aplicativo', () => {
  for (const [s, u] of [[null, null], [undefined, undefined], [store, null], [null, user], [{}, {}], [{ address: {} }, user]]) {
    assert.equal(estimarEntrega(s, u, 0), null)
  }
})
test('endereço incompleto, fora da área ou configuração inválida deixa entrega a confirmar', () => {
  for (const u of [{}, { ...user, bairro: '' }, { ...user, uf: 'SC' }, { ...user, cidade: 'Curitiba' }]) assert.equal(estimarEntrega(store, u, 60), null)
  for (const zones of [null, [], [null], [{ bairro: user.bairro, feeCents: -1 }], [{ bairro: user.bairro, feeCents: '500' }]]) assert.equal(estimarEntrega({ ...store, zones }, user, 60), null)
})
test('frete estimado aceita endereço normalizado e respeita limite de entrega grátis', () => {
  assert.equal(estimarEntrega(store, { ...user, uf: 'pr', bairro: ' sao joao ' }, 99.99), 5)
  assert.equal(estimarEntrega(store, user, 100), 0)
  assert.equal(estimarEntrega({ ...store, zones: [{ ...store.zones[0], freeAboveCents: null }] }, user, 100), 5)
})
