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
  const { lista, total, adicionar, remover, precoUnitario } = useCart()
  const { usuario } = useUser()
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [loadingFee, setLoadingFee] = useState(false)

  useEffect(() => {
    let active = true
    async function loadFee() {
      if (!usuario?.bairro || total <= 0) {
        setDeliveryFee(0)
        return
      }
      try {
        setLoadingFee(true)
        const value = await calculateDeliveryFee(usuario.bairro, total)
        if (active) setDeliveryFee(value)
      } catch {
        if (active) setDeliveryFee(0)
      } finally {
        if (active) setLoadingFee(false)
      }
    }
    loadFee()
    return () => { active = false }
  }, [usuario?.bairro, total])

  const finalTotal = total + deliveryFee

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
                    <button onClick={() => remover(cartId)}>−</button>
                    <strong>{quantidade}</strong>
                    <button onClick={() => adicionar(produto, personalizacao)}>+</button>
                  </div>
                </div>
              )
            })
          )}

          <div className="price-lines">
            <div><span>Subtotal</span><strong>{formatarMoeda(total)}</strong></div>
            <div><span>Entrega</span><strong>{loadingFee ? 'Calculando...' : deliveryFee === 0 && total > 0 ? 'Grátis' : formatarMoeda(deliveryFee)}</strong></div>
          </div>
          <div className="order-total"><span>Total</span><strong>{formatarMoeda(finalTotal)}</strong></div>

          <div className="two-actions">
            <button className="btn btn-secondary" onClick={() => navigate('/pizzas')}>Ver mais</button>
            <button className="btn btn-primary" disabled={!lista.length || loadingFee} onClick={() => navigate('/pagamento', { state: { deliveryFee } })}>Pagar</button>
          </div>
        </div>
      </section>
      <BottomNav />
    </AppScreen>
  )
}
