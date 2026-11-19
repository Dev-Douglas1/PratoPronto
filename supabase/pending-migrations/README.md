# Migrations pendentes — não aplicadas

Estes arquivos existiam na branch de auditoria, mas não aparecem no histórico remoto de 44 versões. Foram mantidos fora de `supabase/migrations/` para evitar aplicação acidental.

- `20261118150000_subscription_plans_and_quotas.sql`
- `20261119120000_enable_rls_on_private_rate_limits.sql`
- `20261119130000_harden_company_docs_pilot_directory.sql`
- `20261119140000_guard_inactive_restaurant_storefront.sql`

Antes de mover qualquer arquivo para `supabase/migrations/`, validar dependências, testar a sequência em uma instância isolada, revisar os advisors e obter aprovação explícita para implantação.
