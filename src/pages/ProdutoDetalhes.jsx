import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import BottomNav from '../components/BottomNav.jsx'
import useCatalog from '../hooks/useCatalog.js'
import { useCart } from '../context/CartContext.jsx'
import { productPrice } from '../utils/productPrice.js'
import { formatarMoeda } from '../utils/moeda.js'

export default function ProdutoDetalhes() {
  const { companyId, productId } = useParams()
  const navigate = useNavigate()
  const { catalog, loading, error, confirmed, retry } = useCatalog()
  const { adicionar, quantidadeTotal, itens } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [feedback, setFeedback] = useState('')
  const [cartError, setCartError] = useState('')

  const product = useMemo(() => catalog.find(item => item.companyId === companyId && item.id === productId), [catalog, companyId, productId])
  const price = product ? productPrice({ ...product, personalizavel: false }) : null
  const available = confirmed && product?.disponivel !== false
  const currentQuantity = product ? (itens[product.id]?.quantidade || 0) : 0
  const addableQuantity = Math.min(quantity, Math.max(0, 50 - currentQuantity))

  function addToCart() {
    if (!product || !available) return
    try {
      if (addableQuantity < 1) {
        setCartError('Você já atingiu o limite de 50 unidades deste produto no carrinho.')
        return
      }
      for (let i = 0; i < addableQuantity; i += 1) {
        adicionar({ ...product, preco: price.preco, precoOriginal: price.precoOriginal, oferta: price.oferta, personalizavel: false })
      }
      setCartError('')
      setFeedback(addableQuantity === 1 ? 'Produto adicionado ao carrinho.' : addableQuantity + ' unidades adicionadas ao carrinho.')
    } catch (err) {
      setCartError(err.message || 'Não foi possível adicionar este produto.')
    }
  }

  return (
    <AppScreen className="screen-with-nav product-detail-screen">
      <TopBar titulo="Detalhes do prato" voltar carrinho perfil />
      <main className="product-detail" aria-labelledby="product-detail-title">
        <Link className="product-detail-back" to="/pratos">← Voltar para Pratos</Link>
        {loading && <p className="catalog-loading" role="status">Carregando detalhes do prato…</p>}
        {error && <div className="catalog-notice" role="alert"><p>{error}</p><button type="button" className="text-link dark-link" onClick={retry}>Tentar novamente</button></div>}
        {!loading && !error && !product && (
          <section className="product-detail-unavailable">
            <h1>Prato não encontrado</h1>
            <p>Este item pode ter sido removido ou não está mais disponível no cardápio.</p>
            <Link className="btn btn-primary" to="/pratos">Voltar ao cardápio</Link>
          </section>
        )}
        {product && (
          <>
            <div className="product-detail-image">
              <img src={product.imagem || '/icons/app-icon.svg'} alt={product.nome}
                onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/icons/app-icon.svg' }} />
              {price.oferta && <span className="product-detail-discount">−{price.oferta.percentual}%</span>}
            </div>
            <section className="product-detail-info">
              <Link className="product-detail-company" to={`/loja/${encodeURIComponent(product.companyId)}`}>
                {product.companyName || 'Loja parceira'} <span aria-hidden="true">›</span>
              </Link>
              <h1 id="product-detail-title">{product.nome}</h1>
              <div className="product-detail-price">
                {price.oferta && <del>{formatarMoeda(price.precoOriginal)}</del>}
                <strong>{formatarMoeda(price.preco)}</strong><span>por unidade</span>
              </div>
              {price.oferta && <p className="product-detail-offer">{price.oferta.titulo}</p>}
              <div className={`product-detail-availability ${available ? 'is-available' : 'is-unavailable'}`}>
                <span aria-hidden="true">{available ? '●' : '○'}</span>
                {available ? 'Disponível para pedido' : confirmed ? 'Indisponível no momento' : 'Aguardando confirmação de disponibilidade'}
              </div>
              <div className="product-detail-description">
                <h2>Sobre este prato</h2>
                <p>{product.descricao || 'A loja ainda não adicionou uma descrição para este prato.'}</p>
              </div>
              <div className="product-detail-order">
                <div className="product-detail-quantity">
                  <span>Quantidade</span>
                  <div className="quantity-stepper" aria-label="Quantidade do produto">
                    <button type="button" disabled={quantity <= 1} onClick={() => setQuantity(value => Math.max(1, value - 1))} aria-label="Diminuir quantidade">−</button>
                    <output aria-live="polite">{quantity}</output>
                    <button type="button" disabled={quantity >= 50} onClick={() => setQuantity(value => Math.min(50, value + 1))} aria-label="Aumentar quantidade">+</button>
                  </div>
                </div>
                <button type="button" className="product-detail-add" disabled={!available} onClick={addToCart}>
                  <span>{available ? 'Adicionar ao carrinho' : 'Indisponível'}</span>
                  <strong>{formatarMoeda(price.preco * quantity)}</strong>
                </button>
                {feedback && <p className="product-detail-feedback" role="status">{feedback} <button type="button" onClick={() => navigate('/carrinho')}>Ver carrinho</button></p>}
                {cartError && <p className="form-error" role="alert">{cartError}</p>}
                {quantidadeTotal > 0 && <p className="product-detail-cart-count">{quantidadeTotal} {quantidadeTotal === 1 ? 'item' : 'itens'} no carrinho</p>}
              </div>
            </section>
          </>
        )}
      </main>
      <BottomNav />
    </AppScreen>
  )
}
