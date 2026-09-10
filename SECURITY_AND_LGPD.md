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
- Workflow de CI executando auditoria de dependências, validação do backend gratuito, build e smoke tests das rotas principais.
- Workflow manual de produção preparado para compilar e publicar Hosting + Firestore Rules.

## Backend autoritativo sem Blaze

O projeto não depende mais de Cloud Functions para o backend seguro. O Firebase pode permanecer no plano Spark.

O diretório `worker/` contém uma API para Cloudflare Workers Free. Quando ativada:

- o cliente envia somente ID, quantidade e opções de personalização;
- o Worker valida o Firebase ID Token e exige e-mail verificado;
- o Worker busca perfil, catálogo e configuração de entrega diretamente no Firestore usando uma credencial de servidor guardada como secret;
- preço base, adicionais, borda, tamanho e frete são recalculados fora do navegador;
- estoque é conferido e reduzido em uma transação REST do Firestore;
- o pedido é criado como `serverValidated: true`;
- o Worker pode exigir e validar Firebase App Check;
- as regras seguras bloqueiam `create` direto em `/orders` para navegadores depois que o modo seguro é ativado.

A ativação continua separada do deploy comum. Enquanto `VITE_SECURE_ORDER_BACKEND=false`, o fluxo atual permanece funcional. Depois de publicar e testar o Worker, defina a URL em `VITE_SECURE_ORDER_API_URL` e só então altere a flag para `true`.

## Ainda obrigatório antes de receber clientes reais em escala

1. Publicar `worker/` em uma conta Cloudflare Workers Free e guardar `FIREBASE_SERVICE_ACCOUNT_JSON` apenas como secret do Cloudflare.
2. Configurar `VITE_SECURE_ORDER_API_URL` no Environment `production` do GitHub.
3. Testar `/health`, cotação e criação de pedido antes de ativar o modo seguro.
4. Habilitar `REQUIRE_APP_CHECK=true` no Worker somente depois de confirmar que o cliente real está enviando tokens App Check válidos.
5. Definir `VITE_SECURE_ORDER_BACKEND=true` e publicar novamente o site; o workflow então usa as regras que bloqueiam criação direta de `/orders`.
6. Testar simultaneidade de estoque com dois clientes tentando comprar o último item.
7. Para cartão online, integrar futuramente um gateway por SDK oficial + backend + webhook. Não processe cartão diretamente no frontend.
8. Configurar somente os domínios necessários no Firebase Authentication.
9. Revisar Política de Privacidade e Termos com os fornecedores e a operação reais.
10. Definir retenção de pedidos, notas e registros conforme obrigações fiscais e legais.
11. Criar processo humano para solicitações LGPD, incidentes, cancelamentos e disputas.
12. Configurar e-mail/canal real do controlador em `VITE_PRIVACY_EMAIL` e nome em `VITE_CONTROLLER_NAME`.
13. Manter dependências atualizadas e acompanhar alertas do GitHub/Firebase/Cloudflare.
14. Proteger a branch `main` e exigir o workflow `Verificar PratoPronto` antes de merge quando o projeto entrar em uso real.
15. Testar o fluxo completo em dois dispositivos: cliente cria pedido e empresa recebe/atualiza até a entrega.
16. Só publicar na Play Store depois de o domínio HTTPS final estar estável e o Digital Asset Links estar configurado.

## Pagamento atual

Em desenvolvimento, o cartão demonstrativo pode ser exibido enquanto o backend seguro estiver desligado. Em produção ele fica oculto com `VITE_ENABLE_CARD_DEMO=false`.

No backend seguro desta etapa, somente **pagamento na entrega** é aceito. Cartão real deverá ser integrado posteriormente com tokenização e confirmação por webhook.

## App Check

O frontend envia `X-Firebase-AppCheck` para o Worker quando App Check está disponível. O Worker possui verificação própria do token usando as chaves públicas do Firebase e pode rejeitar chamadas inválidas quando `REQUIRE_APP_CHECK=true`.

Para Firestore usado diretamente pelo frontend, a ativação global de enforcement deve ocorrer somente após observar as métricas e confirmar que o site real e os dispositivos de teste estão recebendo tokens válidos.

## Verificação de e-mail

Clientes e administradores não acessam as áreas operacionais antes de `emailVerified=true`. A conta empresarial continua identificável por `admins/{uid}` antes da confirmação apenas para que o aplicativo consiga encaminhá-la ao fluxo correto de verificação; ações administrativas permanecem bloqueadas.

A expiração exata de 24 horas do link de verificação não é controlável pelo `sendEmailVerification()` do SDK Web. Se essa exigência for mantida, ela deverá ser implementada como fluxo de link personalizado em backend confiável, separado da proteção já existente por `emailVerified`.

Consulte também `SECURE_ORDER_BACKEND.md` e `PRODUCTION_RELEASE.md`.
