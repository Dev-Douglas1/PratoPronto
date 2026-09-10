import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase.js'

export const secureOrderBackendEnabled = import.meta.env.VITE_SECURE_ORDER_BACKEND === 'true'

function requireFunctions() {
  if (!functions) throw new Error('Cloud Functions não está configurado neste ambiente.')
}

function normalizeCallableError(error) {
  const message = error?.message || 'Não foi possível validar o pedido no servidor.'
  return new Error(message.replace(/^Firebase:\s*/i, '').trim())
}

export async function quoteSecureOrder(items) {
  requireFunctions()
  try {
    const quote = httpsCallable(functions, 'quoteOrder')
    const response = await quote({ itens: items })
    return response.data
  } catch (error) {
    throw normalizeCallableError(error)
  }
}

export async function createSecureOrder({ items, observacao = '', paymentMethod = 'cash-on-delivery' }) {
  requireFunctions()
  try {
    const create = httpsCallable(functions, 'createSecureOrder')
    const response = await create({
      itens: items,
      observacao,
      paymentMethod,
    })
    return response.data
  } catch (error) {
    throw normalizeCallableError(error)
  }
}
