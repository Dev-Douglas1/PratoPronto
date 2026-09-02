import ProductCard from './ProductCard.jsx'

export default function ProductGrid({ produtos }) {
  return (
    <div className="product-grid">
      {produtos.map((produto) => (
        <ProductCard key={produto.id} produto={produto} />
      ))}
    </div>
  )
}
