# Configuração de produção — Asaas / PratoPronto

**Estado:** Edge Functions implantadas e banco configurado. Cobranças reais permanecem bloqueadas até a configuração das credenciais e da conta Asaas.

## 1. Segredos das Edge Functions

No Supabase Dashboard do projeto, abra **Edge Functions → Secrets** e cadastre:

| Secret | Valor |
|---|---|
| `ASAAS_ENVIRONMENT` | `production` |
| `ASAAS_API_KEY` | Chave da conta principal Asaas do PratoPronto |
| `ASAAS_PLATFORM_WALLET_ID` | `walletId` da conta principal |
| `ASAAS_WEBHOOK_TOKEN` | Token aleatório forte, com 32–255 caracteres |

Não coloque esses valores no GitHub, no React, em variáveis `VITE_*` ou em mensagens. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos pelo ambiente das Edge Functions; não duplique nem exponha a chave de serviço.

O `walletId` principal pode ser consultado na conta principal pela API `GET /v3/wallets/`. O token configurado em `ASAAS_WEBHOOK_TOKEN` deve ser exatamente o mesmo token cadastrado no webhook do Asaas.

## 2. Habilitar Split na conta principal

O Asaas bloqueia Split por padrão em contas novas ou que nunca usaram o recurso. Na conta principal:

1. Acesse **Integrações → Segurança**.
2. Localize **Habilitar Split de pagamento**.
3. Clique em **Habilitar Split** e confirme pelo SMS ou Token App.

A habilitação da conta principal vale para as subcontas. O `walletId` usado no Split deve ser o da plataforma, diferente da carteira que emite a cobrança.

**Atenção ao cálculo:** o Asaas calcula Split sobre `netValue`, depois das taxas. O PratoPronto envia `fixedValue` equivalente a 5% do subtotal dos produtos (frete fora da base). A cobrança será recusada se o valor fixo exceder o líquido disponível; o restaurante arca com as taxas do gateway.

## 3. BaaS e subcontas dos restaurantes

Antes de criar subcontas, o modelo BaaS precisa estar previamente alinhado e habilitado pelo gerente de contas Asaas. Não crie subcontas fora desse modelo.

Depois que o Asaas provisionar a subconta de um restaurante, o proprietário pode abrir **Empresa → Assinatura** e conectar a chave de API dessa subconta. A Edge Function:

- consulta `GET /v3/myAccount/status/`;
- consulta `GET /v3/wallets/`;
- exige aprovação cadastral geral (`general = APPROVED`) para liberar pagamentos;
- guarda a chave no Supabase Vault, nunca em tabela pública ou no navegador.

Se a conta ainda estiver em análise, a chave fica armazenada, mas o checkout Pix continua bloqueado até a aprovação.

## 4. Webhook Asaas

Cadastre no painel Asaas a URL:

`https://hllvhzzbkjmhxymuwqis.supabase.co/functions/v1/asaas-webhook`

Configure o cabeçalho/token de autenticação do webhook com o mesmo valor de `ASAAS_WEBHOOK_TOKEN` (header `asaas-access-token`).

Eventos mínimos:

- `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`
- `PAYMENT_SPLIT_DONE`
- `SUBSCRIPTION_INACTIVATED`
- `SUBSCRIPTION_DELETED`

A Edge Function grava o ID do evento antes de processar, valida o token, consulta a cobrança no Asaas e só então altera o pedido ou a assinatura. Eventos repetidos já processados são ignorados.

## 5. Regras de cobrança

- Plano Profissional: **R$ 49,90/mês**.
- Comissão por pedido: **5% do subtotal dos produtos**, sem a taxa de entrega.
- O pagamento mensal é criado como assinatura Asaas com `billingType = PIX` e ciclo mensal.
- Em contas elegíveis, o Asaas pode oferecer Pix Automático no primeiro QR Code. A autorização é opcional e depende do pagador e do banco. Sem autorização, as cobranças Pix seguintes precisam ser pagas manualmente.
- A assinatura só troca o restaurante para o plano Profissional depois do webhook confirmar o primeiro pagamento.
- Pedidos novos são entregues pelo restaurante; pedidos antigos continuam com suas regras de entrega originais.

## 6. Limites atuais da integração

- Pix de pedidos: implementado, mas só fica visível quando a subconta aprovada está vinculada e os segredos da plataforma estão configurados.
- Cartão online: ainda não habilitado. Falta tokenização segura do cartão/SDK Asaas; o PratoPronto não armazena PAN ou CVV.
- Estorno Asaas: não ativado nesta entrega. Não marque um pedido como reembolsado sem confirmar o estorno no provedor.
- Sandbox: as telas de produção só expõem recebedores configurados para ambiente production. Testes reais de API exigem credenciais Sandbox e configuração de webhook Sandbox separadas.

## 7. Verificações antes de liberar pedidos reais

- [ ] Segredos das Edge Functions cadastrados.
- [ ] Conta principal Asaas aprovada e Split habilitado.
- [ ] BaaS confirmado pelo gerente Asaas.
- [ ] Subconta de cada restaurante aprovada e chave vinculada pelo proprietário.
- [ ] Webhook configurado com o token correto e eventos acima.
- [ ] Teste de Pix de baixo valor concluído, Split liquidado e ledger conciliado.
- [ ] Primeira assinatura Pix criada e recebida; plano Profissional ativado pelo webhook.
- [ ] Conferência manual do extrato Asaas e dos lançamentos do ledger.

Não libere o checkout Pix para uma empresa até que todas as verificações relacionadas àquela empresa estejam concluídas.
