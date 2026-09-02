# PratoPronto — React + Vite

Versão do aplicativo **PratoPronto** organizada em React, usando componentes, páginas, rotas e arquivos separados, seguindo a estrutura sugerida no projeto de referência.

## Estrutura

```text
src/
├── App.jsx
├── App.css
├── index.css
├── index.jsx
├── firebase.js
├── mobile-responsive.css
│
├── components/
│   ├── AppScreen.jsx
│   ├── BottomActions.jsx
│   ├── ProductCard.jsx
│   ├── ProductGrid.jsx
│   └── TopBar.jsx
│
├── context/
│   └── CartContext.jsx
│
├── data/
│   └── produtos.js
│
├── pages/
│   ├── Home.jsx
│   ├── Login.jsx
│   ├── Cadastro.jsx
│   ├── Pizzas.jsx
│   ├── Bebidas.jsx
│   ├── Pedido.jsx
│   ├── Pagamento.jsx
│   └── Acompanhamento.jsx
│
└── utils/
    ├── cartao.js
    └── moeda.js
```

## O que cada parte faz

- `Home.jsx`: tela inicial com logo e botão Entrar.
- `Login.jsx`: login demonstrativo.
- `Cadastro.jsx`: cadastro demonstrativo.
- `Pizzas.jsx`: lista e pesquisa de pizzas.
- `Bebidas.jsx`: lista e pesquisa de bebidas.
- `Pedido.jsx`: carrinho, quantidades e total.
- `Pagamento.jsx`: formulário de cartão e total da compra.
- `Acompanhamento.jsx`: acompanhamento ilustrativo da entrega.
- `produtos.js`: dados das pizzas e bebidas.
- `CartContext.jsx`: carrinho compartilhado entre as páginas e salvo no `localStorage`.
- `firebase.js`: configuração preparada para Firebase por variáveis de ambiente.
- `utils/`: funções pequenas reutilizáveis, como moeda e formatação de cartão.

## Rodando no GitHub Codespaces

1. Suba todo o projeto para um repositório no GitHub.
2. Abra **Code → Codespaces → Create codespace on main**.
3. O Codespace executa `npm install` automaticamente.
4. No terminal, rode:

```bash
npm run dev
```

5. Abra a porta `5173` quando o Codespaces oferecer o preview.

## Firebase

O projeto funciona em modo demonstração mesmo sem Firebase.

Se quiser ativar Firebase, copie `.env.example` para `.env` e preencha os valores do projeto criado no Firebase Console.

```bash
cp .env.example .env
```

Nunca coloque senhas ou chaves privadas no GitHub. As chaves web públicas do Firebase devem ser configuradas nas variáveis `VITE_FIREBASE_*`.

## Rotas

- `/` — início
- `/login` — login
- `/cadastro` — cadastro
- `/pizzas` — pizzas
- `/bebidas` — bebidas
- `/pedido` — carrinho
- `/pagamento` — pagamento
- `/acompanhamento` — acompanhamento

## Próximas melhorias sugeridas

- Firebase Authentication real.
- Firestore para produtos e pedidos.
- Endereço de entrega.
- PIX e outras formas de pagamento.
- Painel administrativo para cadastrar produtos.
- Mapa real com API de mapas.
