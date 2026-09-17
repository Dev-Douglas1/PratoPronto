import { assertRespectful } from '../../functions/src/input-policy.js'
import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '../firebase.js'
import { assertCurrentBackend } from '../config/backend.js'

const functions = app ? getFunctions(app, 'southamerica-east1') : null
export async function callServer(name, data = {}) {
  assertCurrentBackend(import.meta.env)
  if (name === 'appQuote') assertRespectful(data.note, 'a observação')
  if (!functions) throw new Error('O serviço de pedidos ainda está sendo configurado pela empresa.')
  try { return (await httpsCallable(functions, name, { timeout: 45000 })(data)).data }
  catch (error) {
    const code = error?.code?.replace('functions/', '')
    if (['not-found','unavailable','internal','deadline-exceeded'].includes(code)) {
      throw new Error('O serviço de pedidos não respondeu. Consulte seus pedidos antes de tentar novamente. Se continuar, entre em contato com a empresa.')
    }
    if (code === 'unauthenticated') throw new Error('Entre novamente na conta, confirme seu e-mail e tente outra vez.')
    if (code === 'resource-exhausted') throw new Error('Muitas tentativas. Aguarde um minuto e tente novamente.')
    const result = new Error(error.message || 'Não foi possível concluir a operação.')
    result.reason = code
    result.restartCheckout = error.details?.restartCheckout === true
    throw result
  }
}
export function cartItems(lista) {
  return lista.map(({ produto, quantidade }) => {
    // Older carts encoded pizza options in their ID. Decode those IDs once;
    // only allowed product/option identifiers are sent to the pricing service.
    const [base, tamanho, borda, additions] = produto.id.split('--')
    const opcoes = produto.opcoes || (tamanho ? { tamanho, borda, extras: additions && additions !== 'sem-extra' ? additions.split('.') : [] } : {})
    return { id: produto.produtoBaseId || base, quantidade, opcoes }
  })
}
export function checkoutUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['www.mercadopago.com.br','sandbox.mercadopago.com.br'].includes(url.hostname) && !url.username && !url.password ? url.href : null } catch { return null }
}
