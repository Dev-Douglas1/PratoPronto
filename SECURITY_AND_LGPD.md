# Checklist de lançamento — Segurança e LGPD

## Implementado no projeto

- Firebase Authentication para credenciais.
- Senha não salva no Firestore nem no localStorage.
- Perfis e pedidos associados ao UID.
- Rotas do cliente protegidas por autenticação.
- Área da empresa protegida por perfil administrativo.
- Firestore Rules separando cliente e administrador.
- Validação de dados obrigatórios de perfil e entrega.
- Validação de total, disponibilidade e estoque no fluxo normal de checkout.
- Cliente não altera livremente status de pedido.
- Reembolso do cliente limitado a pedidos entregues ou cancelados.
- Avaliação vinculada a pedido entregue.
- Cartão demonstrativo sem persistir número completo ou CVV.
- Exportação, correção e exclusão dos próprios dados.
- Marketing opcional e separado do serviço principal.
- Registro da versão da Política/Termos e timestamp do aceite.
- Firebase App Check opcional com reCAPTCHA Enterprise.
- PWA com atualização de cache e service worker sem cache no Hosting.
- CI executando build e smoke tests das rotas principais.

## Ainda obrigatório antes de produção

1. **Remover o bootstrap administrativo por e-mail de teste.** Use Firebase Admin SDK/Custom Claims para definir administradores em ambiente confiável.
2. **Criar backend para preços e pagamentos.** O navegador não pode ser a fonte final de verdade de preço, estoque, frete, pagamento ou reembolso.
3. Integrar Mercado Pago (ou outro gateway) por backend protegido, usando tokens/IDs de pagamento e webhook.
4. Fazer baixa de estoque e confirmação de pedido em transação/backend para evitar corrida entre pedidos simultâneos.
5. Publicar e testar `firestore.rules` em cada ambiente; nunca usar `allow read, write: if true`.
6. Configurar App Check, monitorar métricas e depois habilitar enforcement nos serviços adequados.
7. Configurar somente os domínios necessários no Firebase Authentication.
8. Revisar Política de Privacidade e Termos com os fornecedores e a operação reais.
9. Definir retenção de pedidos, notas e registros conforme obrigações fiscais e legais.
10. Criar processo humano para solicitações LGPD, incidentes, cancelamentos e disputas.
11. Configurar e-mail/canal real do controlador em `VITE_PRIVACY_EMAIL` e nome em `VITE_CONTROLLER_NAME`.
12. Manter dependências atualizadas e acompanhar alertas do GitHub/Firebase.
13. Proteger a branch `main` e exigir o workflow `Verificar PratoPronto` antes de merge quando o projeto entrar em uso real.

## Observação sobre cartão demonstrativo

A tela atual de cartão existe somente para demonstração de interface. Mesmo sem persistir CVV/número, **não use esse formulário para cobrar clientes reais**. Em produção, os campos sensíveis devem ser tokenizados diretamente pelo SDK do provedor de pagamento e a confirmação deve ocorrer no backend.

## Observação sobre validações no cliente

As validações adicionadas ao React e aos serviços melhoram a consistência do uso normal e impedem erros acidentais. Elas não substituem controles server-side contra um cliente malicioso. Para operação comercial, preço, frete, estoque, pagamento e reembolso precisam ser confirmados em ambiente confiável.
