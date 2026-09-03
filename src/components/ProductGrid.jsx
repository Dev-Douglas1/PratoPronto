import ProductCard from './ProductCard.jsx'

export default function ProductGrid({ produtos }) {
  if (!produtos.length) {
    return (
      <div className="empty-state empty-state--catalog">
        <span>⌕</span>
        <p>Nenhum produto encontrado.</p>
        <small>Tente buscar por outro nome.</small>
      </div>
    )
  }

  return (
    <div className="product-grid">
      {produtos.map((produto) => (
        <ProductCard key={produto.id} produto={produto} />
      ))}
    </div>
  )
}
