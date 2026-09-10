# PratoPronto — ativação do backend seguro de pedidos

Este arquivo descreve como ativar o fluxo em que preço, estoque e frete deixam de ser definidos pelo navegador.

## O que já está preparado

O diretório `functions/` contém duas callable functions:

- `quoteOrder`: calcula itens, preços, personalização, frete e total no servidor.
- `createSecureOrder`: valida novamente o pedido, reduz estoque em transação e cria o pedido pelo Firebase Admin SDK.

As duas funções exigem usuário autenticado, e-mail verificado e Firebase App Check válido.

O frontend possui a flag:

```text
VITE_SECURE_ORDER_BACKEND=false
```

Enquanto ela estiver `false`, o fluxo atual continua funcionando. Não altere para `true` antes de publicar as Functions.

## Pré-requisito: Cloud Functions

Cloud Functions em produção exige um projeto Firebase no plano Blaze. Faça o upgrade no Firebase Console antes do primeiro deploy das funções.

## Publicar as Functions

No Codespace atualizado:

```bash
cd /workspaces/PratoPronto
git checkout main
git pull origin main
npm install --prefix functions
npx firebase-tools@latest login --no-localhost
npx firebase-tools@latest deploy --only functions --project pratopronto-d861d
```

Se o Firebase CLI já estiver autenticado, o login pode ser pulado.

O deploy precisa terminar sem erro e listar `quoteOrder` e `createSecureOrder`.

## Ativar o frontend seguro

Somente depois do deploy das Functions:

1. GitHub > PratoPronto > Settings > Environments > `production`.
2. Crie/edite a variável `VITE_SECURE_ORDER_BACKEND` com valor `true`.
3. Execute `Actions > Publicar PratoPronto em produção > Run workflow`.

O workflow compila o frontend usando as Functions. Quando a flag está `true`, ele também gera regras seguras que bloqueiam criação direta de documentos em `/orders` pelo navegador.

A ordem é importante: Functions primeiro, frontend depois, bloqueio de criação direta por último.

## O que o servidor passa a decidir

O cliente envia apenas:

- ID do produto;
- quantidade;
- tamanho, borda e adicionais selecionados.

O servidor decide novamente:

- nome do produto;
- preço base;
- preço dos tamanhos, bordas e adicionais;
- disponibilidade;
- estoque;
- taxa de entrega;
- gratuidade de entrega;
- subtotal e total;
- dados de entrega vindos do perfil autenticado;
- forma de pagamento permitida nesta etapa.

Nesta versão do backend seguro, apenas `cash-on-delivery` / pagamento na entrega é aceito.

## Estoque e concorrência

`createSecureOrder` usa transação do Firestore. Se dois clientes tentarem comprar o último item ao mesmo tempo, a transação é reavaliada e um pedido não deve conseguir deixar o estoque negativo.

A baixa automática ocorre somente quando o documento `catalog/{produtoId}` possui um campo numérico `stock`. Produtos sem documento de catálogo continuam usando o catálogo base e não possuem controle quantitativo de estoque no backend.

## App Check

As callable functions já usam enforcement individual com `enforceAppCheck: true`.

Antes de habilitar enforcement global do Firestore:

1. publique o site com App Check configurado;
2. teste login, cliente, pedido e área da empresa no domínio real;
3. abra Firebase Console > App Check e observe as métricas;
4. confirme que requisições legítimas aparecem como verificadas;
5. então habilite enforcement para Firestore.

Não habilite enforcement global antes dessa observação para evitar bloquear usuários legítimos por uma configuração de chave/domínio incorreta.

## IAM para deploy automatizado de Functions

O deploy manual pelo Codespace pode ser feito com a conta proprietária do projeto. Se futuramente o GitHub Actions também for publicar Functions usando uma conta de serviço, essa identidade deverá ter as permissões específicas de deploy de Cloud Functions, incluindo `Cloud Functions Admin` e `Service Account User`, além das permissões Firebase necessárias.

## Testes obrigatórios depois da ativação

- Cliente sem e-mail verificado não consegue chamar o backend.
- Cliente verificado recebe cotação do servidor.
- Alterar preço no JavaScript/localStorage não altera o preço criado pelo servidor.
- Alterar frete no navegador não altera o frete criado pelo servidor.
- Produto indisponível é recusado.
- Quantidade acima do estoque é recusada.
- Dois pedidos concorrentes não deixam estoque negativo.
- Pedido chega em `/empresa` com `serverValidated: true`.
- Área da empresa continua exigindo `restaurant_admin` e e-mail verificado.

## Verificação de e-mail por 24 horas

A proteção atual usa `emailVerified` do Firebase. O SDK Web não permite definir exatamente 24 horas para o código enviado por `sendEmailVerification()`.

Se a regra de negócio exigir expiração exata em 24 horas, será necessário criar um fluxo de verificação personalizado, com token próprio armazenado/validado no backend e envio de e-mail transacional. Isso deve ser implementado separadamente para clientes e contas empresariais, preservando a exigência final de e-mail confirmado.
