# Migrations pendentes — não aplicadas

Estes arquivos existiam na branch de auditoria, mas não aparecem no histórico remoto de 44 versões. Foram mantidos fora de `supabase/migrations/` para evitar aplicação acidental.

- `20261118150000_subscription_plans_and_quotas.sql`
- `20261119120000_enable_rls_on_private_rate_limits.sql`
- `20261119130000_harden_company_docs_pilot_directory.sql`
- `20261119140000_guard_inactive_restaurant_storefront.sql`

Os 4 arquivos são cobertos pelos testes automatizados PGlite (PostgreSQL isolado); o preview Vercel concluiu 76/76 testes e build Vite aprovado. Antes de qualquer implantação, ainda é necessário testar em Supabase gerenciado de staging, revisar dependências/advisors e obter aprovação explícita.
