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
    return {
      ...product,
      preco: Number(override.price) > 0 ? Number(override.price) : product.preco,
      available: override.available !== false,
      stock: Number.isFinite(Number(override.stock)) ? Number(override.stock) : undefined,
    }
  }), [baseProducts, overrides])
}
