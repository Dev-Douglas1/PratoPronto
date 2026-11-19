# Reconciliação do histórico de migrations

Auditoria somente leitura em 2026-11-19 do projeto Supabase `hllvhzzbkjmhxymuwqis` (PostgreSQL 17.11).

## Resultado confirmado

| Verificação | Resultado |
|---|---:|
| Versões no histórico remoto antes da limpeza | 44 |
| SQLs recuperados de `supabase_migrations.schema_migrations.statements` | 44/44 |
| Arquivos em `supabase/migrations` após a limpeza | 45 |
| Diferença de versões entre remoto e diretório reconciliado | 0 |
| Migration de limpeza aplicada nesta tarefa | 1 |

O conteúdo SQL das 44 migrations históricas recuperadas vem diretamente da coluna `statements` do histórico remoto. Uma 45ª migration, de limpeza de funções obsoletas, foi aplicada em 2026-11-19 e adicionada ao diretório ativo. Os arquivos ficam no diretório ativo com as versões e nomes registrados pelo Supabase. Cópias de evidência ficam em `supabase/recovered-migrations/applied/`.

## Comparação com os 12 arquivos da branch anterior

- 2 versões tinham o mesmo timestamp remoto; uma SQL diferia materialmente (`20260921154316`) e a outra coincidia após remover whitespace final (`20261106004642`).
- 5 arquivos locais tinham SQL idêntico ao de uma migration aplicada, mas com timestamp diferente:
  - `20260922144500` corresponde a `20260922143515` (diferença apenas de whitespace final).
  - `20260922145200` corresponde a `20260922143613`.
  - `20260922151000` corresponde a `20260922151628`.
  - `20260923024345` corresponde a `20260923024958`.
  - `20261110160000` corresponde a `20261117122754`.
- `20261104120000_company_registration_approval_flow.sql` não é igual ao SQL remoto `20261104181137`; a versão local foi preservada como variante histórica, não como migration ativa.
- Os 4 arquivos abaixo não constam no histórico remoto e foram movidos para `supabase/pending-migrations/`, fora do caminho executado pelo Supabase CLI:
  - `20261118150000_subscription_plans_and_quotas.sql`
  - `20261119120000_enable_rls_on_private_rate_limits.sql`
  - `20261119130000_harden_company_docs_pilot_directory.sql`
  - `20261119140000_guard_inactive_restaurant_storefront.sql`

Todos os 12 arquivos originais foram preservados em `supabase/recovered-migrations/local-branch-original/`.

## Versões do histórico remoto

- `20260921114806` — supabase_complete
- `20260921140532` — multiempresa_membros_pilotos
- `20260921142237` — supabase_runtime_schema
- `20260921142317` — supabase_runtime_company_rpc
- `20260921142401` — supabase_runtime_orders_rpc
- `20260921142447` — supabase_runtime_support_pilot_rpc
- `20260921142512` — supabase_runtime_rls
- `20260921142942` — supabase_runtime_member_directory
- `20260921143050` — canonical_marketplace_schema
- `20260921143102` — canonical_delivery_offers
- `20260921143118` — auth_profiles_and_membership_helpers
- `20260921143851` — remove_duplicate_delivery_schema
- `20260921150401` — pilot_signup_from_profile_vehicle_data
- `20260921151413` — pilot_documents_and_manual_approval
- `20260921151449` — pilot_approval_enforcement
- `20260921151534` — pilot_availability_after_approval
- `20260921154316` — cleanup_legacy_schema_and_harden_runtime
- `20260922125616` — audit_blocks_and_rate_limit_core
- `20260922125632` — rate_limit_critical_rpcs
- `20260922125800` — enforce_pilot_and_company_blocks
- `20260922125840` — expose_company_operational_status_to_members
- `20260922130239` — cleanup_duplicate_policies_and_block_indexes
- `20260922130350` — pilot_document_retention_queue
- `20260922130957` — centralize_company_mutations_in_rate_limited_rpcs
- `20260922131808` — validate_company_settings_and_products_server_side
- `20260922132102` — remove_unused_storage_policies
- `20260922132140` — limit_pilot_storage_to_four_fixed_objects
- `20260922132225` — enforce_fixed_pilot_document_paths
- `20260922132329` — safe_pilot_reverification_before_document_replace
- `20260922132440` — lock_pilot_documents_after_submission
- `20260922143515` — auth_google_phone_profiles
- `20260922143613` — auth_social_consent
- `20260922151628` — fix_authenticated_profile_loading
- `20260923024958` — account_ids_and_team_permissions
- `20260929122357` — fix_public_restaurant_read_for_anon
- `20260929124340` — company_mobile_catalog_management
- `20261104181137` — company_registration_approval_flow
- `20261104181150` — company_registration_cnpj_column_and_review_fix
- `20261104181350` — disable_legacy_unverified_company_creation
- `20261104183139` — company_registration_documents_and_cnpj_validation
- `20261104183148` — require_company_documents_before_approval
- `20261104183241` — fix_private_company_document_upload_policy
- `20261106004642` — harden_legacy_company_functions
- `20261117122754` — company_registration_pf_cpf
- `20261119150046` — remove_unused_legacy_company_rpcs

## Verificações de schema relacionadas ao recurso de recebimentos

Consulta somente leitura confirmou:
- `private.verified(uuid)` existe e usa `search_path = ''`.
- `private.company_payment_settings` ainda não existe.
- As RPCs `get_company_payment_settings` e `save_company_payment_settings` ainda não existem.

O SQL de configuração de recebimentos continua sendo um draft separado. Não foi aplicado.

## Limpeza de funções antigas — 2026-11-19

Foi aplicada a migration `20261119150046_remove_unused_legacy_company_rpcs.sql`, que removeu 7 funções sem chamadas no código atual nem dependências registradas no PostgreSQL: `submit_company_registration(text,text,text,text)`, `my_company_registration_request()`, `list_company_registration_requests()`, `company_catalog_list(uuid)`, `company_catalog_save(uuid,uuid,text,text,text,integer,text,boolean)`, `company_catalog_set_active(uuid,uuid,boolean)` e `create_restaurant(text,text)`. Todas foram removidas com `DROP FUNCTION ... RESTRICT`, sem `CASCADE`.

As versões atuais `submit_company_registration_v2`, `my_company_registration_request_v2`, `list_company_registration_requests_v2`, `save_restaurant_product`, `update_restaurant_product_state` e `my_restaurants` foram verificadas e permanecem disponíveis. Nenhuma tabela ou dado foi removido.

## Limites da validação

- Os 44 SQLs são os statements registrados pelo próprio Supabase e já executados historicamente no projeto remoto.
- A estrutura local de migrations foi alinhada às 44 versões remotas, sem executar novamente nenhuma delas.
- Os 4 arquivos pendentes foram executados pelos testes automatizados com PGlite no build de preview Vercel; a suíte concluiu 76/76 testes aprovados e o build Vite passou.
- Isso valida os fluxos cobertos pelo harness PostgreSQL isolado, mas não substitui uma validação em Supabase gerenciado (Auth/Storage/RLS reais). Não há Supabase Branch/staging disponível no plano atual.

## Segurança

Uma migration de limpeza foi aplicada. Não houve `db push`, `db reset` ou `migration repair`. Nenhuma tabela, dado, Storage ou configuração de Auth foi removida ou alterada. Os 4 arquivos de `supabase/pending-migrations/` continuam pendentes e não foram executados.
