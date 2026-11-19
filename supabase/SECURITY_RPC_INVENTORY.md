# Inventário de RPCs SECURITY DEFINER — PratoPronto

Auditoria de 2026-11-19. Base: definições e ACLs lidas diretamente do PostgreSQL remoto, sem modificar dados.

## Contagem e exposição

- 46 funções `SECURITY DEFINER` em `public`.
- 42 executáveis por `authenticated`.
- 1 executável por `anon`: `get_storefront(text)`, compartilhada também com authenticated.
- 4 sem execução por usuários finais, reservadas ao backend/trigger: `buscar_empresas_ranqueadas`, `create_restaurant`, `handle_new_user`, `vincular_dono_equipe`.
- As 46 funções usam `SET search_path TO ''`.
- Não revogar EXECUTE em massa: as funções são dependências dos fluxos de aplicação.

## Pedidos, entrega e avaliações

| RPC | Verificação observada |
|---|---|
| `quote_order(text,jsonb,text,text,boolean)` | Usuário verificado, rate limit, termos aceitos, catálogo ativo, preço calculado no servidor, área de entrega e forma de pagamento permitida. Migration adicional exige empresa ativa. |
| `checkout_order(uuid,uuid)` | Usuário verificado, quote do próprio usuário, validade da cotação, método permitido e idempotência/locks. |
| `advance_order(uuid,text,boolean)` | Papel operacional na empresa do pedido e transição de status validada; entrega protegida não pode ser confirmada pela empresa. |
| `create_order_delivery_offer(uuid,uuid,uuid,text)` | Owner/admin/attendant da empresa do pedido; piloto aprovado/disponível ou contato da mesma empresa. |
| `respond_order_delivery_offer(uuid,boolean)` | Oferta pertence ao piloto autenticado, status pendente, piloto operacional e pedido ainda elegível. |
| `pilot_start_delivery(uuid)` | Piloto operacional e pedido atribuído ao mesmo perfil; bloqueio por estado. |
| `pilot_confirm_delivery(uuid,text,boolean)` | Piloto atribuído, estado válido, hash do código e rate limit de tentativas. |
| `submit_refund_request(uuid,text)` | Confere que o pedido pertence ao cliente. |
| `decide_refund_request(uuid,boolean,text)` | Papel operacional na empresa e solicitação pendente; estorno externo não existe ainda para pagamentos já recebidos. |
| `submit_order_review(uuid,integer,integer,text)` | Pedido pertence ao cliente e já foi entregue; notas e comentário validados. |
| `reply_order_review(uuid,text)` | Papel owner/admin/attendant na empresa da avaliação; resposta limitada e validada. |

## Cadastro empresarial e documentos

| RPC | Verificação observada |
|---|---|
| `submit_company_registration(text,text,text)` | Usuário verificado e solicitação associada ao próprio usuário. |
| `submit_company_registration_v2(text,text,text,text,text,text)` | Usuário verificado, validação de tipo PF/PJ, dados fiscais e solicitação do próprio usuário. |
| `my_company_registration_request_v2()` | Retorna a solicitação do usuário autenticado. |
| `register_company_document(uuid,text,text,text,bigint)` | Usuário verificado, solicitação própria ainda pendente; migration passa a exigir caminho canônico e objeto existente com `owner_id` do solicitante. |
| `can_upload_company_registration_document(uuid)` | Verifica se a solicitação pertence ao usuário e está pendente; usada pelas políticas de Storage. |
| `list_company_registration_documents(uuid)` | Só dono da solicitação ou administrador da plataforma. |
| `list_company_registration_requests()` | Administrador da plataforma. |
| `list_company_registration_requests_v2()` | Administrador da plataforma. |
| `review_company_registration(uuid,boolean,text)` | Administrador da plataforma, registro bloqueado durante análise e documentos exigidos antes da aprovação. |

## Pilotos

| RPC | Verificação observada |
|---|---|
| `save_pilot_profile(text,text,text,boolean)` | Usuário verificado, perfil próprio, dados pessoais/veículo validados e bloqueio de alterações com entregas ativas. |
| `submit_pilot_application(text,date,text,text,text,text)` | Usuário verificado, documentos/caminhos do próprio perfil e validações de cadastro. |
| `list_pilot_applications(text)` | Administrador da plataforma. |
| `review_pilot_application(uuid,boolean,text)` | Administrador da plataforma e linha bloqueada durante análise. |
| `set_pilot_account_status(uuid,text,text)` | Administrador da plataforma e linha bloqueada durante alteração. |
| `set_pilot_availability(boolean)` | Altera disponibilidade do próprio piloto. |
| `list_available_pilots()` | **Correção adicionada:** antes listava pilotos a qualquer usuário autenticado. Agora exige conta verificada/não banida, vínculo ativo a empresa ativa, papel owner/admin/attendant e rate limit de 30 consultas por minuto. |

## Empresa, catálogo e equipe

| RPC | Verificação observada |
|---|---|
| `add_restaurant_member(text,text,text)` | Usuário verificado, papel autorizado na empresa, validação do papel-alvo e linha bloqueada. |
| `remove_restaurant_member(text,uuid)` | Usuário verificado, papel autorizado na empresa e validação de hierarquia/linha bloqueada. |
| `list_restaurant_members(text)` | Associação e papel operacional na empresa solicitada. |
| `company_catalog_list(uuid)` | Associação e papel operacional na empresa. |
| `company_catalog_save(uuid,uuid,text,text,text,integer,text,boolean)` | Associação e papel operacional na empresa. |
| `company_catalog_set_active(uuid,uuid,boolean)` | Associação e papel operacional na empresa. |
| `save_restaurant_product(text,text,text,text,text,integer,text,boolean,jsonb,jsonb)` | Associação e papel operacional na empresa; valida dados de produto/preço/configuração. |
| `update_restaurant_product_state(text,text,integer,boolean,jsonb,boolean)` | Associação e papel operacional na empresa; linha bloqueada. |
| `save_restaurant_settings(text,jsonb)` | Associação e papel operacional na empresa; validação server-side das configurações. |
| `save_restaurant_pilot_contact(text,uuid,uuid,text,text,text,text,text)` | Associação e papel operacional na empresa; valida contato e piloto. |
| `remove_restaurant_pilot_contact(text,uuid)` | Associação e papel operacional na empresa. |
| `set_restaurant_account_status(text,text,text)` | Administrador da plataforma, motivo obrigatório para suspensão/bloqueio e linha bloqueada. |
| `list_platform_restaurants()` | Administrador da plataforma. |
| `request_account_deletion()` | Usuário autenticado; impede exclusão enquanto for proprietário ativo de empresa. |

## Vitrine pública

| RPC | Verificação observada |
|---|---|
| `get_storefront(text)` | Exposição anônima intencional para vitrine pública. Migration adicional agora limita o retorno a empresas ativas (`ativo=true`, `account_status='active'`). |

## Correções e pendências

1. Correções aplicadas em branch: diretório de pilotos, Storage de documentos, grants de `delivery_secrets`, vitrine e cotação para empresas inativas.
2. `delivery_secrets`: cliente mantém somente SELECT, com RLS de leitura do próprio código; INSERT/UPDATE/DELETE são reservados às RPCs.
3. Pagamentos: só maquininha na entrega está ativa. Aprovação de reembolso de pagamento já recebido não executa estorno externo; precisa de fluxo manual ou gateway antes de automatizar.
4. O inventário cobre ACL, `search_path` e guardas de autorização. Testes reais com duas empresas, cliente, piloto e administrador ainda precisam ser executados em staging depois da reconciliação das migrations.
5. Não foram aplicadas alterações ao banco de produção.
