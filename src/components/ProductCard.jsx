import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { useFavorites } from '../context/FavoritesContext.jsx'
import { productPrice } from '../utils/productPrice.js'
import { formatarMoeda } from '../utils/moeda.js'
import { productCategoryLabel } from '../shared/catalog-category.js'

export default function ProductCard({ produto, readOnly = false }) {
  const { adicionar } = useCart()
  const { isFavorite, toggleFavorite } = useFavorites()
  const [adicionado, setAdicionado] = useState(false)
  const [cartError, setCartError] = useState('')
  const favorite = isFavorite(produto)
  const displayPrice = productPrice({ ...produto, personalizavel: false })
  const detailUrl = `/produto/${encodeURIComponent(produto.companyId || 'pratopronto')}/${encodeURIComponent(produto.id)}`

  function handleAdd() {
    if (readOnly || produto.disponivel === false) return
    try {
      adicionar({ ...produto, preco: displayPrice.preco, precoOriginal: displayPrice.precoOriginal, oferta: displayPrice.oferta })
      setCartError('')
      setAdicionado(true)
      window.setTimeout(() => setAdicionado(false), 900)
    } catch (error) {
      setCartError(error.message || 'Não foi possível adicionar este produto.')
    }
  }

  function handleFavorite() {
    toggleFavorite({ ...produto, preco: displayPrice.preco, precoOriginal: displayPrice.precoOriginal })
  }

  return (
    <article className={`product-card ${displayPrice.oferta ? 'has-offer' : ''}`}>
      <Link className="product-card-detail-link" to={detailUrl} aria-label={`Ver detalhes de ${produto.nome}`}>
        <div className="product-card__image">
          <img src={produto.imagem || '/icons/app-icon.svg'} alt={produto.nome} loading="lazy"
            onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/icons/app-icon.svg' }} />
          <span className="product-card__tag">
            {readOnly ? 'Disponibilidade a confirmar' : produto.disponivel === false ? 'Indisponível' : displayPrice.oferta ? `−${displayPrice.oferta.percentual}%` : productCategoryLabel(produto)}
          </span>
        </div>
        <div className="product-card-content">
          <h3>{produto.nome}</h3>
          <span className="product-card__company">{produto.companyName || 'Loja parceira'}</span>
          {produto.descricao && <p>{produto.descricao}</p>}
          {displayPrice.oferta && <span className="product-offer-title">{displayPrice.oferta.titulo}</span>}
        </div>
      </Link>
      <div className="product-card-bottom">
        <div className="product-price">
          <small>{readOnly ? 'Preço não confirmado' : 'Por unidade'}</small>
          {!readOnly && displayPrice.oferta && <del aria-label="Preço anterior">{formatarMoeda(displayPrice.precoOriginal)}</del>}
          <strong>{readOnly ? 'Indisponível' : formatarMoeda(displayPrice.preco)}</strong>
        </div>
        <div className="product-card-actions">
          <button type="button" className={`favorite-button ${favorite ? 'is-favorite' : ''}`}
            onClick={handleFavorite} aria-pressed={favorite}
            aria-label={favorite ? `Remover ${produto.nome} dos favoritos` : `Adicionar ${produto.nome} aos favoritos`}
            title={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}>
            {favorite ? '♥' : '♡'}
          </button>
          <button type="button" disabled={readOnly || produto.disponivel === false}
            className={`add-button ${adicionado ? 'is-added' : ''}`} onClick={handleAdd}
            aria-label={`Adicionar ${produto.nome} ao carrinho`}>
            {adicionado ? '✓' : '+'}
          </button>
        </div>
      </div>
      {cartError && <p className="form-error" role="alert">{cartError}</p>}
    </article>
  )
}
