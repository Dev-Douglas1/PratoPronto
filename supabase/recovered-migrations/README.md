# Recuperação de migrations — evidências do histórico remoto

Auditoria somente leitura em 2026-11-19. O diretório `applied/` contém cópias dos 44 SQL statements recuperados diretamente de `supabase_migrations.schema_migrations.statements` no projeto Supabase `hllvhzzbkjmhxymuwqis`.

## Recuperação confirmada
- Versões no histórico remoto: 44.
- Statements recuperados: 44/44.
- Fonte: banco remoto, coluna `statements` da tabela `supabase_migrations.schema_migrations`.
- Os arquivos em `applied/` são evidências históricas e não devem ser executados novamente sobre o banco existente.

A versão `20260921154316` contém operações destrutivas (DROP) e é arquivada apenas para auditoria. Todos os SQLs estão fora do diretório ativo nesta pasta de evidências.

## Reconciliação
A branch `recovery/reconciled-migrations` usa as mesmas 44 versões e SQLs em `supabase/migrations/`, correspondendo ao histórico remoto. Os 12 arquivos que existiam na branch anterior foram preservados em `local-branch-original/`. Quatro migrations não aplicadas foram movidas para `supabase/pending-migrations/`.

A reconciliação é somente no Git. Nenhum SQL foi executado durante a recuperação. Nenhuma linha do histórico remoto foi alterada.

## Verificação isolada
A organização não possui Supabase Branch/staging disponível no plano atual. As migrations recuperadas já foram aplicadas historicamente no projeto remoto, mas os quatro arquivos pendentes ainda precisam ser testados em uma instância isolada antes de qualquer futura implantação.
