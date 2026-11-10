import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { Link } from 'react-router-dom'

const deliveries = [
  { id: 'DEMO-203', route: 'Centro → Alto da XV', value: 'R$ 12,00', status: 'Oferta ilustrativa' },
  { id: 'DEMO-202', route: 'Bacacheri → Boa Vista', value: 'R$ 15,50', status: 'Entrega fictícia concluída' },
]

export default function DemoPilot() {
  return <AppScreen>
    <TopBar titulo="Demonstração do piloto" />
    <div className="page-heading">
      <span className="eyebrow">AMBIENTE DE TESTE · SOMENTE LEITURA</span>
      <h1>Painel do piloto parceiro</h1>
      <p>Conteúdo totalmente fictício. Esta demonstração não consulta ofertas reais nem permite aceitar, iniciar ou concluir entregas.</p>
    </div>
    <section className="company-demo-grid">
      <article className="light-card"><small>Status ilustrativo</small><h2>Disponível</h2><p>Não altera seu cadastro real</p></article>
      <article className="light-card"><small>Entregas demonstrativas</small><h2>12</h2><p>Quantidade fictícia</p></article>
      <article className="light-card"><small>Ganhos ilustrativos</small><h2>R$ 186,00</h2><p>Não é saldo nem pagamento</p></article>
    </section>
    <section className="light-card">
      <h2>Entregas fictícias</h2>
      {deliveries.map(delivery => <article className="company-demo-order" key={delivery.id}>
        <strong>{delivery.id}</strong><p>{delivery.route}</p><p>{delivery.value} · {delivery.status}</p>
      </article>)}
    </section>
    <section className="light-card">
      <h2>Fluxo de demonstração</h2>
      <ol><li>Receber uma oferta</li><li>Conferir origem, destino e valor</li><li>Aceitar a entrega</li><li>Confirmar retirada e entrega com código</li></ol>
      <p>As ações operacionais só ficam disponíveis na área real após aprovação e liberação do cadastro.</p>
      <Link className="btn btn-secondary" to="/perfil">Voltar ao perfil</Link>
    </section>
  </AppScreen>
}
