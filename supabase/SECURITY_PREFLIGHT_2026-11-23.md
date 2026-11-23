# Pré-auditoria de segurança — PratoPronto

Data: 2026-11-23  
Projeto Supabase: `hllvhzzbkjmhxymuwqis`  
Ambiente consultado: banco remoto de produção, somente leitura  
Branch de trabalho: `recovery/reconciled-migrations`

## Resultado executivo

A preparação foi concluída sem alterar o schema, dados, Storage, Auth ou permissões do banco remoto.

- Projeto Supabase está `ACTIVE_HEALTHY`, PostgreSQL 17.11.
- Histórico remoto contém 46 migrations registradas.
- Duas migrations recentes de limpeza de RPCs estão aplicadas.
- As quatro migrations em `supabase/pending-migrations/` continuam não aplicadas.
- Advisor Health: nenhum lint.
- Advisor Security: 5 tabelas com RLS sem policies, 1 RPC SECURITY DEFINER executável por anon, 37 RPCs SECURITY DEFINER executáveis por authenticated e proteção contra senhas vazadas desativada.
- Advisor Performance: 6 FKs sem índice de cobertura e 28 índices sem uso observado.
- A suíte GitHub Actions no commit `116d7ecb7259bbb444c70ea977fc7cba22167c11` concluiu testes e build com sucesso. O preview Supabase foi ignorado por ausência de Supabase Branch; os checks Vercel daquele commit falharam por limite de deploy, não por erro de compilação.

## Achados prioritários

### P0 — Diretório de pilotos exposto a qualquer usuário autenticado

A definição atualmente instalada de `public.list_available_pilots()` não verifica `auth.uid()`, vínculo com empresa nem papel operacional. O RPC pode ser executado por qualquer usuário autenticado e retorna dados de perfil/veículo de pilotos disponíveis.

Correção já preparada, mas ainda pendente: `supabase/pending-migrations/20261119130000_harden_company_docs_pilot_directory.sql`. Ela exige conta verificada e não banida, vínculo ativo a empresa ativa com papel owner/admin/attendant e rate limit.

**Não aplicar isoladamente sem validar a migration inteira e o contrato com o app.**

### P0 — Vitrine de empresa inativa ainda pode expor dados

A função atualmente instalada `public.get_storefront(text)` retorna telefone, endereço, horários e zonas sem rejeitar explicitamente empresa inativa/suspensa/bloqueada. O campo `open` pode ser falso, mas isso não impede a divulgação dos demais dados.

Correção preparada em `supabase/pending-migrations/20261119140000_guard_inactive_restaurant_storefront.sql`, que rejeita empresa com `ativo` diferente de true ou `account_status` diferente de active. A mesma migration protege `quote_order`.

A exposição anônima de `get_storefront` é intencional para vitrine pública; não revogar anon sem substituir o modelo público.

### P1 — RLS habilitado sem policies em cinco tabelas

Tabelas observadas:
- `company_registration_documents`
- `company_registration_requests`
- `empresas`
- `enderecos_usuario`
- `equipe_empresa`

RLS está habilitado nas cinco. Sem policies, o acesso direto via PostgREST é negado. Nas duas tabelas de documentos/cadastro, os privilégios diretos de anon/authenticated também estão ausentes; o acesso funcional ocorre por RPCs privilegiadas com verificações próprias.

Nas tabelas legadas `empresas`, `enderecos_usuario` e `equipe_empresa`, ainda existem grants diretos para anon/authenticated, mas RLS sem policies bloqueia o acesso. A busca na branch identificou referências diretas apenas em `CadastroEmpresa.jsx` e `AddressModal.jsx`, que não são importados/roteados no app atual; `equipe_empresa` permanece referenciada pela função trigger `vincular_dono_equipe`. Foi preparado SQL separado para revogar os grants diretos dessas três tabelas, sem remover tabelas, dados ou o trigger. Aplicar somente após confirmar que os componentes legados não serão reativados.

**Não criar policies permissivas apenas para silenciar o advisor.** O comportamento default-deny é mais seguro até o desenho de acesso ser definido.

### P1 — RPCs SECURITY DEFINER

O advisor lista 37 funções executáveis por authenticated. A executabilidade, sozinha, não prova vulnerabilidade: são endpoints usados pelos fluxos do aplicativo.

A revisão estática das funções atualmente instaladas confirmou `SET search_path TO ''` nas funções auditadas. Entre as funções autenticadas, `list_available_pilots()` foi a exceção sem guarda de identidade/autorização no corpo. As demais revisadas apresentam verificações de usuário, papel da empresa, propriedade do pedido ou administrador da plataforma. Não executar revogação global de EXECUTE.

A função `get_storefront` é a única SECURITY DEFINER executável por anon; sua execução pública é necessária para a vitrine, mas precisa da guarda de empresa ativa descrita acima.

### P1 — Proteção contra senhas vazadas

Está desativada. A configuração exige plano Supabase Pro ou superior. Nenhum upgrade ou alteração de cobrança foi realizado. Manter como pendência de plano; não desabilitar os requisitos de senha existentes.

### P2 — Índices de chaves estrangeiras

Advisor identificou:
- `company_registration_documents.user_id`
- `company_registration_requests.restaurant_id`
- `company_registration_requests.reviewed_by`
- `empresas.dono_id`
- `enderecos_usuario.user_id`
- `equipe_empresa.user_id`

Os seis índices candidatos estão em `supabase/drafts/security_preflight_legacy_grants_and_fk_indexes.sql`. Não foram criados em produção. O arquivo também contém a proposta de revogar grants diretos das três tabelas legadas. Os 28 índices marcados como não utilizados não serão removidos com base apenas nas estatísticas atuais; vários podem atender fluxos raros ou ainda não exercitados.

## Estado das migrations pendentes

1. `20261118150000_subscription_plans_and_quotas.sql` — funcionalidade de planos/quotas; revisar separadamente, pois altera modelo comercial e limites.
2. `20261119120000_enable_rls_on_private_rate_limits.sql` — RLS na tabela interna de rate limit.
3. `20261119130000_harden_company_docs_pilot_directory.sql` — diretório de pilotos, documentos empresariais e privilégios de segredos de entrega.
4. `20261119140000_guard_inactive_restaurant_storefront.sql` — vitrine e cotação para empresas inativas.

Nenhuma das quatro foi aplicada. Não executar `db push`, `db reset` ou `migration repair` como atalho.

## Plano de execução preparado

1. Validar em PostgreSQL isolado as quatro migrations pendentes na ordem e confirmar que não dependem de schema ausente.
2. Adicionar testes negativos: usuário autenticado sem empresa não lista pilotos; membro de outra empresa não acessa documentos; upload após aprovação é negado; loja suspensa não retorna vitrine nem aceita cotação.
3. Adicionar testes positivos: owner/admin/attendant de empresa ativa lista pilotos; solicitante lê apenas documentos próprios; loja ativa continua pública; checkout válido continua funcionando.
4. Validar os grants e policies de Storage para uploads, substituições e leitura administrativa.
5. Revisar o SQL de revogação das tabelas legadas e os seis índices candidatos; não apagar os 28 índices não utilizados.
6. Executar suite completa e build após as alterações.
7. Somente depois de staging gerenciado, revisar advisors novamente e preparar rollout com plano de reversão.

## Limitações e bloqueios

- O projeto está no plano Free; Supabase Branching/staging não está disponível neste momento.
- PGlite e testes de CI não substituem integração com Auth, Storage, Realtime e RLS do Supabase gerenciado.
- A proteção contra senhas vazadas depende de upgrade.
- Vercel reportou limite de deploy no commit consultado; o workflow GitHub Actions de testes e build passou.
- Pagamento online e estorno externo continuam desativados/não integrados. O checkout atual aceita somente maquininha na entrega.

## Alterações realizadas nesta preparação

Somente este relatório e o SQL candidato em `supabase/drafts/` foram adicionados à branch. Nenhuma migration nova foi registrada ou aplicada e nenhuma alteração foi feita no banco remoto.
