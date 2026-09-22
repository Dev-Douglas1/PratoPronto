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
        <p>Tratamos dados de conta e perfil, como nome, e-mail, telefone e endereço; dados de pedidos, atendimento, avaliações e identificadores técnicos necessários à segurança e ao funcionamento do aplicativo. Empresas tratam os dados necessários para preparar e atender pedidos vinculados a elas.</p>
        <p>Para quem solicita cadastro como Piloto Parceiro, também tratamos cidade, placa, tipo/modelo e cor da moto, categoria e validade da CNH, foto do piloto, foto da moto e imagens da CNH enviadas para análise.</p>

        <h4>2. Finalidades</h4>
        <ul>
          <li>Criar, verificar e proteger contas.</li>
          <li>Permitir busca de empresas e produtos, registrar, preparar, entregar e acompanhar pedidos.</li>
          <li>Permitir que empresas gerenciem equipe, cardápio, pedidos, avaliações e atendimento.</li>
          <li>Verificar cadastros de Pilotos Parceiros antes de liberar ofertas de entrega.</li>
          <li>Permitir que pilotos aceitem ou recusem ofertas e concluam entregas com senha informada pelo cliente.</li>
          <li>Prevenir fraude, abuso e acesso indevido.</li>
          <li>Enviar comunicações de segurança e, separadamente, promoções quando houver escolha do usuário.</li>
        </ul>

        <h4>3. Base e necessidade</h4>
        <p>Dados necessários para conta, pedido, entrega, administração da empresa e análise do piloto são tratados para viabilizar o serviço e cumprir obrigações aplicáveis. Marketing permanece opcional. O envio de documentação de piloto ocorre somente quando o usuário decide solicitar acesso à função de Piloto Parceiro.</p>

        <h4>4. Pagamentos</h4>
        <p>Na versão atual, o meio operacional liberado é pagamento na entrega/maquininha. Pix e cartão online somente poderão ser disponibilizados após integração e homologação específicas. O PratoPronto não deve armazenar número completo de cartão, CVV ou senha bancária.</p>

        <h4>5. Compartilhamento e acesso</h4>
        <p>O Supabase é utilizado para autenticação, banco de dados, atualizações em tempo real e armazenamento privado. Empresas recebem apenas os dados necessários aos pedidos e à operação de suas próprias lojas. Pilotos recebem somente informações necessárias às entregas que aceitaram. Documentos de Pilotos Parceiros não são exibidos às empresas; ficam em armazenamento privado e podem ser acessados pelo próprio titular e por administradores da plataforma autorizados para análise.</p>
        <p>Não há venda de dados pessoais.</p>

        <h4>6. Retenção</h4>
        <p>{store?.retentionDays ? `Os dados de contato e entrega em pedidos encerrados seguem a configuração operacional de retenção de ${store.retentionDays} dias, sem prejuízo de obrigações legais aplicáveis.` : privacyConfig.retentionOrders}</p>
        <p>Documentos de piloto devem permanecer somente pelo período necessário para análise, operação, prevenção de fraude, exercício de direitos e obrigações aplicáveis. Cadastros rejeitados, inativos ou encerrados devem ter os documentos eliminados conforme a política operacional de retenção da plataforma.</p>

        <h4>7. Direitos</h4>
        <p>O titular pode acessar e corrigir dados de perfil, alterar preferências, solicitar informações e pedir exclusão pela área de privacidade, observadas hipóteses legais de retenção. Pilotos podem corrigir e reenviar documentação quando o cadastro for reprovado.</p>

        <h4>8. Segurança</h4>
        <p>A autenticação utiliza Supabase Auth com verificação de e-mail. O banco usa Row Level Security e RPCs com validação de identidade e papel. Documentos de piloto ficam em bucket privado com regras de acesso por usuário e administração da plataforma. Senhas de entrega são protegidas e removidas após a confirmação da entrega.</p>

        <h4>9. Alterações</h4>
        <p>Mudanças relevantes desta política exigem atualização de versão e comunicação clara antes de novos tratamentos incompatíveis com a versão anterior.</p>
      </div>
    </AppScreen>
  )
}
