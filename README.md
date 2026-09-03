# PratoPronto — React + Firebase

Versão reorganizada para transformar o protótipo em uma base mais segura para publicação.

## O que foi corrigido

- React com páginas, componentes, contexto e serviços separados.
- Firebase Authentication para cadastro/login: a senha não é salva no Firestore nem no localStorage.
- Cloud Firestore para perfil e pedidos.
- Carrinho permanece no localStorage apenas para conveniência do usuário.
- Área `Privacidade` com exportação, correção e exclusão dos dados da conta.
- Consentimento de marketing separado e opcional.
- Registro da versão da Política de Privacidade/Termos aceita pelo usuário.
- Política de Privacidade e Termos de Uso dentro do app.
- Regras do Firestore para impedir que um usuário leia os dados de outro.
- Pagamento demonstrativo sem persistir número do cartão ou CVV.
- Imagens dos produtos refeitas em SVG local, centralizadas e condizentes com o nome de cada pizza/bebida.

## Estrutura

```text
src/
├── App.jsx
├── App.css
├── firebase.js
├── config/
│   └── privacy.js
├── components/
│   ├── AppScreen.jsx
│   ├── BottomActions.jsx
│   ├── ProductCard.jsx
│   ├── ProductGrid.jsx
│   ├── ProtectedRoute.jsx
│   └── TopBar.jsx
├── context/
│   ├── CartContext.jsx
│   └── UserContext.jsx
├── data/
│   └── produtos.js
├── pages/
│   ├── Home.jsx
│   ├── Login.jsx
│   ├── Cadastro.jsx
│   ├── Pizzas.jsx
│   ├── Bebidas.jsx
│   ├── Pedido.jsx
│   ├── Pagamento.jsx
│   ├── Acompanhamento.jsx
│   ├── Perfil.jsx
│   ├── PrivacidadeDados.jsx
│   ├── PoliticaPrivacidade.jsx
│   └── TermosUso.jsx
├── services/
│   └── storage.js
└── utils/
```

## 1. Configurar Firebase

No Firebase Console:

1. Crie um projeto.
2. Adicione um **Web App**.
3. Em **Authentication**, ative `Email/Password`.
4. Em **Firestore Database**, crie o banco.
5. Copie `.env.example` para `.env`.
6. Preencha as variáveis `VITE_FIREBASE_*` com os dados do seu projeto.
7. Preencha `VITE_CONTROLLER_NAME` e `VITE_PRIVACY_EMAIL` com os dados reais do responsável pelo aplicativo.

```bash
cp .env.example .env
```

Não coloque senhas, chaves privadas ou credenciais de servidor no `.env`. As chaves Web do Firebase identificam o projeto; a proteção do banco depende principalmente de Authentication + Security Rules.

## 2. Aplicar as regras do Firestore

O arquivo `firestore.rules` já está no projeto.

Você pode copiar seu conteúdo para **Firestore > Rules** no Firebase Console ou usar o Firebase CLI.

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

Se `firebase init` perguntar pelo arquivo de regras, use `firestore.rules`.

## 3. Rodar

```bash
npm install
npm run dev
```

No Codespaces, abra a porta `5173`.

## Dados salvos

### `users/{uid}`

- nome
- e-mail
- telefone
- endereço
- número
- bairro
- complemento
- preferência de marketing
- versão da Política de Privacidade
- versão dos Termos
- data/hora do aceite

### `orders/{orderId}`

- dono do pedido (`userId`)
- itens e quantidades
- total
- dados mínimos de contato
- endereço usado na entrega
- status
- método/referência não sensível de pagamento
- timestamps

### Não salvar

- senha do usuário
- número completo do cartão
- CVV
- PIN/senha do cartão

## Pagamento

A tela atual é **demonstrativa**. Antes de cobrar clientes reais, substitua o fluxo por Mercado Pago, Stripe ou outro gateway de pagamento com tokenização. Os dados brutos do cartão não devem ser enviados ao Firestore.

## LGPD

O projeto implementa mecanismos técnicos úteis para LGPD: transparência, separação do consentimento de marketing, acesso/exportação, correção, exclusão, autenticação, minimização de dados e regras de acesso.

Isso não substitui a parte jurídica/operacional: antes do lançamento comercial, preencha o controlador e o canal de privacidade reais, defina retenção, fornecedores, atendimento de solicitações, resposta a incidentes e revise Política/Termos conforme a operação real.
