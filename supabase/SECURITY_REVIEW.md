# Revisão de segurança — PratoPronto

Data da auditoria: 2026-11-19  
Projeto Supabase: `hllvhzzbkjmhxymuwqis`  
Escopo: banco de dados, RLS, RPCs privilegiadas e autenticação.  
Modo: implementação conservadora; nenhuma alteração foi aplicada ao banco de produção.

## Alteração implementada nesta branch

### `private.rpc_rate_limits`
- RLS estava desativado.
- A tabela não concede privilégios diretos a `anon` nem `authenticated` (verificação de ACL no banco).
- A tabela pertence ao schema `private` e é usada por `private.enforce_rate_limit`, chamada por RPCs privilegiadas.
- Migration ativa RLS e mantém zero políticas, portanto clientes não recebem acesso direto.
- Não usa FORCE ROW LEVEL SECURITY: a função SECURITY DEFINER existente, de propriedade do administrador do banco, continua podendo registrar os limites.

## Achados que exigem revisão individual

### Funções SECURITY DEFINER
O linter encontrou 42 funções executáveis por `authenticated` e uma função pública executável por `anon`: `public.get_storefront(text)`.

Não foi aplicada revogação global. Essas funções são RPCs operacionais e a remoção indiscriminada de EXECUTE pode interromper login, pedidos, catálogo, equipe, entregas, cadastro e administração.

A função pública `get_storefront` retorna dados usados pela vitrine pública (nome, telefone comercial, endereço, horários, zonas e meios de pagamento). A exposição por `anon` parece intencional; ainda assim, o payload deve continuar limitado a dados comerciais públicos. Não retornar dados privados de clientes, tokens, documentos ou credenciais.

Na auditoria das definições, as funções consultadas usam `SET search_path TO ''`, reduzindo risco de resolução maliciosa de objetos. Isso deve ser mantido em novas funções SECURITY DEFINER.

Próxima etapa recomendada: revisar as 42 RPCs por grupo funcional e confirmar autorização dentro de cada corpo, além de mapear chamadas do frontend antes de alterar ACLs.

## Tabelas RLS ativas sem políticas

O linter identificou:
- `company_registration_documents`
- `company_registration_requests`
- `empresas`
- `enderecos_usuario`
- `equipe_empresa`

RLS está ativo e não há políticas, portanto o acesso direto via PostgREST é negado. O desenho atual usa RPCs e tabelas canônicas multiempresa. Não criar políticas permissivas apenas para silenciar o linter. Confirmar que os fluxos de frontend usam exclusivamente RPCs autorizadas antes de qualquer mudança.

## Autenticação

O Supabase Auth reportou proteção contra senhas vazadas desativada. Habilitar em Authentication → Settings → Password Security → Leaked Password Protection, após validar a política de senha e o impacto esperado em novos cadastros e redefinições. Esta configuração não é alterada por migration SQL.

## Produção e histórico de migrations

O histórico remoto retornado pelo Supabase não inclui as migrations mais recentes presentes na branch de assinaturas. Portanto, não executar esta migration em produção até reconciliar o histórico, validar backup e testar em ambiente separado.

## Validação

A suíte automatizada adicionada usa PGlite para executar a migration em banco PostgreSQL temporário e verificar:
- RLS fica habilitado;
- nenhuma política é criada;
- nenhuma permissão direta é concedida;
- nenhuma função privilegiada é revogada ou removida.

A validação não substitui teste de integração com credenciais anon/authenticated em um projeto Supabase de staging.
