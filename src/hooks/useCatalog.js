import { useEffect, useMemo, useState } from 'react'
import { subscribeCatalog } from '../services/storage.js'

export function useCatalog(baseProducts) {
  const [overrides, setOverrides] = useState({})

  useEffect(() => {
    try {
      return subscribeCatalog(setOverrides, () => setOverrides({}))
    } catch {
      setOverrides({})
      return undefined
    }
  }, [])

  return useMemo(() => baseProducts.map((product) => {
    const override = overrides[product.id]
    if (!override) return product

    const price = Number(override.price)
    const stock = Number(override.stock)

    return {
      ...product,
      preco: Number.isFinite(price) && price > 0 ? price : product.preco,
      available: override.available !== false,
      stock: Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : undefined,
    }
  }), [baseProducts, overrides])
}
