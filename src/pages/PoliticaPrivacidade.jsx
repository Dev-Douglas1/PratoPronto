import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { privacyConfig } from '../config/privacy.js'

import useStorefront from '../hooks/useStorefront.js'

export default function PoliticaPrivacidade() {
  const { store } = useStorefront()
  return (
    <AppScreen>
      <TopBar titulo="Política de Privacidade" />
      <div className="light-card legal-card">
        <h3>Política de Privacidade — PratoPronto</h3>
        <p><strong>Versão:</strong> {privacyConfig.policyVersion}</p>
        <p><strong>Controlador:</strong> {store?.legalName || privacyConfig.controllerName}</p>
        <p><strong>Contato de privacidade:</strong> {store?.privacyEmail || privacyConfig.privacyEmail}</p>

        <h4>1. Dados tratados</h4>
        <p>Nome, e-mail, telefone, endereço de entrega, preferências de comunicação, dados do pedido, personalizações, solicitações de atendimento/cancelamento, avaliações voluntárias, respostas da empresa e identificadores técnicos necessários ao funcionamento do Firebase. Para proteger a conta, também registramos o horário do login, o tipo geral de navegador/dispositivo e limites de tentativas de confirmação.</p>

        <h4>2. Finalidades</h4>
        <ul>
          <li>Criar e proteger a conta do usuário.</li>
          <li>Registrar, preparar, entregar e acompanhar pedidos.</li>
          <li>Atender solicitações e exercer direitos relacionados aos dados pessoais.</li>
          <li>Receber avaliações voluntárias sobre comida e entrega, disponíveis ao autor e à empresa para atendimento e melhoria do serviço.</li>
          <li>Prevenir abuso, confirmar o e-mail e controlar o acesso administrativo.</li>
          <li>Enviar links de confirmação e, quando o serviço estiver ativado, avisos de acesso à conta. Essas mensagens de segurança são separadas das promoções.</li>
          <li>Enviar promoções somente quando o usuário escolher essa opção.</li>
        </ul>

        <h4>3. Bases legais</h4>
        <p>Os dados necessários para cadastro, pedido e entrega são tratados para viabilizar o serviço contratado e cumprir obrigações aplicáveis. O recebimento de marketing é opcional e depende do consentimento do usuário.</p>

        <h4>4. Pagamentos</h4>
        <p>Quando a operação real estiver ativada, Pix e cartões online são processados no ambiente do Mercado Pago. O PratoPronto registra valores, método, referência da transação e status de pagamento e devolução. Número completo de cartão e CVV não são enviados ao banco do PratoPronto. A senha da conta é gerenciada pelo Firebase Authentication. Ambientes de teste são identificados na tela e não representam cobrança real.</p>

        <h4>5. Compartilhamento</h4>
        <p>Os dados podem ser tratados por fornecedores de infraestrutura estritamente necessários ao serviço, como Firebase/Google Cloud, hospedagem do aplicativo e Mercado Pago no pagamento online. O Firebase envia o link de confirmação do cadastro. Quando o serviço de avisos de login estiver ativado, o Resend receberá o endereço de e-mail e o conteúdo do aviso para entregar a mensagem. A empresa e o entregador recebem somente as informações necessárias ao atendimento e à entrega. Não há venda de dados pessoais.</p>

        <h4>6. Retenção</h4>
        <p>{store?.retentionDays ? `Os dados de contato e entrega em pedidos encerrados são removidos após ${store.retentionDays} dias sem alteração, conforme a configuração operacional da empresa.` : privacyConfig.retentionOrders} Solicitações de exclusão são processadas no servidor. Pedidos, devoluções e contestações pendentes são resolvidos antes do encerramento; registros mínimos de transações e cópias de segurança seguem os prazos aplicáveis.</p>
        <p>Os links de confirmação têm validade e uso controlados pelo Firebase. O aplicativo não armazena o link de confirmação no perfil nem no navegador. Quando os avisos de login estão ativados, os registros de envio ficam no servidor por até sete dias e são removidos pela rotina de limpeza na próxima execução disponível. Dados tratados pelo provedor de e-mail seguem também os prazos desse fornecedor.</p>

        <h4>7. Direitos do titular</h4>
        <p>O usuário pode acessar, corrigir, exportar e solicitar exclusão dos dados, além de alterar sua preferência de marketing na área “Privacidade”. Algumas informações podem precisar ser mantidas quando houver obrigação legal ou outra hipótese permitida pela LGPD.</p>

        <h4>8. Segurança</h4>
        <p>Autenticação é feita pelo Firebase Authentication, com verificação de e-mail e recuperação de senha. As regras do Firestore limitam clientes aos próprios dados e reservam o painel operacional aos administradores autorizados. O carrinho pode ser mantido localmente no navegador para conveniência.</p>

        <h4>9. Alterações</h4>
        <p>Quando esta política mudar de maneira relevante, a versão deve ser atualizada e os usuários devem ser informados de forma clara.</p>
      </div>
    </AppScreen>
  )
}
