export const MAX_CART_ITEM_QUANTITY = 50

export function nextCartItemQuantity(current = 0) {
  const quantity = Number.isInteger(current) && current > 0 ? current : 0
  if (quantity >= MAX_CART_ITEM_QUANTITY) {
    const error = new Error('O limite é de 50 unidades por produto.')
    error.code = 'quantity-limit'
    throw error
  }
  return quantity + 1
}

export function removeCartItem(items = {}, productId) {
  if (!Object.prototype.hasOwnProperty.call(items, productId)) return items
  const next = { ...items }
  delete next[productId]
  return next
}
