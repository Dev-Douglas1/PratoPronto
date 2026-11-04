import { normalizeSearch } from '../config/marketplace.js'

const valueOf = product => normalizeSearch(product?.categoria || product?.category || '')

export function isPizza(product) {
  return ['pizza', 'pizzas'].includes(valueOf(product))
}

export function isMainDish(product) {
  const category = valueOf(product)
  return ['prato', 'pratos', 'pizza', 'pizzas', 'refeicao', 'refeicoes', 'main', 'mains', 'lanche', 'lanches', 'massa', 'massas', 'executivo'].includes(category)
}

export function isBeverage(product) {
  const category = valueOf(product)
  return ['bebida', 'bebidas', 'beverage', 'beverages', 'drink', 'drinks', 'suco', 'sucos', 'refrigerante', 'refrigerantes', 'agua', 'aguas', 'cafe', 'cafes'].includes(category)
}

export function isDessert(product) {
  const category = valueOf(product)
  return ['sobremesa', 'sobremesas', 'dessert', 'desserts', 'doce', 'doces', 'bolo', 'bolos', 'sorvete', 'sorvetes', 'pudim', 'pudins'].includes(category)
}

export function productCategoryLabel(product) {
  if (isBeverage(product)) return 'Bebida'
  if (isPizza(product)) return 'Pizza'
  if (isDessert(product)) return 'Sobremesa'
  if (isMainDish(product)) return 'Prato'
  return 'Produto'
}
