# Planos e assinaturas

A migration `20261118150000_subscription_plans_and_quotas.sql` cria:

- Plano inicial Gratuito: 20 produtos, 2 membros ativos e 100 pedidos por mês.
- Assinatura vinculada a cada empresa existente e atribuição automática para novas empresas.
- Contagem de uso por empresa e bloqueios no banco para novos produtos, membros ativos e pedidos ao exceder limites.
- Consulta de assinatura para proprietários/administradores da empresa.
- Painel administrativo protegido para cadastrar/editar planos e atribuir planos às empresas.

Os limites do plano gratuito são valores iniciais configuráveis pelo administrador da plataforma. Não representam uma tabela comercial definitiva.

## Limitação de cobrança

A cobrança de planos pagos ainda não está integrada. Quando um plano com preço maior que zero é atribuído, a assinatura fica em `pending_payment`; não é ativada nem cobrada automaticamente. Ainda não há webhook verificado do Mercado Pago, checkout de assinatura ou rotina de renovação. Não prometa cobrança recorrente, Pix, cartão ou renovação automática até implementar e homologar esse fluxo.

## Aplicação segura

A pasta `supabase/migrations` deste repositório não contém o histórico integral já aplicado em produção. Não rode `supabase db reset` com esse histórico incompleto e não aplique esta migration diretamente em produção.

1. Reconciliar e versionar o histórico completo de migrations.
2. Aplicar em Supabase local ou projeto descartável de desenvolvimento.
3. Criar duas empresas sintéticas e usuários de teste.
4. Testar limites no banco (produto, membro e pedido), tentativas entre empresas e acesso administrativo não autorizado.
5. Revisar backup e plano de rollback antes de qualquer implantação em produção.
