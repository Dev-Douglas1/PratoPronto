# Auditoria de segurança e pagamentos — PratoPronto

Data: 2026-11-23  
Projeto Supabase: `hllvhzzbkjmhxymuwqis`  
Ambiente consultado: banco remoto de produção  
Branch de trabalho: `recovery/reconciled-migrations`

## Estado executivo

- Histórico remoto: **58 migrations** registradas.
- PostgreSQL 17.11; Supabase Health Advisor sem lints.
- RLS habilitado em `private.rpc_rate_limits`; acesso direto revogado para `public`, `anon`, `authenticated` e `service_role`. A função `private.enforce_rate_limit` continua funcionando como SECURITY DEFINER sob o proprietário do banco.
- Criadas estruturas financeiras privadas, ledger append-only, assinatura Profissional e RPCs server-only.
- Criado o plano Profissional a **R$ 49,90/mês** e comissão padrão de **500 bps (5%)** sobre o subtotal dos produtos, excluindo frete.
- Checkout SQL aceita Pix somente quando a subconta Asaas de produção está aprovada e vinculada; cartão online permanece bloqueado.
- Novos pedidos usam entrega pelo restaurante (`delivery_verification_required=false`); pedidos antigos preservam suas regras originais.
- Quatro Edge Functions Asaas foram implantadas no projeto Supabase.
- Nenhuma cobrança real foi criada; os testes financeiros foram executados em transações revertidas.

## Migrations aplicadas nesta etapa

1. `20261123121649_enable_rls_private_rpc_rate_limits`
2. `20261123121800_subscription_plans_asaas_recurring_base`
3. `20261123121807_marketplace_financial_core_asaas`
4. `20261123121914_record_offline_order_commission`
5. `20261123122205_asaas_edge_payment_rpc_and_pix_checkout`
6. `20261123122314_asaas_retry_and_subscription_entitlement`
7. `20261123122412_asaas_webhook_signature_audit`
8. `20261123122937_asaas_financial_idempotency_and_balance_accounts`
9. `20261123123111_asaas_order_payment_retry_customer_idempotency`
10. `20261123123300_index_financial_and_legacy_foreign_keys`
11. `20261123123454_guard_inactive_restaurants_in_payment_checkout`
12. `20261123123516_harden_pilot_directory_access`

As migrations locais usam os mesmos números de versão registrados no Supabase. As cópias antigas de planos e storefront foram removidas de `pending-migrations` depois da aplicação. A parte de políticas de Storage e permissões de `delivery_secrets` continua pendente para revisão separada.

## Estruturas financeiras

Todas ficam em `private`, com RLS habilitado e sem policies para clientes:

- `payment_gateway_accounts`: referência ao Vault, wallet e estado de aprovação do recebedor.
- `payments`: cobranças de pedidos e assinaturas, valores em centavos e idempotência.
- `payment_splits`: valores destinados à plataforma e liquidação.
- `webhook_events`: deduplicação e auditoria de eventos.
- `financial_journals` e `financial_ledger`: partidas dobradas, imutabilidade e lançamentos compensatórios.

As tabelas financeiras concedem acesso de backend apenas a `service_role`; não há acesso direto de `anon` ou `authenticated`. `private.rpc_rate_limits` não concede acesso direto nem mesmo a `service_role`; as RPCs privilegiadas usam a função SECURITY DEFINER já existente.

### Regras financeiras implementadas

- Pedidos pagos na entrega: 5% do subtotal registrado como recebível de comissão do restaurante.
- Pedidos Pix: 5% do subtotal enviado ao Split Asaas como `fixedValue`; o webhook registra comissão a receber e o evento de liquidação baixa o recebível.
- Mensalidade: R$ 49,90, registrada como receita de assinatura após confirmação do pagamento.
- Ledger não permite UPDATE/DELETE. Correções devem gerar lançamentos inversos.
- Duplicidade de webhook, pagamento e liquidação do Split não duplica lançamentos nem períodos de assinatura.

## Edge Functions implantadas

| Função | JWT | Finalidade |
|---|---|---|
| `asaas-order-payment` | obrigatório | Cria cobrança Pix pela chave da subconta, aplica Split de 5% e retorna QR Code |
| `asaas-subscription` | obrigatório | Cria assinatura mensal Pix de R$ 49,90 na conta principal |
| `asaas-webhook` | desativado no gateway | Valida `asaas-access-token`, consulta a cobrança no Asaas e concilia pedidos/assinaturas |
| `asaas-register-account` | obrigatório | Valida a subconta e guarda a chave no Supabase Vault |

As funções falham de forma fechada enquanto faltarem segredos. Nenhuma chave foi adicionada ao Git, ao React ou a este relatório.

## Testes executados no banco remoto

Todos os testes abaixo rodaram em transações revertidas; não deixaram pedidos, pagamentos, webhooks ou linhas de ledger de teste.

- RLS: `private.enforce_rate_limit` conseguiu operar com RLS ligado, sem policy e sem grants diretos.
- Comissão offline: subtotal de R$ 90,00, frete de R$ 10,00 e comissão correta de R$ 4,50.
- Ledger: RPC de lançamento aceitou duas linhas balanceadas e rejeitaria lançamento desequilibrado.
- Pix: criação da intenção, comissão de R$ 4,50, transição para pago, Split liquidado e chamadas repetidas idempotentes.
- Assinatura: pagamento de R$ 49,90 ativou o plano Profissional e uma repetição do mesmo pagamento não estendeu o período duas vezes.
- Webhook: evento token-validado persistido e evento repetido ignorado.
- Segurança: `list_available_pilots()` agora exige conta verificada e vínculo ativo a empresa ativa; `get_storefront`, cotação e checkout recusam empresa inativa/bloqueada.
- Advisors: Health sem lints; Performance sem achados de FKs sem índice após a criação dos índices. Os índices sem uso permanecem apenas como INFO e não foram removidos.

## Estado dos Advisors e pendências de segurança

- Advisor Security ainda mostra 14 tabelas com RLS sem policies. Isso inclui tabelas privadas financeiras, cujo acesso direto está revogado, e tabelas legadas com comportamento default-deny. Não foram criadas policies permissivas.
- `get_storefront` é SECURITY DEFINER executável por anon intencionalmente para vitrine pública, mas agora rejeita empresa inativa ou bloqueada.
- `list_subscription_plans` é público intencionalmente e retorna apenas planos públicos.
- O advisor lista 43 RPCs SECURITY DEFINER executáveis por authenticated. A lista é um aviso genérico; as RPCs são endpoints de negócio e devem continuar sendo auditadas individualmente. Não foi feita revogação global.
- Leaked Password Protection permanece desativada; a configuração exige upgrade de plano Supabase.
- A revisão das políticas de upload de documentos e permissões de `delivery_secrets` continua pendente; o arquivo residual está em `supabase/pending-migrations/20261119130000_harden_company_docs_pilot_directory.sql`.

## Bloqueios para cobrança real

O banco e as funções estão implantados, mas o processamento real ainda depende da conta Asaas:

- Segredos das Edge Functions: `ASAAS_ENVIRONMENT=production`, `ASAAS_API_KEY` da conta principal, `ASAAS_PLATFORM_WALLET_ID` e `ASAAS_WEBHOOK_TOKEN`.
- Split habilitado na conta principal Asaas.
- Modelo BaaS/subcontas previamente aprovado pelo Asaas.
- Cada restaurante precisa ter uma subconta aprovada e vinculada pela aba Empresa → Assinatura; a chave fica no Vault.
- Webhook configurado em `https://hllvhzzbkjmhxymuwqis.supabase.co/functions/v1/asaas-webhook` com os eventos documentados em `supabase/ASAAS_SETUP.md`.
- A recorrência inicial é cobrança mensal Pix. Pix Automático pode ser oferecido pelo Asaas se a conta e o pagador forem elegíveis e houver autorização; sem isso, cada mensalidade precisa ser paga manualmente.
- Cartão online ainda não está habilitado: falta tokenização segura do cartão.
- Estorno externo ainda não foi integrado; nenhum reembolso deve ser marcado como concluído sem confirmação do Asaas.

## Deploy do frontend

As alterações React de checkout Pix, QR Code, acompanhamento em tempo real e aba de assinatura estão nesta branch e na PR #37, ainda draft. Não foram mescladas nem promovidas para o frontend de produção. O projeto Vercel não apareceu na conexão disponível para este repositório, então não foi possível confirmar nem executar deploy de produção do frontend.

## Limites operacionais

- Não foi executado `db push`, `db reset` ou `migration repair`.
- Não houve alteração de Auth, Storage ou dados de clientes nesta etapa, exceto as mudanças de funções SQL e metadados de assinatura.
- Nenhuma chave real foi fornecida ou gravada.
- Não foi criada cobrança real nem feita movimentação financeira.
