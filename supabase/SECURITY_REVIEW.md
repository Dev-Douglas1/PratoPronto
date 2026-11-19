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

## Correções adicionadas nesta branch

### 1. `private.rpc_rate_limits`
- RLS habilitado.
- Mantida sem políticas nem grants diretos a `anon`/`authenticated`.
- A tabela continua sendo escrita pelas RPCs privilegiadas que aplicam rate limit.

### 2. Diretório de pilotos
Antes, `list_available_pilots()` retornava até 100 pilotos aprovados e disponíveis para qualquer usuário autenticado, sem verificar vínculo empresarial.

A nova migration exige:
- limite de 30 consultas por minuto por usuário;
- conta autenticada e verificada, não excluída ou banida;
- associação ativa a uma empresa com status `active`;
- papel `owner`, `admin` ou `attendant`.

A função mantém os campos usados pelo fluxo de atribuição de entrega.

### 3. Documentos empresariais
Os buckets `company-registration-documents` e `pilot-documents` são privados e limitados a 5 MB, PDF/JPEG/PNG/WEBP. O bucket de documentos empresariais estava sem objetos no momento da auditoria.

Correções:
- upload e substituição de documento empresarial agora exigem solicitação ainda pendente;
- o caminho é limitado ao padrão `user/request/document.ext` aceito pelo aplicativo;
- `register_company_document` valida o caminho canônico e exige que o objeto exista no bucket privado e tenha `owner_id` igual ao usuário autenticado;
- leitura de documentos continua restrita ao dono da solicitação ou administrador da plataforma;
- não foi criado acesso público nem política ampla de leitura.

### 4. Segredos de entrega
A tabela `delivery_secrets` tinha grants amplos para `anon` e `authenticated`, embora RLS já limitasse a leitura ao dono. A migration revoga privilégios diretos e concede somente `SELECT` a `authenticated`. A política RLS de leitura do próprio código foi mantida, pois o cliente precisa apresentar o código ao piloto. Escritas permanecem nas RPCs privilegiadas.

### 5. Empresas inativas
`get_storefront` era executável por `anon` e retornava dados comerciais mesmo para empresas inativas. `quote_order` dependia principalmente da configuração `acceptingOrders`.

A nova migration:
- limita a vitrine pública a empresas com `ativo = true` e `account_status = 'active'`;
- aplica a mesma validação antes de criar uma cotação de pedido.

A execução pública de `get_storefront` é mantida para lojas ativas.

## Tabelas com RLS sem políticas

O linter identificou:
- `company_registration_documents`
- `company_registration_requests`
- `empresas`
- `enderecos_usuario`
- `equipe_empresa`

RLS ativo sem política bloqueia acesso direto via PostgREST. O desenho atual usa RPCs autorizadas para essas operações. Não criar políticas permissivas apenas para remover avisos do linter.

## Autenticação — bloqueio de plano

A proteção contra senhas vazadas está desativada. A organização Supabase está no plano Free; a documentação oficial informa que Leaked Password Protection exige Pro ou superior. Não foi feito upgrade nem alterada a cobrança.

Enquanto permanecer no Free, configurar no painel os requisitos de senha disponíveis, com mínimo de 8 caracteres e combinação de maiúsculas, minúsculas, números e símbolos. A proteção HaveIBeenPwned só poderá ser habilitada após decisão explícita de upgrade.

## Histórico de migrations — bloqueio para produção

Comparação do estado observado:
- Supabase remoto: 44 versões registradas;
- repositório nesta branch: 12 arquivos de migration;
- versões coincidentes: 2;
- versões remotas sem arquivo correspondente no repositório: 42;
- arquivos locais sem versão correspondente no remoto: 9.

Esse nível de divergência impede um `db push` seguro. Não marcar migrations como aplicadas manualmente nem executar `db reset`. Primeiro é necessário recuperar/reconstruir as migrations ausentes, comparar o schema resultante e validar em ambiente isolado.

## Validação

A suíte usa PGlite para executar as migrations em PostgreSQL temporário e testar:
- RLS na tabela interna de rate limit;
- autorização do diretório de pilotos;
- upload e substituição de documentos somente enquanto a solicitação está pendente;
- exigência de objeto Storage pertencente ao usuário;
- leitura própria do código de entrega e ausência de permissões de escrita diretas;
- bloqueio de vitrine para empresas inativas.

O workflow GitHub Actions do commit `21398cb65b734ce9dd8c6c01e8b42d228a9e0533` concluiu com **76/76 testes aprovados** e `npm run build` aprovado. O check de Supabase Preview foi ignorado porque a branch não está vinculada a um Supabase Branch; a validação PGlite não substitui testes de integração com usuários reais em staging.

## Segurança de produção

Nenhuma migration foi aplicada ao Supabase de produção. O PR permanece em draft e não deve ser mergeado até o workflow passar e o histórico de migrations ser reconciliado.
