import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { privacyConfig } from '../config/privacy.js'

export default function PoliticaPrivacidade() {
  return (
    <AppScreen>
      <TopBar titulo="Política de Privacidade" />
      <div className="light-card legal-card">
        <h3>Política de Privacidade — PratoPronto</h3>
        <p><strong>Versão:</strong> {privacyConfig.policyVersion}</p>
        <p><strong>Controlador:</strong> {privacyConfig.controllerName}</p>
        <p><strong>Contato de privacidade:</strong> {privacyConfig.privacyEmail}</p>

        <h4>1. Dados tratados</h4>
        <p>Nome, e-mail, telefone, endereço de entrega, preferências de comunicação, dados do pedido e identificadores técnicos necessários ao funcionamento do Firebase.</p>

        <h4>2. Finalidades</h4>
        <ul>
          <li>Criar e proteger a conta do usuário.</li>
          <li>Registrar, preparar, entregar e acompanhar pedidos.</li>
          <li>Atender solicitações e exercer direitos relacionados aos dados pessoais.</li>
          <li>Enviar promoções somente quando o usuário escolher essa opção.</li>
        </ul>

        <h4>3. Bases legais</h4>
        <p>Os dados necessários para cadastro, pedido e entrega são tratados para viabilizar o serviço contratado e cumprir obrigações aplicáveis. O recebimento de marketing é opcional e depende do consentimento do usuário.</p>

        <h4>4. Pagamentos</h4>
        <p>O PratoPronto não deve armazenar número completo do cartão, CVV ou senha. A tela atual é demonstrativa; antes de cobrar clientes reais, o pagamento deve ser integrado a um gateway que tokenize/processa os dados do cartão.</p>

        <h4>5. Compartilhamento</h4>
        <p>Os dados podem ser tratados por fornecedores de infraestrutura estritamente necessários ao serviço, como Firebase/Google Cloud e, quando integrado, o provedor de pagamento. Não há venda de dados pessoais.</p>

        <h4>6. Retenção</h4>
        <p>{privacyConfig.retentionOrders}</p>

        <h4>7. Direitos do titular</h4>
        <p>O usuário pode acessar, corrigir, exportar e solicitar exclusão dos dados, além de alterar sua preferência de marketing na área “Privacidade”. Algumas informações podem precisar ser mantidas quando houver obrigação legal ou outra hipótese permitida pela LGPD.</p>

        <h4>8. Segurança</h4>
        <p>Autenticação é feita pelo Firebase Authentication e o banco deve ser protegido por regras do Firestore que limitem cada usuário aos próprios dados. O carrinho pode ser mantido localmente no navegador para conveniência.</p>

        <h4>9. Alterações</h4>
        <p>Quando esta política mudar de maneira relevante, a versão deve ser atualizada e os usuários devem ser informados de forma clara.</p>
      </div>
    </AppScreen>
  )
}
