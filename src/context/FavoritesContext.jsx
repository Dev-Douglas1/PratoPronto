import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const FavoritesContext = createContext(null)
const STORAGE_KEY = 'pratopronto:favoritos:v1'

function readFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter(item => item && typeof item.id === 'string' && typeof item.nome === 'string')
  } catch {
    return []
  }
}

function favoriteKey(product) {
  return `${product.companyId || 'pratopronto'}:${product.id}`
}

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState(readFavorites)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)) } catch { /* Favoritos permanecem disponíveis em memória. */ }
  }, [favorites])

  const isFavorite = useCallback(product => {
    if (!product?.id) return false
    const key = favoriteKey(product)
    return favorites.some(item => favoriteKey(item) === key)
  }, [favorites])

  const toggleFavorite = useCallback(product => {
    if (!product?.id || typeof product.nome !== 'string') return false
    const key = favoriteKey(product)
    let added = false
    setFavorites(current => {
      const exists = current.some(item => favoriteKey(item) === key)
      if (exists) return current.filter(item => favoriteKey(item) !== key)
      added = true
      const snapshot = {
        id: product.id,
        companyId: product.companyId || 'pratopronto',
        companyName: product.companyName || 'Loja parceira',
        nome: product.nome,
        descricao: product.descricao || '',
        imagem: product.imagem || '',
        preco: Number(product.preco) || 0,
        precoOriginal: Number(product.precoOriginal) || 0,
        disponivel: product.disponivel !== false,
        categoria: product.categoria || product.category || '',
      }
      return [...current, snapshot]
    })
    return added
  }, [])

  const removeFavorite = useCallback(product => {
    if (!product?.id) return
    const key = favoriteKey(product)
    setFavorites(current => current.filter(item => favoriteKey(item) !== key))
  }, [])

  const value = useMemo(() => ({
    favorites,
    favoriteCount: favorites.length,
    isFavorite,
    toggleFavorite,
    removeFavorite,
  }), [favorites, isFavorite, toggleFavorite, removeFavorite])

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites() {
  const context = useContext(FavoritesContext)
  if (!context) throw new Error('useFavorites deve ser usado dentro de FavoritesProvider')
  return context
}
