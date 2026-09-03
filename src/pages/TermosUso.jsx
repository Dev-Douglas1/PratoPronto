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
          <li>A tela de cartão desta versão é demonstrativa e não representa cobrança real.</li>
          <li>O histórico de pedidos pode ser mantido conforme a Política de Privacidade e obrigações legais aplicáveis.</li>
          <li>O usuário pode alterar preferências de marketing, acessar dados e solicitar exclusão pela área de privacidade.</li>
        </ul>
        <p>Antes da publicação comercial, estes termos devem ser revisados com os dados reais da empresa, regras de entrega, cancelamento, reembolso e atendimento.</p>
      </div>
    </AppScreen>
  )
}
