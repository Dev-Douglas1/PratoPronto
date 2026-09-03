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
      <div className="product-card__image">
        <img src={produto.imagem} alt={produto.nome} loading="lazy" />
        <span className="product-card__tag">Feito na hora</span>
      </div>
      <div className="product-card-content">
        <h3>{produto.nome}</h3>
        <p>{produto.descricao}</p>
        <div className="product-card-bottom">
          <div className="product-price">
            <small>A partir de</small>
            <strong>{formatarMoeda(produto.preco)}</strong>
          </div>
          <button type="button" className={`add-button ${adicionado ? 'is-added' : ''}`} onClick={handleAdd} aria-label={`Adicionar ${produto.nome}`}>
            {adicionado ? '✓' : '+'}
          </button>
        </div>
      </div>
    </article>
  )
}
