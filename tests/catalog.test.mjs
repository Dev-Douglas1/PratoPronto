import test from 'node:test'
import assert from 'node:assert/strict'
import { produtos, tamanhos, bordas } from '../src/data/produtos.js'
import { productPrice } from '../src/utils/productPrice.js'
import { OFFENSIVE_PATTERN, hasOffensiveLanguage } from '../src/shared/input-policy.js'
import { companyTabState, initialSources, accessError } from '../src/utils/dataAccess.js'
import { isMainDish, isPizza, isBeverage, isDessert, productCategoryLabel } from '../src/shared/catalog-category.js'
import { isValidFutureDate } from '../src/shared/pilot-validation.js'

test('preço exibido aplica personalização e promoção em centavos', () => {
  const now = Date.now()
  const promocao = { titulo: 'Oferta de teste', percentual: 20, inicio: now - 1000, fim: now + 60000, ativa: true }
  const pizza = produtos.find(item => item.personalizavel)
  for (const tamanho of tamanhos) {
    for (const borda of bordas) {
      const value = productPrice({ ...pizza, promocao }, { tamanho: tamanho.id, borda: borda.id, extras: ['bacon'] }, now)
      assert.ok(value.preco > 0)
      assert.ok(value.preco < value.precoOriginal)
    }
  }
})

test('moderação compartilhada detecta variantes ofensivas sem depender do Firebase', () => {
  assert.ok(OFFENSIVE_PATTERN.length > 20)
  assert.equal(hasOffensiveLanguage('Atendimento muito bom'), false)
  assert.equal(hasOffensiveLanguage('p0rr4!'), true)
})

test('falha de permissão em uma fonte não bloqueia outras áreas da empresa', () => {
  const sources = initialSources(true)
  sources.reviews = { loading: false, error: accessError({ code: '42501', message: 'row-level security' }, 'avaliações', true), fromCache: false }
  assert.deepEqual(companyTabState(sources, 'pedidos'), { loading: false, error: '', fromCache: false })
  assert.match(companyTabState(sources, 'avaliacoes').error, /avaliações/)
  sources.orders = { loading: false, error: accessError({ code: '42501', message: 'row-level security' }, 'pedidos', true), fromCache: false }
  assert.match(companyTabState(sources, 'pedidos').error, /pedidos/)
  assert.match(companyTabState(sources, 'atendimento').error, /pedidos/)
})

test('categorias do catálogo não misturam pratos, bebidas e sobremesas', () => {
  assert.equal(isMainDish({ categoria: 'Pratos' }), true)
  assert.equal(isMainDish({ category: 'Pizza' }), true)
  assert.equal(isPizza({ category: 'Pizza' }), true)
  assert.equal(productCategoryLabel({ category: 'Pizza' }), 'Pizza')
  assert.equal(isBeverage({ categoria: 'Bebidas' }), true)
  assert.equal(isBeverage({ categoria: 'Suco' }), true)
  assert.equal(isDessert({ categoria: 'Sobremesas' }), true)
  assert.equal(isDessert({ categoria: 'Pudim' }), true)
  assert.equal(isBeverage({ categoria: 'Prato executivo' }), false)
  assert.equal(isDessert({ categoria: 'Refrigerante' }), false)
  assert.equal(productCategoryLabel({ categoria: 'Refrigerante' }), 'Bebida')
})

test('validade da CNH aceita datas futuras válidas e rejeita datas impossíveis', () => {
  const now = new Date(2026, 10, 4, 12, 0, 0).getTime()
  assert.equal(isValidFutureDate('2026-11-04', now), true)
  assert.equal(isValidFutureDate('2026-11-05', now), true)
  assert.equal(isValidFutureDate('2026-02-30', now), false)
  assert.equal(isValidFutureDate('04/11/2027', now), false)
  assert.equal(isValidFutureDate('2026-11-03', now), false)
})
