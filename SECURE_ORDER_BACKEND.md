# PratoPronto — backend seguro sem plano Blaze

O PratoPronto mantém o Firebase no plano Spark e usa um Cloudflare Worker como backend autoritativo de pedidos. Assim, não é necessário ativar faturamento no projeto Firebase para publicar Cloud Functions.

## Arquitetura

- Firebase Spark: Authentication, Firestore, Hosting e App Check.
- Cloudflare Workers Free: validação server-side de preço, estoque, frete e criação do pedido.
- `worker/`: código do backend gratuito.
- `VITE_SECURE_ORDER_BACKEND`: liga/desliga o uso da API segura no frontend.
- `VITE_SECURE_ORDER_API_URL`: URL HTTPS do Worker publicado.

O Worker expõe:

- `GET /health`: teste de disponibilidade.
- `POST /quote`: recalcula o pedido no servidor.
- `POST /orders`: recalcula novamente, reduz estoque em transação e cria o pedido.

O navegador envia o Firebase ID Token e, quando App Check estiver configurado, o token `X-Firebase-AppCheck`. O Worker valida o usuário, exige e-mail verificado e usa uma credencial privada guardada como secret do Cloudflare para acessar o Firestore.

## 1. Criar conta Cloudflare gratuita

Crie uma conta Cloudflare e permaneça no plano Workers Free. Não é necessário migrar o Firebase para Blaze.

## 2. Atualizar o projeto no Codespace

```bash
cd /workspaces/PratoPronto
git checkout main
git pull origin main
```

## 3. Preencher o número do projeto no Worker

Abra `worker/wrangler.toml`.

Em:

```toml
FIREBASE_PROJECT_NUMBER = "COLOQUE_SEU_MESSAGING_SENDER_ID"
```

coloque exatamente o mesmo valor usado em `VITE_FIREBASE_MESSAGING_SENDER_ID`.

Não coloque chaves privadas nesse arquivo.

## 4. Entrar no Cloudflare pelo Codespace

```bash
npx wrangler@latest login
```

O terminal fornecerá o fluxo de autorização do Cloudflare.

## 5. Guardar a credencial Firebase como secret

O Worker precisa de uma conta de serviço para escrever no Firestore sem confiar nos valores enviados pelo navegador.

Use o JSON da conta de serviço somente no prompt seguro do Wrangler:

```bash
cd /workspaces/PratoPronto/worker
npx wrangler@latest secret put FIREBASE_SERVICE_ACCOUNT_JSON
```

Quando o Wrangler solicitar o valor, cole o JSON completo da conta de serviço e confirme.

Nunca salve esse JSON em `wrangler.toml`, `.env`, GitHub commit, mensagem ou código-fonte.

## 6. Publicar o Worker

```bash
cd /workspaces/PratoPronto/worker
npx wrangler@latest deploy
```

Ao final, o Cloudflare mostrará uma URL parecida com:

```text
https://pratopronto-api.SEUSUBDOMINIO.workers.dev
```

Teste:

```text
https://pratopronto-api.SEUSUBDOMINIO.workers.dev/health
```

A resposta deve conter `"ok": true`.

## 7. Conectar o frontend ao Worker

No GitHub:

**Settings > Environments > production > Environment variables**

Crie:

```text
VITE_SECURE_ORDER_API_URL=https://pratopronto-api.SEUSUBDOMINIO.workers.dev
```

Mantenha inicialmente:

```text
VITE_SECURE_ORDER_BACKEND=false
```

## 8. Testar App Check sem bloquear tudo

O arquivo `worker/wrangler.toml` começa com:

```toml
REQUIRE_APP_CHECK = "false"
```

Isso permite testar primeiro o Worker, o login e o pedido. O frontend já envia o token App Check quando ele está disponível.

Depois que `/quote` e `/orders` estiverem funcionando com o site real, troque para:

```toml
REQUIRE_APP_CHECK = "true"
```

publique novamente:

```bash
npx wrangler@latest deploy
```

O Worker passa a validar assinatura, emissor, validade e projeto do token App Check.

## 9. Ativar o modo seguro no PratoPronto

Depois do Worker estar publicado e testado, altere no Environment `production`:

```text
VITE_SECURE_ORDER_BACKEND=true
```

Depois execute:

**Actions > Publicar PratoPronto em produção > Run workflow**

Quando a flag fica `true`, o frontend usa o Worker e o workflow publica a versão das regras do Firestore que bloqueia criação direta de pedidos pelo navegador.

A ordem é importante:

1. publicar Worker;
2. testar `/health`;
3. configurar `VITE_SECURE_ORDER_API_URL`;
4. testar cotação e pedido;
5. ativar App Check no Worker;
6. colocar `VITE_SECURE_ORDER_BACKEND=true`;
7. publicar o site e as regras seguras.

## O que o Worker decide

O cliente envia somente o ID, quantidade e escolhas de personalização. O Worker recalcula:

- nome e preço base;
- tamanho, borda e adicionais;
- disponibilidade;
- estoque;
- taxa de entrega;
- entrega grátis;
- subtotal e total;
- endereço e telefone a partir do perfil autenticado;
- forma de pagamento permitida.

Nesta etapa, o backend seguro aceita somente pagamento na entrega.

## Estoque e concorrência

`POST /orders` abre uma transação REST do Firestore. O estoque é lido dentro da transação e a criação do pedido é confirmada junto com as reduções de estoque. Em conflito, o Worker tenta novamente uma vez e pode pedir ao cliente para repetir a confirmação.

A baixa automática só ocorre quando `catalog/{produtoId}` possui um campo numérico `stock`. Produtos sem estoque configurado continuam sem controle quantitativo.

## Segurança da conta de serviço

A conta de serviço é uma credencial de servidor e ignora as Firestore Security Rules. Por isso:

- mantenha-a exclusivamente em secrets do Cloudflare;
- não coloque o JSON no frontend;
- não coloque o JSON no GitHub;
- se uma chave vazar, revogue-a no Google Cloud imediatamente;
- prefira uma conta de serviço dedicada com somente as permissões necessárias ao Firestore.

## Verificação de e-mail

O Worker valida o Firebase ID Token e rejeita pedidos quando `email_verified` não é verdadeiro. Isso vale para clientes; a Área da Empresa também continua exigindo e-mail verificado e perfil `restaurant_admin`.

A expiração exata de 24 horas do link de verificação ainda é uma etapa separada. O `sendEmailVerification()` padrão do Firebase não permite escolher esse TTL exato.
