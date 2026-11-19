# Revisão de segurança — PratoPronto

Data da auditoria: 2026-11-19  
Projeto Supabase: `hllvhzzbkjmhxymuwqis`  
Escopo: RPCs privilegiadas, pedidos, entregas, cadastro empresarial, Storage, RLS e Auth.  
Modo: hardening conservador. Nenhuma migration foi aplicada ao banco de produção.

## Inventário de funções privilegiadas

No schema `public` foram encontrados:
- 46 funções `SECURITY DEFINER`;
- 42 executáveis por `authenticated`;
- 1 executável por `anon`: `public.get_storefront(text)`;
- 4 funções sem execução por usuários finais, reservadas ao backend/trigger.

As 46 funções verificadas usam `SET search_path TO ''`. Isso reduz o risco de resolução de objetos por schemas controlados por usuários, mas não substitui validação de identidade e autorização dentro de cada RPC.

Não foi feita revogação em massa de `EXECUTE`. As RPCs são usadas por fluxos de login, cadastro, pedidos, catálogo, equipe, entrega e administração.

### RPCs de pedidos e entrega revisadas

- `quote_order`: exige usuário verificado, aceite dos termos, produtos ativos, quantidades válidas, preço calculado no banco, área de entrega e método permitido. Atualmente só aceita `maquina_entrega`; pagamento online não está ativado.
- `checkout_order`: exige usuário verificado, quote pertencente ao usuário e não expirada; valida o método de pagamento e usa identificador de requisição e índices únicos para idempotência.
- `advance_order`: exige papel válido na empresa e transição de status permitida; pedidos com verificação de entrega não podem ser marcados como enviados/entregues pela empresa.
- `create_order_delivery_offer`: exige owner/admin/attendant da empresa do pedido e piloto aprovado/disponível ou contato associado à mesma empresa.
- `respond_order_delivery_offer`: confere que a oferta pertence ao piloto autenticado, que está pendente e que o piloto continua operacional.
- `pilot_start_delivery` e `pilot_confirm_delivery`: exigem piloto operacional e pedido atribuído ao mesmo usuário; a confirmação compara hash da senha e limita tentativas.
- `submit_order_review`: permite avaliação apenas ao cliente do pedido entregue.
- `reply_order_review`: exige papel operacional na empresa correspondente à avaliação.

### Pagamentos e reembolsos — limitação pendente

O fluxo atual aceita apenas maquininha na entrega. Não existe processamento de cartão/Pix no banco nem integração de gateway no checkout.

`submit_refund_request` valida que o pedido pertence ao cliente. `decide_refund_request` exige owner/admin/attendant da empresa e solicitação pendente. Entretanto, quando o pagamento já foi recebido, a aprovação não executa estorno externo; o status de pagamento permanece como recebido. Portanto, o fluxo não deve ser apresentado como reembolso automático. É necessário definir o procedimento de reembolso manual ou integrar um provedor antes de automatizar essa etapa. Nenhuma alteração financeira foi feita nesta etapa.

## Correções de segurança mantidas na branch

### 1. `private.rpc_rate_limits`
- RLS habilitado.
- Mantida sem políticas nem grants diretos a `anon`/`authenticated`.
- A tabela continua sendo escrita pelas RPCs privilegiadas que aplicam rate limit.

### 2. Diretório de pilotos
A migration pendente `20261119130000_harden_company_docs_pilot_directory.sql` exige limite de consultas, usuário verificado, associação empresarial ativa e papel operacional. Ela permanece fora do diretório ativo até validação isolada e aplicação aprovada.

### 3. Documentos empresariais
As correções de upload, substituição, caminhos canônicos, MIME, tamanho e ownership permanecem em migration pendente, não aplicada.

### 4. Segredos de entrega
A migration de hardening restringe privilégios diretos e preserva a leitura própria por RLS. A alteração permanece pendente de validação isolada.

### 5. Empresas inativas
A migration pendente protege vitrine pública e cotação de pedidos para empresas inativas. Não foi aplicada ao banco nesta tarefa.

## Histórico de migrations — reconciliação Git concluída

- Supabase remoto: 44 versões registradas.
- SQL statements recuperados do histórico remoto: 44/44.
- Diretório `supabase/migrations` na branch de reconciliação: 44 arquivos com as mesmas versões remotas.
- Os 12 arquivos originais da branch anterior foram preservados em `supabase/recovered-migrations/local-branch-original/`.
- Quatro arquivos não aplicados foram separados em `supabase/pending-migrations/`.
- Nenhuma migration foi reaplicada nem o histórico remoto alterado.

Detalhes em `supabase/MIGRATION_RECONCILIATION.md`.

## Autenticação — bloqueio de plano

A proteção contra senhas vazadas está desativada. A organização Supabase está no plano Free; a documentação oficial informa que Leaked Password Protection exige Pro ou superior. Não foi feito upgrade nem alterada a cobrança.

## Validação e limites

Os SQLs ativos na branch reconciliada são cópias dos statements registrados no histórico remoto e já executados historicamente. Os quatro arquivos pendentes foram exercitados pelos testes automatizados PGlite; o preview Vercel confirmou 76/76 testes e build Vite aprovado. Não há Supabase Branch disponível no plano atual, então ainda falta uma rodada em Supabase gerenciado de staging antes de aplicação.

Os advisors de segurança continuam apontando findings existentes, incluindo funções `SECURITY DEFINER` expostas a authenticated e a proteção contra senhas vazadas desativada. Esses avisos exigem revisão por função e não foram resolvidos por uma revogação global.

## Segurança de produção

Nenhuma migration foi aplicada ao Supabase de produção. A PR de reconciliação permanece em draft até a validação da branch e revisão. Não executar `db reset`, `db push` ou `migration repair` como parte desta etapa.
