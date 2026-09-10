# PratoPronto — modelo de ameaça e defesas

Este documento descreve, em nível defensivo, os principais caminhos de abuso que precisam ser considerados antes do lançamento.

## Objetivo

O aplicativo deve continuar seguro mesmo quando o navegador do cliente for considerado não confiável. Valores financeiros, estoque e criação final do pedido não podem depender apenas do JavaScript da interface.

## Ameaças consideradas

### 1. Automação e excesso de requisições

Um robô pode tentar chamar repetidamente o endpoint de compra para consumir recursos ou gerar pedidos em massa.

Defesas:

- limite de 10 tentativas de checkout por minuto por IP antes de Auth/Firestore;
- limite de 3 tentativas por minuto por usuário autenticado;
- e-mail verificado obrigatório;
- App Check obrigatório no backend de produção;
- somente `POST /orders` executa a operação de compra;
- erro 429 com `Retry-After`.

### 2. Cliente modificado

O JavaScript do navegador pode ser alterado localmente. Por isso, o Worker ignora preço, total, frete, nome do produto e estoque enviados pelo cliente e recalcula os valores usando dados confiáveis.

Defesas:

- servidor recebe apenas identificador, quantidade e personalização necessária;
- preço, frete e estoque são recalculados no backend;
- dados de entrega vêm do perfil autenticado;
- modo seguro das Firestore Rules bloqueia criação direta em `/orders`.

### 3. Reenvio ou clique duplicado

Uma conexão lenta pode fazer o usuário tentar confirmar novamente uma compra que já foi processada. Um robô também pode repetir exatamente a mesma solicitação.

Defesas:

- toda compra exige `Idempotency-Key` aleatória;
- o backend deriva um identificador determinístico por usuário + tentativa;
- a mesma tentativa retorna o pedido já criado em vez de criar outro;
- estoque não é baixado duas vezes para a mesma tentativa;
- o navegador preserva a chave por até 30 minutos durante retries da mesma compra.

### 4. Payload malformado ou excessivo

Defesas:

- `Content-Type: application/json` obrigatório;
- corpo máximo de 32 KiB validado pelo tamanho real recebido, e não apenas por `Content-Length`;
- limites de quantidade, número de itens e tamanho de textos no domínio;
- métodos e rotas não esperados são rejeitados.

### 5. Chamadas fora do aplicativo

Defesas:

- lista explícita de origens CORS;
- origem de navegador obrigatória para `POST /orders` em produção;
- Firebase Authentication válido;
- `email_verified=true`;
- Firebase App Check válido.

A validação de `Origin` é apenas defesa adicional; clientes fora do navegador podem falsificar esse cabeçalho. Auth e App Check continuam sendo as barreiras principais.

### 6. Esgotamento da cota gratuita

Quando a cota diária do backend gratuito termina, o checkout falha fechado. O aplicativo não cria pedido direto no Firestore como fallback.

O restante do aplicativo pode continuar disponível: cardápio, conta, perfil, acompanhamento e Área da Empresa. Apenas novas compras ficam temporariamente indisponíveis.

## Antes de ativar `VITE_SECURE_ORDER_BACKEND=true`

- substituir `FIREBASE_PROJECT_NUMBER` no `worker/wrangler.toml` pelo número real do projeto;
- confirmar App Check funcionando no domínio real;
- publicar o Worker com `REQUIRE_APP_CHECK=true`;
- testar uma compra completa;
- trocar `ALLOW_CODESPACES=false` antes do lançamento final;
- publicar as regras seguras do Firestore, bloqueando `create` direto em `/orders`.

## Proteção adicional recomendada quando houver domínio próprio

Colocar o endpoint do Worker em um subdomínio do próprio negócio e aplicar regras Cloudflare WAF/Rate Limiting antes da execução do Worker. Isso reduz abuso na borda e complementa os limites existentes dentro do Worker.

Nenhuma camada isolada torna um serviço impossível de derrubar. A segurança depende de camadas independentes e de falhar fechado quando a validação autoritativa não estiver disponível.
