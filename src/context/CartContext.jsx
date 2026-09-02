import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CartContext = createContext(null)
const STORAGE_KEY = 'prato-pronto:carrinho'

function carregarCarrinho() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
  } catch {
    return {}
  }
}

export function CartProvider({ children }) {
  const [itens, setItens] = useState(carregarCarrinho)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(itens))
  }, [itens])

  function adicionar(produto) {
    setItens((atual) => ({
      ...atual,
      [produto.id]: {
        produto,
        quantidade: (atual[produto.id]?.quantidade ?? 0) + 1,
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

  const lista = Object.values(itens)
  const quantidadeTotal = lista.reduce((soma, item) => soma + item.quantidade, 0)
  const total = lista.reduce(
    (soma, item) => soma + item.produto.preco * item.quantidade,
    0,
  )

  const valor = useMemo(
    () => ({ itens, lista, quantidadeTotal, total, adicionar, remover, limpar }),
    [itens, lista, quantidadeTotal, total],
  )

  return <CartContext.Provider value={valor}>{children}</CartContext.Provider>
}

export function useCart() {
  const contexto = useContext(CartContext)
  if (!contexto) throw new Error('useCart deve ser usado dentro de CartProvider')
  return contexto
}
