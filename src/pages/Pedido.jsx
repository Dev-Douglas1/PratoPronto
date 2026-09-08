import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatarMoeda } from '../utils/moeda.js'
import { useUser } from '../context/UserContext.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { calculateDeliveryFee } from '../services/storage.js'

export default function Pedido() {
  const navigate = useNavigate()
  const { lista, total, adicionar, remover, precoUnitario, podeAdicionar } = useCart()
  const { usuario } = useUser()
  const [deliveryFee, setDeliveryFee] = useState(null)
  const [loadingFee, setLoadingFee] = useState(false)
  const [feeError, setFeeError] = useState('')

  useEffect(() => {
    let active = true
    async function loadFee() {
      setFeeError('')
      if (total <= 0) {
        setDeliveryFee(0)
        return
      }
      if (!usuario?.bairro) {
        setDeliveryFee(null)
        setFeeError('Informe seu bairro no perfil para calcular a entrega.')
        return
      }

      try {
        setLoadingFee(true)
        const value = await calculateDeliveryFee(usuario.bairro, total)
        if (active) setDeliveryFee(value)
      } catch (error) {
        if (active) {
          setDeliveryFee(null)
          setFeeError(error.message || 'Não foi possível calcular a taxa de entrega.')
        }
      } finally {
        if (active) setLoadingFee(false)
      }
    }
    loadFee()
    return () => { active = false }
  }, [usuario?.bairro, total])

  const finalTotal = total + (deliveryFee ?? 0)

  return (
    <AppScreen className="screen-with-nav menu-screen">
      <TopBar titulo="Pedidos" perfil />
      <section className="catalog-surface order-surface">
        <div className="page-heading">
          <span className="eyebrow">SEU CARRINHO</span>
          <h1>Revise o pedido</h1>
          <p>Confira itens, personalizações e entrega antes de pagar.</p>
        </div>
        {usuario && (
          <div className="delivery-summary">
            <span className="delivery-summary__icon">⌂</span>
            <div>
              <strong>Entregar em</strong>
              <span>{usuario.endereco}, {usuario.numero} • {usuario.bairro}</span>
              {usuario.complemento ? <small>{usuario.complemento}</small> : null}
            </div>
          </div>
        )}
        <div className="cart-panel">
          {lista.length === 0 ? (
            <div className="empty-state"><span>🍕</span><p>Seu pedido ainda está vazio.</p></div>
          ) : (
            lista.map((item) => {
              const { produto, quantidade, personalizacao, cartId } = item
              return (
                <div className="cart-item cart-item--expanded" key={cartId}>
                  <img src={produto.imagem} alt="" />
                  <div className="cart-item__copy">
                    <strong>{produto.nome}</strong>
                    {personalizacao ? (
                      <small className="custom-summary">
                        {personalizacao.tamanhoLabel} • {personalizacao.bordaLabel}
                        {personalizacao.extrasLabels?.length ? ` • ${personalizacao.extrasLabels.join(', ')}` : ''}
                        {personalizacao.observacao ? ` • Obs.: ${personalizacao.observacao}` : ''}
                      </small>
                    ) : null}
                    <small>{formatarMoeda(precoUnitario(item) * quantidade)}</small>
                  </div>
                  <div className="qty-control">
                    <button onClick={() => remover(cartId)} aria-label={`Remover uma unidade de ${produto.nome}`}>−</button>
                    <strong>{quantidade}</strong>
                    <button disabled={!podeAdicionar(produto)} onClick={() => adicionar(produto, personalizacao)} aria-label={`Adicionar uma unidade de ${produto.nome}`}>+</button>
                  </div>
                </div>
              )
            })
          )}

          <div className="price-lines">
            <div><span>Subtotal</span><strong>{formatarMoeda(total)}</strong></div>
            <div><span>Entrega</span><strong>{loadingFee ? 'Calculando...' : deliveryFee === null ? '—' : deliveryFee === 0 && total > 0 ? 'Grátis' : formatarMoeda(deliveryFee)}</strong></div>
          </div>
          <div className="order-total"><span>Total</span><strong>{formatarMoeda(finalTotal)}</strong></div>
          {feeError ? <p className="form-error dark-error" role="alert">{feeError}</p> : null}

          <div className="two-actions">
            <button className="btn btn-secondary" onClick={() => navigate('/pizzas')}>Ver mais</button>
            <button className="btn btn-primary" disabled={!lista.length || loadingFee || deliveryFee === null || Boolean(feeError)} onClick={() => navigate('/pagamento')}>Pagar</button>
          </div>
        </div>
      </section>
      <BottomNav />
    </AppScreen>
  )
}
