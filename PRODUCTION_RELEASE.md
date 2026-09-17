> **Documento da implementação Cloudflare anterior.** O código foi preservado, mas a interface 2.0 usa o contrato de Cloud Functions em functions/. Não aplique estes passos de publicação à interface atual. Consulte INTEGRACAO_MAIN.md e ATIVAR_OPERACAO.md.

# PratoPronto — preparação para produção

Este documento descreve o caminho recomendado para publicar o mesmo PratoPronto na Web e, depois, na Google Play como PWA/TWA, mantendo o Firebase no plano Spark.

## 1. Publicação Web

O projeto usa Firebase Hosting. Não publique a raiz do repositório como site estático: o Vite precisa gerar a pasta `dist` primeiro.

### Configuração do Firebase

Preencha estas variáveis no ambiente de produção:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_APPCHECK_SITE_KEY`
- `VITE_CONTROLLER_NAME`
- `VITE_PRIVACY_EMAIL`
- `VITE_ENABLE_CARD_DEMO=false`
- `VITE_SECURE_ORDER_BACKEND=false` enquanto o Worker ainda não estiver publicado
- `VITE_SECURE_ORDER_API_URL` depois de publicar o Worker

Antes de publicar, rode:

```bash
npm ci
npm run check:production
npm run build
```

### Publicação manual

```bash
npx firebase-tools login
npx firebase-tools deploy --only hosting,firestore:rules --project SEU_PROJECT_ID
```

### Publicação pelo GitHub Actions

O workflow `.github/workflows/deploy-production.yml` foi preparado para publicação manual e controlada.

No GitHub, use o Environment `production` e configure as variáveis públicas `VITE_*`. Configure também o secret:

- `FIREBASE_SERVICE_ACCOUNT`: JSON completo de uma conta de serviço com as permissões mínimas necessárias para Hosting e Firestore Rules.

Depois abra **Actions > Publicar PratoPronto em produção > Run workflow**.

## 2. Administrador real

A versão de produção não promove administrador por e-mail codificado no navegador.

No Firebase Console, descubra o UID do usuário em **Authentication > Users**. Depois crie manualmente em Firestore:

`admins/UID_DO_USUARIO`

Campos sugeridos:

```text
email: e-mail da conta empresarial
role: restaurant_admin
permissions: [orders, catalog, reviews, delivery, refunds]
createdAt: timestamp atual
updatedAt: timestamp atual
```

O e-mail da conta precisa estar verificado para liberar ações administrativas.

Também é possível usar a Custom Claim `restaurant_admin`, desde que ela seja criada por ambiente confiável.

## 3. Firebase Authentication

Antes de receber clientes reais:

1. Ative apenas os provedores de login usados pelo app.
2. Em **Authentication > Settings > Authorized domains**, mantenha somente os domínios necessários.
3. Configure um e-mail de suporte real.
4. Personalize os modelos de verificação de e-mail e recuperação de senha.
5. Exija e-mail verificado para cliente e empresa nas áreas protegidas.

## 4. App Check

1. Registre o app Web no Firebase App Check.
2. Configure reCAPTCHA Enterprise e coloque a chave em `VITE_FIREBASE_APPCHECK_SITE_KEY`.
3. Publique e teste o site.
4. O Worker começa com `REQUIRE_APP_CHECK=false` para facilitar o primeiro teste.
5. Depois de confirmar que tokens válidos estão sendo enviados, altere o Worker para `REQUIRE_APP_CHECK=true` e publique novamente.
6. Só depois avalie enforcement global do Firestore.

Uma chave errada de App Check não deve derrubar toda a interface; o aplicativo registra o erro no console e continua abrindo para diagnóstico.

## 5. Pagamentos

Em produção, o cartão demonstrativo fica desativado por padrão. Até existir integração real, o fluxo público usa **pagamento na entrega**.

Não habilite `VITE_ENABLE_CARD_DEMO=true` em produção.

Para cartão real, use futuramente um gateway com tokenização e confirmação por backend/webhook. Número completo do cartão e CVV nunca devem ser enviados ao Firestore nem processados pelo frontend.

## 6. Preço, estoque e frete sem Blaze

O backend autoritativo fica em `worker/` e foi preparado para Cloudflare Workers Free. Não é necessário ativar Firebase Blaze para essa etapa.

Antes de ativá-lo no site:

1. publique o Worker;
2. teste `GET /health`;
3. configure `VITE_SECURE_ORDER_API_URL` no GitHub;
4. teste cotação e criação de pedido;
5. ative App Check no Worker;
6. defina `VITE_SECURE_ORDER_BACKEND=true`;
7. publique o PratoPronto novamente.

Quando o modo seguro está ativo, preço, personalização, estoque, frete e dados do perfil são conferidos fora do navegador. A criação de pedido e a baixa de estoque são confirmadas em transação do Firestore.

Consulte `SECURE_ORDER_BACKEND.md` para o passo a passo completo.

## 7. Política de privacidade / LGPD

Antes de produção:

- use um e-mail real em `VITE_PRIVACY_EMAIL`;
- informe o controlador em `VITE_CONTROLLER_NAME`;
- revise a política com a operação real, fornecedores e meios de pagamento;
- defina prazo de retenção para pedidos e dados fiscais;
- mantenha processo para exportação, correção e exclusão quando aplicável;
- não use dados de clientes para marketing sem consentimento adequado.

## 8. Google Play — PWA/TWA

Publique primeiro uma URL HTTPS fixa, por exemplo:

```text
https://SEU_PROJETO.web.app
```

Depois instale Bubblewrap:

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://SEU_PROJETO.web.app/manifest.webmanifest
```

Use um package id que você não pretenda trocar depois do primeiro lançamento, por exemplo:

```text
com.seudominio.pratopronto
```

Depois gere o Android:

```bash
bubblewrap build
```

Antes do lançamento final, confira se o `targetSdkVersion` atende à exigência vigente da Google Play.

## 9. Digital Asset Links

Depois que a chave de assinatura do Google Play existir, copie `play-store/assetlinks.template.json` para:

```text
public/.well-known/assetlinks.json
```

Substitua o package name e a impressão SHA-256 pelo certificado de **App Signing** exibido no Play Console e publique novamente o Firebase Hosting.

## 10. Checklist antes do primeiro cliente

- [ ] Site publicado via `dist`.
- [ ] HTTPS funcionando.
- [ ] Firebase Authentication funcionando no domínio real.
- [ ] Firestore Rules publicadas.
- [ ] Conta empresarial criada pelo Console/Admin SDK.
- [ ] E-mail empresarial verificado.
- [ ] App Check configurado e testado.
- [ ] Worker gratuito publicado e `/health` respondendo.
- [ ] `VITE_SECURE_ORDER_API_URL` configurada.
- [ ] `VITE_SECURE_ORDER_BACKEND=true` somente depois dos testes.
- [ ] Pedido seguro cria `serverValidated: true`.
- [ ] Estoque testado com pedidos concorrentes.
- [ ] Cartão demonstrativo desligado.
- [ ] Pagamento na entrega testado ponta a ponta.
- [ ] Pedido cliente -> empresa testado em dois dispositivos.
- [ ] Cancelamento e reembolso testados.
- [ ] Política de privacidade revisada.
- [ ] E-mail de privacidade real configurado.
- [ ] PWA instalada em Android e iOS para teste.
- [ ] Manifest e service worker carregando sem erro.
- [ ] `assetlinks.json` publicado antes da versão TWA final.
- [ ] Build Android de produção assinado e testado.
