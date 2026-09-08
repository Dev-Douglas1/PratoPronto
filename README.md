# PratoPronto — React + Firebase

Aplicativo de pedidos de pizza com área do cliente e **Área da Empresa 2.0**, construído em React + Vite + Firebase.

## Recursos atuais

### Cliente

- cadastro e login com Firebase Authentication;
- recuperação de senha e verificação de e-mail;
- perfil, endereço e controles de privacidade/LGPD;
- catálogo de pizzas e bebidas com disponibilidade, estoque e preços em tempo real;
- personalização de pizzas por tamanho, borda, adicionais e observação;
- carrinho com limite de estoque;
- taxa de entrega por bairro e entrega grátis por valor configurável;
- pagamento na entrega e cartão em modo demonstrativo;
- acompanhamento de pedidos em tempo real;
- solicitação de cancelamento e reembolso;
- avaliação de comida e entrega após pedido entregue;
- PWA instalável.

### Empresa

A rota `/empresa` é protegida por perfil administrativo e possui:

- visão geral de pedidos;
- pedidos em preparo, entrega e concluídos;
- dados necessários de cliente e entrega;
- atribuição e persistência do motoboy responsável;
- impressão de nota de cozinha e motoboy em 80 mm;
- tratamento de cancelamentos e reembolsos;
- avaliações e respostas da empresa;
- edição de preço, estoque e disponibilidade;
- configuração de taxas de entrega por bairro.

## Segurança importante

- senhas ficam somente no Firebase Authentication;
- número completo de cartão e CVV não são persistidos;
- regras do Firestore separam cliente e administrador;
- pedidos passam por validações de endereço, total, disponibilidade e estoque no fluxo do app;
- o pagamento real ainda **não** está ativado.

O acesso administrativo por e-mail usado durante o desenvolvimento é temporário. Antes do lançamento comercial, migre administradores para **Custom Claims/Admin SDK** e remova o bootstrap de teste das regras.

Preços, estoque, cobrança e reembolso de produção precisam de um backend confiável. Validação no navegador melhora o fluxo normal, mas não substitui validação server-side.

## Configurar Firebase

1. Crie um projeto no Firebase.
2. Adicione um Web App.
3. Em Authentication, ative **E-mail/Senha**.
4. Crie o Firestore Database.
5. Copie `.env.example` para `.env`.
6. Preencha as variáveis `VITE_FIREBASE_*`.
7. Preencha `VITE_CONTROLLER_NAME` e `VITE_PRIVACY_EMAIL`.
8. Publique `firestore.rules`.
9. Adicione o domínio usado pelo app em **Authentication → Configurações → Domínios autorizados**.

```bash
cp .env.example .env
npm ci
npm run dev
```

## Codespaces

O projeto possui `.devcontainer/devcontainer.json` configurado para a porta `5173`. Ao criar ou reconstruir o Codespace:

- `npm ci` é executado na criação;
- o Vite é iniciado automaticamente quando o Codespace inicia;
- a porta `5173` é encaminhada e aberta pelo Codespaces;
- o HMR usa WebSocket seguro no domínio `*.app.github.dev`.

Se um Codespace já existia antes dessa configuração, use **Codespaces: Rebuild Container** uma vez.

O log do Vite iniciado automaticamente fica em:

```bash
cat /tmp/pratopronto-vite.log
```

## Comandos

```bash
npm ci
npm run dev
npm run build
npm run preview
```

## Verificação automática

O workflow `.github/workflows/ci.yml` executa em pushes e pull requests:

1. `npm ci`;
2. servidor Vite de desenvolvimento;
3. smoke test das rotas principais;
4. `npm run build`;
5. preview do build;
6. smoke test das rotas SPA e arquivos PWA.

Rotas verificadas: `/`, `/login`, `/cadastro`, `/pizzas`, `/bebidas`, `/pedido`, `/pagamento`, `/acompanhamento`, `/perfil` e `/empresa`.

## Publicar regras do Firestore

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

## Publicar no Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

O `firebase.json` inclui rewrite SPA e cabeçalhos básicos de segurança. O service worker é servido sem cache para permitir atualização da PWA.

## Dados principais

- `users/{uid}`: perfil e consentimentos;
- `admins/{uid}`: autorização administrativa de desenvolvimento;
- `orders/{orderId}`: pedido, entrega, pagamento não sensível e status;
- `reviews/{orderId}`: avaliação do pedido;
- `catalog/{productId}`: preço, estoque e disponibilidade;
- `settings/delivery`: taxas de entrega.

## Nunca armazenar

- senha do usuário;
- número completo do cartão;
- CVV;
- credenciais privadas do Mercado Pago/Firebase Admin;
- chaves secretas de servidor em variáveis `VITE_*`.

Consulte também `SECURITY_AND_LGPD.md` antes de qualquer lançamento comercial.
