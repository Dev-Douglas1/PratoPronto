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
          <li>O usuário deve fornecer informações verdadeiras e manter a senha protegida.</li>
          <li>O endereço informado será usado para a entrega do pedido.</li>
          <li>Preços, produtos e disponibilidade devem ser confirmados no momento da compra.</li>
          <li>O pagamento online ocorre no Mercado Pago. O pedido só é liberado para preparo após a confirmação do provedor. Na opção de maquininha, o valor deve ser pago ao receber o pedido. Ambientes identificados como teste não realizam cobranças reais.</li>
          <li>Solicite cancelamento ou ajuda pelo acompanhamento do pedido. Quando aprovado, o reembolso online é solicitado ao Mercado Pago e fica pendente até a confirmação. Pagamentos recebidos na maquininha exigem devolução pela empresa. Os prazos de crédito dependem do meio de pagamento e do provedor.</li>
          <li>O histórico de pedidos pode ser mantido conforme a Política de Privacidade e obrigações legais aplicáveis.</li>
          <li>O usuário pode alterar preferências de marketing, acessar dados e solicitar exclusão pela área de privacidade.</li>
        </ul>
        <p>Horários, bairros atendidos, taxas e previsão de entrega são informados na loja e no resumo da compra. Guarde o número do pedido para falar com o atendimento. A comanda de entrega é um documento operacional e não substitui documento fiscal.</p>
      </div>
    </AppScreen>
  )
}
