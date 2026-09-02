import { useState } from 'react'
import { useCart } from '../context/CartContext.jsx'
import { formatarMoeda } from '../utils/moeda.js'

export default function ProductCard({ produto }) {
  const { adicionar } = useCart()
  const [adicionado, setAdicionado] = useState(false)

  function handleAdd() {
    adicionar(produto)
    setAdicionado(true)
    window.setTimeout(() => setAdicionado(false), 900)
  }

  return (
    <article className="product-card">
      <img src={produto.imagem} alt={produto.nome} />
      <div className="product-card-content">
        <h3>{produto.nome}</h3>
        <p>{produto.descricao}</p>
        <div className="product-card-bottom">
          <strong>{formatarMoeda(produto.preco)}</strong>
          <button className="add-button" onClick={handleAdd} aria-label={`Adicionar ${produto.nome}`}>
            {adicionado ? '✓' : '+'}
          </button>
        </div>
      </div>
    </article>
  )
}
