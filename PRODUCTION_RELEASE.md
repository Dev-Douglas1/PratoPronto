# PratoPronto — preparação para produção

Este documento descreve o caminho recomendado para publicar o mesmo PratoPronto na Web e, depois, na Google Play como PWA/TWA.

## 1. Publicação Web

O projeto usa Firebase Hosting. Não publique a raiz do repositório como site estático: o Vite precisa gerar a pasta `dist` primeiro. Publicar os arquivos-fonte diretamente pode resultar em tela vazia ou falha ao carregar os módulos.

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

No GitHub, crie o Environment `production` e configure as variáveis públicas com os mesmos nomes `VITE_*` acima. Configure também o secret:

- `FIREBASE_SERVICE_ACCOUNT`: JSON completo de uma conta de serviço com as permissões mínimas necessárias para Hosting e Firestore Rules.

Depois abra **Actions > Publicar PratoPronto em produção > Run workflow**.

## 2. Corrigir o administrador para uso real

A versão de produção não deve promover administrador por um e-mail codificado no navegador.

Use uma destas opções confiáveis:

### Opção A — documento de administrador

No Firebase Console, descubra o UID do usuário em **Authentication > Users**. Depois, no Firestore Console, crie manualmente:

`admins/UID_DO_USUARIO`

Campos sugeridos:

```text
email: e-mail da conta empresarial
role: restaurant_admin
permissions: [orders, catalog, reviews, delivery, refunds]
createdAt: timestamp atual
updatedAt: timestamp atual
```

A criação é feita pelo Console/Admin SDK, não pelo navegador. O e-mail da conta precisa estar verificado para liberar ações administrativas.

### Opção B — Custom Claim

Em um backend confiável com Firebase Admin SDK, atribua a claim:

```json
{ "restaurant_admin": true }
```

O cliente já reconhece essa claim. Após alterar claims, faça logout/login ou force renovação do token.

## 3. Firebase Authentication

Antes de receber clientes reais:

1. Ative apenas os provedores de login que serão usados.
2. Em **Authentication > Settings > Authorized domains**, deixe apenas os domínios reais do app, os domínios Firebase necessários e os ambientes de desenvolvimento necessários.
3. Configure um e-mail de suporte real.
4. Personalize os modelos de verificação de e-mail e recuperação de senha.
5. Exija e-mail verificado para ações empresariais sensíveis.

## 4. App Check

1. Registre o app Web no Firebase App Check.
2. Configure reCAPTCHA Enterprise e coloque a chave em `VITE_FIREBASE_APPCHECK_SITE_KEY`.
3. Publique e monitore métricas primeiro.
4. Só depois habilite enforcement para Firestore/serviços usados.

Uma chave errada de App Check não deve mais derrubar toda a interface; o aplicativo registra o erro no console e continua abrindo para facilitar diagnóstico.

## 5. Pagamentos

Em produção, o cartão demonstrativo fica desativado por padrão. Até existir integração real, o fluxo público usa **pagamento na entrega**.

Não habilite `VITE_ENABLE_CARD_DEMO=true` em produção.

Para cartão real, use um gateway com tokenização no SDK oficial e confirmação em backend/webhook. Número completo do cartão e CVV nunca devem ser enviados ao Firestore nem processados pelo próprio frontend.

## 6. Preço e estoque

As validações atuais melhoram o fluxo normal, mas cliente web não deve ser a autoridade final de preço, estoque, frete ou pagamento em uma operação comercial de alto volume.

Antes de escalar, mova a criação definitiva do pedido e baixa de estoque para backend/Cloud Functions com transação atômica.

## 7. Política de privacidade / LGPD

Antes de produção:

- use um e-mail real em `VITE_PRIVACY_EMAIL`;
- informe o controlador em `VITE_CONTROLLER_NAME`;
- revise a política com a operação real, fornecedores e meios de pagamento;
- defina prazo de retenção para pedidos e dados fiscais;
- mantenha um processo para exportação, correção e exclusão quando aplicável;
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

Antes do lançamento final, confira no projeto Android gerado se o `targetSdkVersion` atende à exigência vigente da Google Play.

## 9. Digital Asset Links

Depois que a chave de assinatura do Google Play existir, copie `play-store/assetlinks.template.json` para:

```text
public/.well-known/assetlinks.json
```

Substitua o package name e a impressão SHA-256 pelo certificado de **App Signing** exibido no Play Console. Depois publique novamente o Firebase Hosting.

O arquivo precisa ficar acessível em:

```text
https://SEU_DOMINIO/.well-known/assetlinks.json
```

## 10. Checklist antes do primeiro cliente

- [ ] Site publicado via `dist`, não pelos fontes Vite.
- [ ] HTTPS funcionando.
- [ ] Firebase Authentication funcionando no domínio real.
- [ ] Firestore Rules publicadas.
- [ ] Conta empresarial criada pelo Console/Admin SDK.
- [ ] E-mail empresarial verificado.
- [ ] App Check configurado e monitorado.
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
