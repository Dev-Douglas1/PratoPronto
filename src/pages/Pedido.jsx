import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatarMoeda } from '../utils/moeda.js'
import { useUser } from '../context/UserContext.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'

export default function Pedido() {
  const navigate = useNavigate()
  const { lista, companyId, subtotal, taxaEntrega, total, adicionar, remover } = useCart()
  const { usuario } = useUser()

  return (
    <AppScreen className="screen-with-nav menu-screen">
      <TopBar titulo="Carrinho" perfil />
      <section className="catalog-surface order-surface">
        <div className="page-heading">
          <span className="eyebrow">REVISE SUA SELEÇÃO</span>
          <h1>O que você escolheu?</h1>
          <p>Ajuste as quantidades e confirme os itens para consultar o valor final e a taxa do entregador.</p>
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
            <div className="empty-state">
              <span>🛒</span>
              <p>Seu pedido ainda está vazio.</p>
            </div>
          ) : (
            lista.map(({ produto, quantidade }) => (
              <div className="cart-item" key={produto.id}>
                <img src={produto.imagem || '/icons/app-icon.svg'} alt="" />
                <div className="cart-item__copy">
                  <strong>{produto.nome}</strong>
                  {produto.detalhes && <span>{produto.detalhes}</span>}
                  {produto.oferta && <span className="cart-offer">{produto.oferta.percentual}% de desconto · {produto.oferta.titulo}</span>}
                  {produto.disponivel === false && <span>Produto indisponível. Remova para continuar.</span>}
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

          <div className="order-breakdown">
            <p><span>Subtotal</span><strong>{formatarMoeda(subtotal)}</strong></p>
            <p><span>Taxa do motoboy</span><strong>{taxaEntrega === null ? 'Calculada na confirmação' : taxaEntrega ? formatarMoeda(taxaEntrega) : 'Grátis'}</strong></p>
            <small>Estimativa inicial. O valor definitivo dos pratos e a taxa de entrega serão confirmados pelo estabelecimento na próxima etapa.</small>
            <div className="order-total"><span>Total estimado</span><strong>{formatarMoeda(total)}</strong></div>
          </div>

          <div className="two-actions">
            <button className="btn btn-secondary" onClick={() => navigate(companyId === DEFAULT_COMPANY_ID ? '/pratos' : '/loja/' + companyId)}>Ver mais</button>
            <button className="btn btn-primary" disabled={!lista.length} onClick={() => navigate('/pagamento')}>Confirmar itens e ver valores</button>
          </div>
        </div>
      </section>
      <BottomNav />
    </AppScreen>
  )
}
