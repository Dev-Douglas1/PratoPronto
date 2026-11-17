# PratoPronto — fundação de assinaturas (ADR)

**Branch:** feature/subscriptions-foundation  
**Base:** design/graphite-theme-preview  
**Status:** preparação de código; SQL não aplicado ao Supabase.

## 1. Backend canônico: RPC/PostgreSQL

O runtime atual do React chama RPCs Supabase, incluindo quote_order, checkout_order, get_storefront, my_restaurants e RPCs de gestão empresarial. A Edge Function ativa pratopronto-api contém uma implementação anterior baseada em store_settings, restaurant_admins, app_commit e app_rate, incompatível com o schema atual consultado.

Decisão:
- PostgreSQL/RPC para estado de assinatura, autorização comercial, transições e idempotência.
- Edge Function dedicada no futuro somente para integrações externas: provedor de cobrança, webhooks e envio de e-mails.
- Nenhuma chave secreta no React.
- A Edge Function legada permanece intocada até confirmar telemetria, clientes externos e ausência de chamadas; depois poderá ser desativada em mudança separada.

A função antiga usa CORS * e verify_jwt=false, embora faça validação manual de bearer token. Isso merece revisão própria. Não alterá-la neste trabalho para evitar quebrar integrações desconhecidas.

## 2. Dois eixos independentes de bloqueio

restaurantes.account_status permanece sob controle administrativo (active/suspended/blocked). Assinatura é um estado comercial independente em private.restaurant_subscriptions.

A autorização operacional é a interseção:
1. estabelecimento não está suspenso/bloqueado administrativamente;
2. existe assinatura válida;
3. plano está ativo;
4. período está válido, sem tolerância após o vencimento.

Basic permanece ativo sem período pago. Trialing exige trial_ends_at > now(). Plano pago exige current_period_ends_at > now(). Cancelamento ao final do período mantém acesso até o fim do período pago.

Não usar set_restaurant_account_status para inadimplência. Não reativar automaticamente uma empresa administrativamente suspensa quando houver pagamento. A função central incluída no SQL draft representa somente o gate comercial; cada RPC de escrita deve combinar esse gate com a autorização administrativa e a permissão do membro.

## 3. Modelo de dados inicial

O SQL draft cria quatro objetos no schema não exposto private:
- subscription_plans: catálogo configurável; preços iniciais Basic R$ 0, Intermediário R$ 59,90 e Pro R$ 99,90.
- restaurant_subscriptions: uma assinatura corrente por estabelecimento, com snapshots do preço/nome.
- subscription_trial_registry: registro permanente com chave primária no CNPJ completo de 14 dígitos. Cada filial pode ter seu próprio trial; conta excluída ou e-mail alterado não libera novo trial.
- subscription_events: trilha de auditoria sem payload bruto de provedor ou dados de pagamento.

O trial de 30 dias do Intermediário somente poderá ser concedido após aprovação do cadastro PJ e dentro de uma transação que insira a chave CNPJ na registry. A unicidade do CNPJ é a barreira contra corrida e duplicidade; verificações no frontend não são suficientes.

## 4. Acesso e RLS

As tabelas são privadas, com RLS ativado e privilégios revogados de PUBLIC, anon e authenticated. Nenhum acesso direto pelo browser é planejado.

Futuras RPCs devem:
- validar auth.uid() e e-mail/telefone verificado conforme o fluxo atual;
- confirmar associação ativa em restaurant_members e papel owner ou admin para gestão da assinatura;
- confirmar is_platform_admin() para alterar catálogo/preços e ajustes administrativos;
- usar SECURITY DEFINER somente quando necessário, em schema não exposto, com search_path vazio, referências totalmente qualificadas e grants EXECUTE mínimos;
- não confiar em user_metadata para autorização;
- não conceder acesso à trial registry nem histórico antifraude a usuários de empresa;
- registrar eventos de forma append-only por funções confiáveis;
- usar operações transacionais e constraints únicas para trial e transições.

## 5. Funções privilegiadas que exigem integração/revisão antes da ativação

Pontos críticos:
- quote_order: validar o gate comercial antes de gerar orçamento.
- checkout_order: validar novamente dentro da transação, impedindo corrida entre orçamento e vencimento.
- save_restaurant_settings e save_restaurant_product / update_restaurant_product_state: bloquear alterações comerciais quando vencido.
- RPCs de membros/equipe: não permitir que atendente altere assinatura.
- set_restaurant_account_status: exclusivamente administrativo; não reutilizar para inadimplência.
- get_storefront: ocultar loja vencida no marketplace sem expor dados internos de assinatura.
- my_restaurants: informar estado comercial resumido somente ao membro autorizado, sem expor registry ou antifraude.

A primeira etapa não modifica essas funções. O gate central está preparado, mas não está conectado ao tráfego até revisão e teste de cada RPC.

## 6. Edge Function legada

A função pratopronto-api foi encontrada ativa, versão 2, verify_jwt=false, CORS *, autenticação manual de bearer token e acesso via service role. Seu schema interno não corresponde ao backend RPC atual. A busca no runtime não encontrou functions.invoke para ela.

Plano:
1. confirmar métricas/logs e consumidores externos;
2. documentar/depreciar a API antiga;
3. migrar eventual consumidor legítimo para RPCs ou Edge Function dedicada;
4. só então desativar/remover a função antiga em PR separado.

Não copiar nem expandir o código legado para assinaturas.

## Fora do escopo desta etapa

- provedor de pagamento, Pix, cartão, cobrança recorrente ou webhook;
- criação automática de trials em empresas existentes;
- bloqueio operacional efetivo no marketplace;
- avisos por e-mail ou modal;
- aplicação do SQL draft em qualquer banco;
- alteração da Edge Function atualmente ativa.

## Critérios para a próxima revisão

- aplicar o SQL apenas em banco local/teste isolado;
- testar unicidade de CNPJ completo e concorrência;
- testar preservação da registry após exclusão do usuário/estabelecimento;
- testar Basic, trial, plano pago, cancelamento no fim do período e expiração sem tolerância;
- provar que bloqueio administrativo nunca é removido por transição de assinatura;
- testar RPCs como cliente anônimo, membro sem permissão, owner/admin e platform admin;
- rodar advisors de segurança/performance e suite completa;
- somente após aprovação preparar uma migration versionada real.
