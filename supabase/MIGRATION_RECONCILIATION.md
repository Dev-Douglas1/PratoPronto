# Reconciliação do histórico de migrations

Auditoria somente leitura em 2026-11-19. Nenhuma linha da tabela `supabase_migrations.schema_migrations` foi alterada e nenhuma migration foi aplicada.

## Resultado

| Fonte | Quantidade |
|---|---:|
| Versões registradas no Supabase remoto | 44 |
| Arquivos SQL em `supabase/migrations` nesta branch | 12 |
| Versões coincidentes | 2 |
| Versões remotas sem arquivo local | 42 |
| Arquivos locais sem versão remota | 10 |

A branch `main` tem 8 arquivos, `feature/assinaturas-planos` tem 9 e `security/hardening-audit` tem 12. A consulta ao histórico GitHub encontrou 10 commits que alteraram `supabase/migrations`; isso não recupera as 42 migrations ausentes.

## Versões registradas no remoto sem SQL correspondente na branch

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
- `20261117122754` — company_registration_pf_cpf

## Arquivos locais que não constam no histórico remoto

- `20260922144500` — 20260922144500_auth_google_phone_profiles.sql
- `20260922145200` — 20260922145200_auth_social_consent.sql
- `20260922151000` — 20260922151000_fix_authenticated_profile_loading.sql
- `20260923024345` — 20260923024345_account_ids_and_team_permissions.sql
- `20261104120000` — 20261104120000_company_registration_approval_flow.sql
- `20261110160000` — 20261110160000_company_registration_pf_cpf.sql
- `20261118150000` — 20261118150000_subscription_plans_and_quotas.sql
- `20261119120000` — 20261119120000_enable_rls_on_private_rate_limits.sql
- `20261119130000` — 20261119130000_harden_company_docs_pilot_directory.sql
- `20261119140000` — 20261119140000_guard_inactive_restaurant_storefront.sql

Esses arquivos incluem alterações ainda não aplicadas, portanto sua ausência no remoto não é, isoladamente, um erro. Não executar essas migrations em produção até verificar a ordem e dependências.

## Por que não foi feita reconciliação automática

- A tabela de histórico registra versões, mas não contém o SQL original dessas migrations.
- Marcar versões como aplicadas com `migration repair` sem comparar o schema pode ocultar alterações ausentes.
- Reaplicar SQL reconstruído por suposição pode recriar tabelas, duplicar triggers, alterar políticas ou afetar dados.
- O check Supabase Preview do PR foi ignorado porque não há Supabase Branch associado. Não existe ambiente de staging vinculado para executar a sequência real.
- A organização está no plano Free, que não inclui branching do Supabase.

## Procedimento seguro recomendado

1. Fazer backup completo do banco e Storage; validar que a restauração é possível.
2. Recuperar os SQLs originais das versões remotas em computadores de desenvolvimento, branches antigas, PRs ou backups.
3. Comparar cada SQL recuperado com o schema atual e com as versões registradas no remoto.
4. Executar a sequência completa em um projeto/instância isolada, sem dados de produção.
5. Se os SQLs originais não puderem ser recuperados, preparar um baseline de schema atual revisado manualmente; documentar explicitamente quais versões históricas foram substituídas e por quê.
6. Só depois de validação e aprovação explícita, aplicar a estratégia de reconciliação em produção.

## Regra de segurança

**Não executar `supabase db reset`, `supabase db push`, `migration repair` ou migrations novas em produção enquanto esta divergência existir.** As migrations de segurança deste PR ficam apenas na branch até a reconciliação.
