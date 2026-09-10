# Checklist de lançamento — Segurança e LGPD

## Implementado no projeto

- Firebase Authentication para credenciais.
- Senha não salva no Firestore nem no localStorage.
- Perfis e pedidos associados ao UID.
- Rotas do cliente protegidas por autenticação e e-mail verificado.
- Área da empresa protegida por perfil administrativo e e-mail verificado.
- Administrador reconhecido por documento `admins/{uid}` ou Custom Claim `restaurant_admin`.
- Falha ao consultar o perfil administrativo é exibida como diagnóstico e não é mais tratada silenciosamente como “não é admin”.
- Firestore Rules separando cliente e administrador.
- Administrador não recebe leitura irrestrita da coleção completa de perfis.
- Operações de pedido, avaliação, catálogo e entrega do cliente exigem e-mail confirmado nas regras.
- Validação de dados obrigatórios de perfil e entrega.
- Cliente não altera livremente status de pedido.
- Reembolso do cliente limitado a pedidos entregues ou cancelados.
- Avaliação vinculada a pedido entregue.
- Cartão demonstrativo desativado por padrão em builds de produção.
- Exportação, correção e exclusão dos próprios dados.
- Marketing opcional e separado do serviço principal.
- Registro da versão da Política/Termos e timestamp do aceite.
- Firebase App Check com reCAPTCHA Enterprise preparado no cliente.
- Falha de configuração do App Check não derruba toda a interface; o erro fica diagnosticável no console.
- Error Boundary para evitar tela preta sem explicação em falhas de renderização.
- PWA com atualização de cache e service worker sem cache de dados de conta/pedidos.
- Headers de segurança no Firebase Hosting, incluindo CSP, `X-Content-Type-Options`, `Referrer-Policy` e restrições de permissões do navegador.
- Workflow de CI executando auditoria de dependências, validação do backend, build e smoke tests das rotas principais.
- Workflow manual de produção preparado para compilar e publicar Hosting + Firestore Rules.

## Backend autoritativo preparado

O projeto contém Cloud Functions `quoteOrder` e `createSecureOrder` para retirar do navegador a autoridade final sobre preço, estoque e frete.

Quando o modo seguro estiver ativado:

- o cliente envia somente ID, quantidade e opções de personalização;
- o servidor busca perfil, catálogo e configuração de entrega;
- preço base, adicionais, borda, tamanho e frete são recalculados no servidor;
- estoque é conferido e reduzido dentro de uma transação do Firestore;
- o pedido é criado pelo Firebase Admin SDK;
- as callable functions exigem Authentication, e-mail verificado e App Check válido;
- as regras seguras bloqueiam `create` direto em `/orders` para navegadores.

A ativação é deliberadamente separada do deploy comum. Cloud Functions de produção exigem um projeto Firebase com faturamento compatível. Enquanto `VITE_SECURE_ORDER_BACKEND=false`, o fluxo atual permanece funcional e as regras mantêm a criação direta validada para não interromper a loja.

## Ainda obrigatório antes de receber clientes reais em escala

1. Publicar `quoteOrder` e `createSecureOrder` no projeto real.
2. Somente depois do deploy das Functions, definir `VITE_SECURE_ORDER_BACKEND=true` no Environment `production` do GitHub e publicar novamente o site.
3. Confirmar que as regras seguras foram geradas pelo workflow e que criação direta de `/orders` ficou bloqueada.
4. Monitorar métricas do Firebase App Check e, depois de validar clientes legítimos, habilitar enforcement nos serviços usados diretamente pelo app, especialmente Firestore.
5. Testar simultaneidade de estoque com dois clientes tentando comprar o último item.
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

Em desenvolvimento, o cartão demonstrativo pode ser exibido enquanto o backend seguro estiver desligado. Em produção ele fica oculto com `VITE_ENABLE_CARD_DEMO=false`.

No backend seguro desta etapa, somente **pagamento na entrega** é aceito. Cartão real deverá ser integrado posteriormente com tokenização e confirmação por webhook.

## App Check

As funções seguras usam `enforceAppCheck: true`, portanto chamadas sem token válido são rejeitadas. Para Firestore, a ativação global de enforcement deve ocorrer somente após observar as métricas e confirmar que o site real e os dispositivos de teste estão recebendo tokens válidos.

## Verificação de e-mail

Clientes e administradores não acessam as áreas operacionais antes de `emailVerified=true`. A conta empresarial continua identificável por `admins/{uid}` antes da confirmação apenas para que o aplicativo consiga encaminhá-la ao fluxo correto de verificação; ações administrativas permanecem bloqueadas.

A expiração exata de 24 horas do link de verificação não é controlável pelo `sendEmailVerification()` do SDK Web. Se essa exigência for mantida, ela deverá ser implementada como fluxo de link personalizado em backend confiável, separado da proteção já existente por `emailVerified`.

Consulte também `PRODUCTION_RELEASE.md` para o passo a passo de publicação Web + Google Play.
