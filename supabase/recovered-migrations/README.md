# Recuperação de migrations — registro de evidências

Auditoria somente leitura do banco remoto em 2026-11-19. Este diretório é um arquivo de evidências e **não é carregado nem executado pelo Supabase CLI**.

## Recuperação confirmada

| Versão | Nome | Fonte | SHA do blob | Estado |
|---|---|---|---|---|
| 20260921154316 | cleanup_legacy_schema_and_harden_runtime | commit 35a088ebd79a3fa521ffb9a8d946532bd7a440cc; também presente em codex/release-hardening-supabase e testes/supabase-local | 09ba3207ccc5f01459e0d058f44d3ff17ed3935e | SQL original recuperado e arquivado |

O arquivo foi colocado em `supabase/recovered-migrations/`, fora de `supabase/migrations/`, para impedir que seja interpretado como migration pendente. O SQL contém `DROP TABLE` e `DROP FUNCTION`; não deve ser reaplicado ao banco existente.

## Situação restante

- Histórico remoto: 44 versões.
- Arquivos SQL na branch de auditoria original: 12.
- Versões remotas sem arquivo correspondente naquela branch: 42.
- Recuperadas nesta etapa: 1 versão original.
- Restam: 41 versões remotas sem SQL original recuperado nesta etapa.
- Arquivos locais sem versão remota: 10; não são incluídos automaticamente no histórico.

## Evidência adicional

- O commit `19492ccd45256b93f641a761ccaab4120f9837ee` removeu da branch principal o arquivo `20261106004700_harden_legacy_company_functions.sql`. O diff contém o SQL integral removido, mas sua relação exata com a migration remota `20261106004642_harden_legacy_company_functions` ainda precisa ser confirmada; não foi renomeado nem tratado como correspondência exata.
- A migration `20260923024958_account_ids_and_team_permissions` foi descrita na PR #20 como aplicada ao Supabase, mas o SQL local encontrado tem timestamp diferente (`20260923024345`). Não foi presumido que sejam idênticas.
- Commits e PRs de aplicação são evidência auxiliar, não substituem o SQL original nem a comparação de schema.

## Próximos passos seguros

1. Recuperar os arquivos restantes a partir de commits/PRs e branches, registrando SHA e origem de cada blob.
2. Comparar os SQLs recuperados com o schema remoto atual e com dependências na ordem temporal.
3. Separar migrations originais, migrations já aplicadas e drafts nunca aplicados.
4. Testar a sequência reconstruída em uma instância isolada e descartável, nunca na produção.
5. Só depois de backup restaurável, revisão e aprovação explícita decidir como reconciliar o histórico.

**Proibido nesta etapa:** `db reset`, `db push`, `migration repair`, aplicar migrations, apagar/editar dados ou alterar a tabela remota de histórico.
