import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatarMoeda } from '../utils/moeda.js'
import { useUser } from '../context/UserContext.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { DEFAULT_COMPANY_ID } from '../config/marketplace.js'

function storePath(companyId) {
  return companyId === DEFAULT_COMPANY_ID ? '/pratos' : '/loja/' + encodeURIComponent(companyId)
}

export default function Pedido() {
  const navigate = useNavigate()
  const { lista, companyId, subtotal, taxaEntrega, adicionar, remover, removerItem, limpar, quantidadeTotal } = useCart()
  const { usuario } = useUser()
  const [feedback, setFeedback] = useState('')
  const unavailable = lista.some(item => item.produto.disponivel === false)
  const addressReady = Boolean(usuario?.endereco && usuario?.numero && usuario?.bairro && usuario?.cidade && usuario?.uf && usuario?.cep)
  const canContinue = lista.length > 0 && !unavailable && addressReady

  function increase(product) {
    setFeedback('')
    try { adicionar(product) } catch (error) { setFeedback(error.message || 'Não foi possível alterar a quantidade.') }
  }

  return (
    <AppScreen className="screen-with-nav menu-screen">
      <TopBar titulo="Carrinho" perfil />
      <main className="catalog-surface order-surface">
        <div className="page-heading">
          <span className="eyebrow">REVISE SUA SELEÇÃO</span>
          <h1>Seu carrinho</h1>
          <p>Confira os produtos, ajuste as quantidades e revise o endereço antes de continuar.</p>
        </div>

        {usuario && (
          <section className="delivery-summary" aria-label="Endereço de entrega">
            <span className="delivery-summary__icon" aria-hidden="true">⌂</span>
            <div>
              <strong>Entregar em</strong>
              {addressReady
                ? <span>{usuario.endereco}, {usuario.numero} · {usuario.bairro} · {usuario.cidade}/{usuario.uf}</span>
                : <span>Complete seu endereço para calcular a entrega.</span>}
              {usuario.complemento ? <small>{usuario.complemento}</small> : null}
              <Link to="/perfil?editar=endereco">{addressReady ? 'Alterar endereço' : 'Completar endereço'}</Link>
            </div>
          </section>
        )}

        <section className="cart-panel" aria-label="Itens do carrinho">
          {lista.length === 0 ? (
            <div className="empty-state">
              <span aria-hidden="true">🛒</span>
              <h2>Seu carrinho está vazio</h2>
              <p>Explore os pratos e escolha o que deseja pedir.</p>
              <button className="btn btn-primary" type="button" onClick={() => navigate('/pratos')}>Explorar pratos</button>
            </div>
          ) : (
            <>
              <div className="cart-panel-heading">
                <strong>{quantidadeTotal} {quantidadeTotal === 1 ? 'item' : 'itens'}</strong>
                <button type="button" className="cart-clear" onClick={() => { limpar(); setFeedback('') }}>Limpar carrinho</button>
              </div>
              {lista.map(({ produto, quantidade }) => (
                <article className="cart-item" key={produto.id}>
                  <img src={produto.imagem || '/icons/app-icon.svg'} alt="" loading="lazy" />
                  <div className="cart-item__copy">
                    <strong>{produto.nome}</strong>
                    {produto.companyName && <small className="cart-company-name">{produto.companyName}</small>}
                    {produto.detalhes && <span>{produto.detalhes}</span>}
                    {produto.oferta && <span className="cart-offer">{produto.oferta.percentual}% de desconto · {produto.oferta.titulo}</span>}
                    {produto.disponivel === false && <span className="cart-unavailable" role="status">Produto indisponível. Remova para continuar.</span>}
                    <small>{formatarMoeda(produto.preco)} cada · {formatarMoeda(produto.preco * quantidade)}</small>
                    <button type="button" className="cart-remove-item" onClick={() => removerItem(produto.id)}>Remover produto</button>
                  </div>
                  <div className="qty-control" aria-label={'Quantidade de ' + produto.nome}>
                    <button type="button" aria-label={'Diminuir ' + produto.nome} disabled={quantidade <= 1} onClick={() => remover(produto.id)}>−</button>
                    <output aria-live="polite">{quantidade}</output>
                    <button type="button" aria-label={'Aumentar ' + produto.nome} disabled={quantidade >= 50} onClick={() => increase(produto)}>+</button>
                  </div>
                </article>
              ))}
            </>
          )}

          {lista.length > 0 && (
            <>
              <div className="order-breakdown">
                <p><span>Subtotal dos produtos</span><strong>{formatarMoeda(subtotal)}</strong></p>
                <p><span>Taxa de entrega</span><strong>{taxaEntrega === null ? 'A calcular na próxima etapa' : taxaEntrega === 0 ? 'Grátis' : formatarMoeda(taxaEntrega)}</strong></p>
                <small>Os preços e a taxa definitivos serão recalculados e confirmados pelo estabelecimento antes do pagamento.</small>
                <div className="order-total"><span>Total estimado</span><strong>{taxaEntrega === null ? 'Subtotal + entrega' : formatarMoeda(subtotal + taxaEntrega)}</strong></div>
              </div>

              {unavailable && <p className="cart-alert" role="alert">Há produto indisponível no carrinho. Remova-o para continuar.</p>}
              {!addressReady && <p className="cart-alert" role="status">Informe seu endereço completo no perfil para prosseguir.</p>}
              {feedback && <p className="cart-alert" role="alert">{feedback}</p>}

              <div className="two-actions">
                <button className="btn btn-secondary" type="button" onClick={() => navigate(storePath(companyId))}>Continuar comprando</button>
                <button className="btn btn-primary" type="button" disabled={!canContinue} onClick={() => navigate('/pagamento')}>Continuar para pagamento</button>
              </div>
            </>
          )}
        </section>
      </main>
      <BottomNav />
    </AppScreen>
  )
}
