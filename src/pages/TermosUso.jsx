import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { privacyConfig } from '../config/privacy.js'

export default function TermosUso() {
  return (
    <AppScreen>
      <TopBar titulo="Termos de Uso" />
      <div className="light-card legal-card">
        <h3>Termos de Uso — PratoPronto</h3>
        <p><strong>Responsável:</strong> {privacyConfig.controllerName}</p>
        <ul>
          <li>Usuários devem fornecer informações verdadeiras e proteger a própria conta.</li>
          <li>Cada empresa é responsável por manter cardápio, disponibilidade, horários, taxas e dados operacionais corretos.</li>
          <li>Preços e disponibilidade são confirmados no momento do pedido; o servidor recalcula os valores antes da criação definitiva.</li>
          <li>O carrinho não mistura produtos de empresas diferentes no mesmo pedido.</li>
          <li>Na versão atual, o pagamento operacional liberado é pagamento na entrega/maquininha. Meios online dependem de futura homologação.</li>
          <li>Solicitações de cancelamento e atendimento seguem o status do pedido e as regras da empresa responsável.</li>
          <li>Piloto Parceiro é uma função separada da equipe interna das empresas e depende de cadastro e aprovação da plataforma.</li>
          <li>Para ser aprovado como Piloto Parceiro, o usuário deve fornecer dados verdadeiros da moto e documentação válida. Fraude documental, uso de conta de terceiro ou compartilhamento indevido de acesso pode resultar em bloqueio.</li>
          <li>O piloto decide aceitar ou recusar cada oferta. Depois de aceitar, deve seguir o fluxo do pedido e somente concluir a entrega com a senha informada pelo cliente no momento da entrega.</li>
          <li>O cliente não deve informar a senha de entrega antes de estar com o pedido em mãos.</li>
          <li>Históricos e dados podem ser mantidos conforme a Política de Privacidade e obrigações aplicáveis.</li>
        </ul>
        <p>Horários, bairros atendidos, taxas e previsão de entrega são informados por cada empresa. A comanda de entrega é documento operacional e não substitui documento fiscal.</p>
      </div>
    </AppScreen>
  )
}
