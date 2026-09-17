import test from 'node:test'
import assert from 'node:assert/strict'
import { priceOrder } from '../src/domain.js'
import { promotionalPrice, promotionStatus, validatePromotion } from '../src/promotions.js'
import { validateName, validatePhone, validatePassword, hasOffensiveLanguage } from '../src/input-policy.js'
import { fixedNow, settings, profile, items } from './fixtures.js'
const offer = () => ({ titulo: 'Especial da casa', percentual: 15, inicio: +fixedNow, fim: +fixedNow + 3600000, ativa: true })
const price = overrides => priceOrder({ items, delivery: profile, settings: settings(), now: fixedNow, ...overrides })

test('oferta começa no horário certo, encerra no limite e pode ser pausada', () => {
  const p = offer()
  assert.equal(promotionStatus(p, p.inicio - 1), 'agendada')
  assert.equal(promotionStatus(p, p.inicio), 'ativa')
  assert.equal(promotionStatus(p, p.fim - 1), 'ativa')
  assert.equal(promotionStatus(p, p.fim), 'encerrada')
  assert.equal(promotionStatus({ ...p, ativa: false }, p.inicio), 'pausada')
  assert.equal(promotionalPrice(799, p, p.inicio).finalCents, 679)
  assert.equal(promotionalPrice(799, p, p.fim).finalCents, 799)
})
test('preço da oferta é calculado no servidor incluindo opcionais, sem descontar frete', () => {
  const result = price({ productSettings: { calabresa: { preco: 58.9, promocao: offer() } }, items: [{ ...items[0], quantidade: 2, opcoes: { tamanho: 'pequena', borda: 'catupiry', extras: ['bacon'] }, percentual: 100, preco: 0.01 }] })
  assert.equal(result.itens[0].unitCents, 5007)
  assert.equal(result.itens[0].precoOriginal, 58.9)
  assert.equal(result.subtotal, 100.14)
  assert.equal(result.taxaEntrega, 5)
  assert.equal(result.totalCents, 10514)
  assert.equal(price({ items: [{ ...items[0], promocao: offer() }] }).itens[0].unitCents, 5890)
  assert.throws(() => price({ productSettings: { calabresa: { disponivel: false, promocao: offer() } } }), /indisponível/)
})
test('ofertas inválidas são rejeitadas e não reduzem o preço', () => {
  for (const patch of [{ percentual: 0 }, { percentual: 91 }, { percentual: 1.5 }, { fim: +fixedNow }, { fim: +fixedNow + 91 * 86400000 }, { titulo: 'ab' }, { titulo: 'a'.repeat(61) }, { titulo: 'Oferta de p0rr4' }, { ativa: 'true' }]) {
    const p = { ...offer(), ...patch }
    assert.throws(() => validatePromotion(p))
    assert.equal(promotionalPrice(10000, p, +fixedNow).finalCents, 10000)
  }
})
test('nome e telefone têm limites, aceitam acentos e não confundem palavras comuns com ofensas', () => {
  for (const name of ["João D’Ávila", 'Ana-Maria', 'Ricardo', 'Cássio', 'Dickson', '李华']) assert.equal(validateName(name), name)
  assert.equal(validateName('  Ana   Silva  '), 'Ana Silva')
  for (const name of ['', 'A', 'A'.repeat(81), 'Ana123', 'porra', 'Merda Silva']) assert.throws(() => validateName(name))
  assert.equal(validatePhone('(41) 99999-9999'), '41999999999')
  assert.equal(validatePhone('+55 41 3333-3333'), '4133333333')
  for (const value of ['', '123', '419999999999', '01999999999']) assert.throws(() => validatePhone(value))
  for (const value of ['p0rr4', 'CARALHO!', 'm.e.r.d.a', 'p\u200buta', 'foda-se']) assert.equal(hasOffensiveLanguage(value), true, value)
  for (const value of ['computador', 'disputa', 'Acumular descontos', 'Pedido atrasou muito, estou insatisfeito.']) assert.equal(hasOffensiveLanguage(value), false, value)
})
test('senhas não são truncadas nem moderadas e aceitam até 128 caracteres', () => {
  const max = 'A1' + 'b'.repeat(126)
  assert.equal(validatePassword(max), max)
  assert.equal(validatePassword(' Uma p0rr4 de senha 1 '), ' Uma p0rr4 de senha 1 ')
  for (const value of ['A123', 'A'.repeat(12), '1'.repeat(12), max + 'x']) assert.throws(() => validatePassword(value))
})
