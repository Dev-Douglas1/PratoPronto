import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatarMoeda } from '../utils/moeda.js'

export default function Pedido() {
  const navigate = useNavigate()
  const { lista, total, adicionar, remover } = useCart()

  return (
    <AppScreen>
      <TopBar titulo="Pedidos" />
      <div className="cart-panel">
        {lista.length === 0 ? (
          <div className="empty-state">
            <span>🍕</span>
            <p>Seu pedido ainda está vazio.</p>
          </div>
        ) : (
          lista.map(({ produto, quantidade }) => (
            <div className="cart-item" key={produto.id}>
              <div>
                <strong>{produto.nome}</strong>
                <small>{formatarMoeda(produto.preco * quantidade)}</small>
              </div>
              <div className="qty-control">
                <button onClick={() => remover(produto.id)}>−</button>
                <strong>{quantidade}</strong>
                <button onClick={() => adicionar(produto)}>+</button>
              </div>
            </div>
          ))
        )}

        <div className="order-total">
          <span>Valor:</span>
          <strong>{formatarMoeda(total)}</strong>
        </div>

        <div className="two-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/pizzas')}>Ver mais</button>
          <button className="btn btn-primary" disabled={!lista.length} onClick={() => navigate('/pagamento')}>Pagar</button>
        </div>
      </div>
    </AppScreen>
  )
}
