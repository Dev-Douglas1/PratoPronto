import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import useCatalog from '../hooks/useCatalog.js'
import { productPrice } from '../utils/productPrice.js'
import useStorefront from '../hooks/useStorefront.js'
import { useUser } from './UserContext.jsx'
import { estimarEntrega } from '../utils/entrega.js'

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
  const { store } = useStorefront()
  const { catalog } = useCatalog(usuario?.emailVerificado === true)
  const [itens, setItens] = useState(carregarCarrinho)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(itens)) } catch { /* O carrinho continua disponível em memória. */ }
  }, [itens])

  function adicionar(produto) {
    setItens((atual) => ({
      ...atual,
      [produto.id]: {
        produto,
        quantidade: Math.min(50, (atual[produto.id]?.quantidade ?? 0) + 1),
      },
    }))
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
    () => ({ itens, lista, quantidadeTotal, subtotal, taxaEntrega, total, adicionar, remover, limpar }),
    [itens, lista, quantidadeTotal, subtotal, taxaEntrega, total],
  )

  return <CartContext.Provider value={valor}>{children}</CartContext.Provider>
}

export function useCart() {
  const contexto = useContext(CartContext)
  if (!contexto) throw new Error('useCart deve ser usado dentro de CartProvider')
  return contexto
}
