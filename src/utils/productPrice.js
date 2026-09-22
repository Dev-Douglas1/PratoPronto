import { tamanhos, bordas, extras } from '../data/produtos.js'
import { promotionalPrice } from '../shared/promotions.js'

export function productPrice(product, options = {}, now = Date.now()) {
  let unit = Math.round(product.preco * 100)
  if (product.personalizavel) {
    const size = tamanhos.find(item => item.id === (options.tamanho || 'grande'))
    const crust = bordas.find(item => item.id === (options.borda || 'tradicional'))
    const additions = extras.filter(item => (options.extras || []).includes(item.id))
    unit += Math.round(((size?.ajuste || 0) + (crust?.ajuste || 0) + additions.reduce((sum, item) => sum + item.ajuste, 0)) * 100)
  }
  const priced = promotionalPrice(unit, product.promocao, now)
  return { preco: priced.finalCents / 100, precoOriginal: unit / 100, desconto: priced.discountCents / 100, oferta: priced.promotion }
}
