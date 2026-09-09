# Checklist de lançamento — Segurança e LGPD

## Implementado no projeto

- Firebase Authentication para credenciais.
- Senha não salva no Firestore nem no localStorage.
- Perfis e pedidos associados ao UID.
- Rotas do cliente protegidas por autenticação.
- Área da empresa protegida por perfil administrativo e e-mail verificado.
- Bootstrap administrativo por e-mail fixo removido do fluxo de produção.
- Administrador reconhecido por documento `admins/{uid}` ou Custom Claim `restaurant_admin`.
- Firestore Rules separando cliente e administrador.
- Administrador não recebe leitura irrestrita da coleção completa de perfis.
- Validação de dados obrigatórios de perfil e entrega.
- Validação de total, disponibilidade e estoque no fluxo normal de checkout.
- Cliente não altera livremente status de pedido.
- Reembolso do cliente limitado a pedidos entregues ou cancelados.
- Avaliação vinculada a pedido entregue.
- Cartão demonstrativo desativado por padrão em builds de produção.
- Exportação, correção e exclusão dos próprios dados.
- Marketing opcional e separado do serviço principal.
- Registro da versão da Política/Termos e timestamp do aceite.
- Firebase App Check opcional com reCAPTCHA Enterprise.
- Falha de configuração do App Check não derruba toda a interface; o erro fica diagnosticável no console.
- Error Boundary para evitar tela preta sem explicação em falhas de renderização.
- PWA com atualização de cache e service worker sem cache de dados de conta/pedidos.
- Headers de segurança no Firebase Hosting, incluindo CSP, `X-Content-Type-Options`, `Referrer-Policy` e restrições de permissões do navegador.
- Workflow de CI executando auditoria de dependências, build e smoke tests das rotas principais.
- Workflow manual de produção preparado para compilar e publicar Hosting + Firestore Rules.

## Ainda obrigatório antes de receber clientes reais

1. **Criar o primeiro administrador em ambiente confiável.** Use Firebase Console, Admin SDK ou Custom Claim; nunca promova administrador pelo navegador.
2. **Publicar e testar as novas `firestore.rules`** no projeto real.
3. **Configurar Firebase App Check**, monitorar métricas e só depois habilitar enforcement.
4. **Criar backend para autoridade de preço/estoque/frete/pagamento** antes de escalar a operação. O navegador não deve ser a fonte final de verdade.
5. Fazer baixa de estoque e confirmação definitiva do pedido em transação/backend para evitar corrida entre pedidos simultâneos.
6. Para cartão online, integrar um gateway por SDK oficial + backend + webhook. Não processe cartão diretamente no frontend.
7. Configurar somente os domínios necessários no Firebase Authentication.
8. Revisar Política de Privacidade e Termos com os fornecedores e a operação reais.
9. Definir retenção de pedidos, notas e registros conforme obrigações fiscais e legais.
10. Criar processo humano para solicitações LGPD, incidentes, cancelamentos e disputas.
11. Configurar e-mail/canal real do controlador em `VITE_PRIVACY_EMAIL` e nome em `VITE_CONTROLLER_NAME`.
12. Manter dependências atualizadas e acompanhar alertas do GitHub/Firebase.
13. Proteger a branch `main` e exigir o workflow `Verificar PratoPronto` antes de merge quando o projeto entrar em uso real.
14. Testar o fluxo completo em dois dispositivos: cliente cria pedido e empresa recebe/atualiza até a entrega.
15. Só publicar na Play Store depois de o domínio HTTPS final estar estável e o Digital Asset Links estar configurado.

## Pagamento atual

Em desenvolvimento, o cartão demonstrativo pode ser exibido. Em produção ele fica oculto, salvo se `VITE_ENABLE_CARD_DEMO=true` for definido explicitamente — configuração que não deve ser usada com clientes reais.

Até existir gateway real, a opção segura disponível para produção é pagamento na entrega.

## Validações no cliente

As validações do React e dos serviços melhoram consistência e impedem erros acidentais, mas não substituem controles server-side contra um cliente malicioso. Para operação comercial em escala, preço, frete, estoque, pagamento e reembolso precisam ser confirmados em ambiente confiável.

Consulte também `PRODUCTION_RELEASE.md` para o passo a passo de publicação Web + Google Play.
