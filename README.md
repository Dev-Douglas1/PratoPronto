# PratoPronto

Aplicativo React/Vite para pedidos de pizzas e bebidas, com Firebase Authentication, Firestore e backend em Cloud Functions.

- Cliente: conta, confirmação de e-mail, recuperação de senha, endereço completo, cardápio, personalizações, carrinho, resumo de compra, acompanhamento, atendimento e avaliação após entrega.
- Empresa: pedidos e etapas, comandas de cozinha/entrega, preços e disponibilidade, respostas às avaliações, cancelamentos, configuração de horários/bairros/taxas e verificação de serviços.
- Pagamentos: integração de Checkout Pro com Pix/cartões e opção de maquininha. O servidor calcula valores, confirma pagamentos e processa devoluções; a ativação depende das contas e da homologação.
- Segurança: pedidos não podem ser gravados pelo navegador; autenticação verificada, papel administrativo concedido por ferramenta confiável, App Check e limites por usuário. Sem cartão completo, CVV ou senha no Firestore.
- Celular: interface adaptável, PWA instalável, aviso de atualização e página sem conexão. Dados financeiros não são mantidos pelo service worker.

A demonstração empresarial fica em `/demo/empresa/pedidos`, com dados fictícios em memória. A operação real fica em `/empresa/pedidos` e depende do acesso administrativo no Firebase.

## Executar

```bash
npm ci
npm ci --prefix functions
npm run dev
```

Preencha `.env` com a configuração pública Web do Firebase e a chave pública do App Check. Use os exemplos do projeto; não copie credenciais administrativas para o frontend.

## Ativar a operação

Siga [ATIVAR_OPERACAO.md](ATIVAR_OPERACAO.md) para preparar Firebase, conta recebedora, segredos, administrador, horários, entrega, publicação pública e homologação. Consulte [LANCAMENTO.md](LANCAMENTO.md) para o estado desta entrega.

## Testes

```bash
npm test
npm run test:server
npm run test:rules
npm run test:integration
npm run build
```

Os testes de integração usam Firestore Emulator e um provedor de pagamentos controlado. Não movimentam dinheiro nem demonstram, por si só, que uma conta real foi configurada.

## Organização

- `src/`: páginas, componentes, contexto e integração do frontend.
- `functions/src/`: cálculo de pedido, Checkout Pro, confirmação, reembolso, administração e manutenção.
- `functions/src/catalog-data.js`: catálogo público compartilhado entre frontend e servidor.
- `functions/scripts/`: ferramentas de configuração administrativa, autenticadas com a conta Google responsável.
- `firestore.rules` e `firestore.indexes.json`: proteção e índices do banco.
- `ops/`: políticas de monitoramento e ciclo de vida de backups para configuração da operação.

As comandas são documentos não fiscais. Imagens dos produtos e identidade visual permanecem nos arquivos locais do projeto; a documentação específica de origem/licenciamento dos assets deve acompanhar a publicação comercial.
