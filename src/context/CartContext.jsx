import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import useCatalog from '../hooks/useCatalog.js'
import { productPrice } from '../utils/productPrice.js'
import useStorefront from '../hooks/useStorefront.js'
import { useUser } from './UserContext.jsx'
import { estimarEntrega } from '../utils/entrega.js'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'

const CartContext = createContext(null)
const STORAGE_KEY = 'prato-pronto:carrinho'

function carregarCarrinho() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([id, item]) =>
      id === item?.produto?.id && typeof item.produto.nome === 'string'
      && Number.isFinite(item.produto.preco) && item.produto.preco > 0
      && Number.isInteger(item.quantidade) && item.quantidade > 0 && item.quantidade <= 50))
  } catch {
    return {}
  }
}

export function CartProvider({ children }) {
  const { usuario } = useUser()
  const { catalog } = useCatalog(usuario?.emailVerificado === true)
  const [itens, setItens] = useState(carregarCarrinho)
  const companyId = Object.values(itens)[0]?.produto?.companyId || DEFAULT_COMPANY_ID
  const { store } = useStorefront(companyId)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(itens)) } catch { /* O carrinho continua disponível em memória. */ }
  }, [itens])

  function adicionar(produto) {
    const incomingCompanyId = produto.companyId || DEFAULT_COMPANY_ID
    let blocked = false
    setItens((atual) => {
      const currentCompanyId = Object.values(atual)[0]?.produto?.companyId || DEFAULT_COMPANY_ID
      if (Object.keys(atual).length && currentCompanyId !== incomingCompanyId) {
        blocked = true
        return atual
      }
      return {
        ...atual,
        [produto.id]: {
          produto: { ...produto, companyId: incomingCompanyId },
          quantidade: Math.min(50, (atual[produto.id]?.quantidade ?? 0) + 1),
        },
      }
    })
    if (blocked) {
      const error = new Error('Seu carrinho já tem produtos de outra empresa. Finalize ou limpe o carrinho antes de comprar em outra loja.')
      error.code = 'different-company'
      throw error
    }
  }

  function remover(produtoId) {
    setItens((atual) => {
      const item = atual[produtoId]
      if (!item) return atual

      if (item.quantidade <= 1) {
        const proximo = { ...atual }
        delete proximo[produtoId]
        return proximo
      }

      return {
        ...atual,
        [produtoId]: { ...item, quantidade: item.quantidade - 1 },
      }
    })
  }

  function limpar() {
    setItens({})
  }

  const lista = Object.values(itens).map(item => {
    const [baseId, tamanho, borda, additions] = item.produto.id.split('--')
    const opcoes = item.produto.opcoes || (tamanho ? { tamanho, borda, extras: additions && additions !== 'sem-extra' ? additions.split('.') : [] } : {})
    if ((item.produto.companyId || DEFAULT_COMPANY_ID) !== DEFAULT_COMPANY_ID) return item
    const base = catalog.find(product => product.id === (item.produto.produtoBaseId || baseId))
    if (!base) return item
    return { ...item, produto: { ...item.produto, opcoes, ...productPrice(base, opcoes), disponivel: base.disponivel } }
  })
  const quantidadeTotal = lista.reduce((soma, item) => soma + item.quantidade, 0)
  const subtotal = lista.reduce(
    (soma, item) => soma + item.produto.preco * item.quantidade,
    0,
  )
  const taxaEntrega = estimarEntrega(store, usuario, subtotal)
  const total = subtotal + (taxaEntrega ?? 0)

  const valor = useMemo(
    () => ({ itens, lista, companyId, quantidadeTotal, subtotal, taxaEntrega, total, adicionar, remover, limpar }),
    [itens, lista, companyId, quantidadeTotal, subtotal, taxaEntrega, total],
  )

  return <CartContext.Provider value={valor}>{children}</CartContext.Provider>
}

export function useCart() {
  const contexto = useContext(CartContext)
  if (!contexto) throw new Error('useCart deve ser usado dentro de CartProvider')
  return contexto
}
