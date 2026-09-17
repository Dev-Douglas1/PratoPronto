import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { produtos, tamanhos, bordas } from '../src/data/produtos.js'
import { productPrice } from '../src/utils/productPrice.js'
import { priceOrder } from '../functions/src/domain.js'
import { OFFENSIVE_PATTERN } from '../functions/src/input-policy.js'
import { fixedNow, profile, settings } from '../functions/test/fixtures.js'
import { companyTabState, initialSources, accessError } from '../src/utils/dataAccess.js'

test('preços exibidos de bebidas e pizzas coincidem com o cálculo de compra', () => {
  const promocao = { titulo: 'Oferta de teste', percentual: 23, inicio: +fixedNow - 1, fim: +fixedNow + 60000, ativa: true }
  for (const base of produtos) {
    const options = base.personalizavel ? tamanhos.flatMap(t => bordas.map(b => ({ tamanho: t.id, borda: b.id, extras: ['bacon'] }))) : [{}]
    for (const opcoes of options) {
      const display = productPrice({ ...base, promocao }, opcoes, +fixedNow)
      const trusted = priceOrder({ items: [{ id: base.id, quantidade: 1, opcoes }], delivery: profile, settings: settings(), now: fixedNow, productSettings: { [base.id]: { promocao } } })
      assert.equal(display.preco, trusted.itens[0].precoUnitario, base.id)
      assert.equal(display.precoOriginal, trusted.itens[0].precoOriginal)
    }
  }
})
test('filtro do banco acompanha a mesma lista de moderação do app', async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
  assert.ok(rules.includes(JSON.stringify('(?is).*' + OFFENSIVE_PATTERN + '.*')))
})

test('falha de permissão em uma coleção não bloqueia outras áreas da empresa', () => {
  const sources = initialSources(true)
  sources.reviews = { loading: false, error: accessError({ code: 'permission-denied' }, 'avaliações', true), fromCache: true }
  assert.deepEqual(companyTabState(sources, 'pedidos'), { loading: false, error: '', fromCache: false })
  assert.match(companyTabState(sources, 'avaliacoes').error, /Firebase recusou a leitura de avaliações/)
  sources.orders = { loading: false, error: accessError({ code: 'permission-denied' }, 'pedidos', true), fromCache: true }
  assert.match(companyTabState(sources, 'pedidos').error, /pedidos/)
  assert.match(companyTabState(sources, 'atendimento').error, /pedidos/)
  assert.deepEqual(companyTabState(sources, 'configuracoes'), { loading: false, error: '', fromCache: false })
})
