import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { Link } from 'react-router-dom'

const orders = [
  { id: 'DEMO-1042', customer: 'Cliente de demonstração', items: '2 pratos executivos', total: 'R$ 58,00', status: 'Em preparo' },
  { id: 'DEMO-1041', customer: 'Pedido fictício', items: '1 prato + 1 bebida', total: 'R$ 34,50', status: 'Aguardando confirmação' },
  { id: 'DEMO-1040', customer: 'Cliente fictício', items: '3 sobremesas', total: 'R$ 42,00', status: 'Concluído' },
]

export default function DemoCompany() {
  return <AppScreen>
    <TopBar titulo="Demonstração da empresa" />
    <div className="page-heading">
      <span className="eyebrow">AMBIENTE DE TESTE · SOMENTE LEITURA</span>
      <h1>Painel da empresa</h1>
      <p>Esta tela usa dados fictícios. Nenhum pedido, pagamento, produto ou entrega real é consultado ou alterado.</p>
    </div>
    <section className="company-demo-grid">
      <article className="light-card"><small>Pedidos hoje</small><h2>18</h2><p>Dados de demonstração</p></article>
      <article className="light-card"><small>Em preparo</small><h2>4</h2><p>Dados de demonstração</p></article>
      <article className="light-card"><small>Faturamento ilustrativo</small><h2>R$ 684,50</h2><p>Não representa receita real</p></article>
    </section>
    <section className="light-card">
      <h2>Pedidos fictícios</h2>
      {orders.map(order => <article className="company-demo-order" key={order.id}>
        <div><strong>{order.id}</strong><small>{order.customer}</small></div>
        <p>{order.items}</p><p>{order.total} · {order.status}</p>
      </article>)}
    </section>
    <section className="light-card">
      <h2>Recursos que podem ser demonstrados</h2>
      <ul><li>Visão geral de pedidos e status</li><li>Organização do cardápio</li><li>Gestão de equipe e configurações</li><li>Indicadores ilustrativos</li></ul>
      <p>Para operar uma loja real, use a área empresarial vinculada a uma empresa aprovada.</p>
      <Link className="btn btn-secondary" to="/perfil">Voltar ao perfil</Link>
    </section>
  </AppScreen>
}
