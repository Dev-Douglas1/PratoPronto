import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CartContext = createContext(null)
const STORAGE_KEY = 'prato-pronto:carrinho'

function cartIdFor(produto, personalizacao) {
  if (!personalizacao) return produto.id
  const extras = [...(personalizacao.adicionais || [])].sort().join(',')
  return [produto.id, personalizacao.tamanho || '', personalizacao.borda || '', extras, personalizacao.observacao || ''].join('::')
}

function carregarCarrinho() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
    const normalized = {}
    Object.entries(parsed).forEach(([key, item]) => {
      if (!item?.produto) return
      const cartId = item.cartId || key || item.produto.id
      normalized[cartId] = { ...item, cartId }
    })
    return normalized
  } catch {
    return {}
  }
}

function precoUnitario(item) {
  return Number(item.produto.preco || 0) + Number(item.personalizacao?.ajuste || 0)
}

export function CartProvider({ children }) {
  const [itens, setItens] = useState(carregarCarrinho)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(itens))
  }, [itens])

  function adicionar(produto, personalizacao = null) {
    const cartId = cartIdFor(produto, personalizacao)
    setItens((atual) => ({
      ...atual,
      [cartId]: {
        cartId,
        produto,
        personalizacao,
        quantidade: (atual[cartId]?.quantidade ?? 0) + 1,
      },
    }))
  }

  function remover(cartId) {
    setItens((atual) => {
      const item = atual[cartId]
      if (!item) return atual

      if (item.quantidade <= 1) {
        const proximo = { ...atual }
        delete proximo[cartId]
        return proximo
      }

      return {
        ...atual,
        [cartId]: { ...item, quantidade: item.quantidade - 1 },
      }
    })
  }

  function limpar() {
    setItens({})
  }

  const lista = Object.values(itens)
  const quantidadeTotal = lista.reduce((soma, item) => soma + item.quantidade, 0)
  const total = lista.reduce(
    (soma, item) => soma + precoUnitario(item) * item.quantidade,
    0,
  )

  const valor = useMemo(
    () => ({ itens, lista, quantidadeTotal, total, adicionar, remover, limpar, precoUnitario }),
    [itens, lista, quantidadeTotal, total],
  )

  return <CartContext.Provider value={valor}>{children}</CartContext.Provider>
}

export function useCart() {
  const contexto = useContext(CartContext)
  if (!contexto) throw new Error('useCart deve ser usado dentro de CartProvider')
  return contexto
}
