import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('assinaturas possuem planos, estados e limites persistidos por empresa', async()=>{
  const sql=await readFile('supabase/migrations/20261118150000_subscription_plans_and_quotas.sql','utf8')
  assert.match(sql,/create table if not exists public\.subscription_plans/i)
  assert.match(sql,/create table if not exists public\.restaurant_subscriptions/i)
  for(const status of ['active','trialing','pending_payment','past_due','canceled','expired']) assert.match(sql,new RegExp(status))
  assert.match(sql,/products_subscription_quota/)
  assert.match(sql,/restaurant_members_subscription_quota/)
  assert.match(sql,/orders_subscription_quota/)
  assert.match(sql,/date_trunc\('month',now\(\)\)/)
  assert.match(sql,/assign_free_subscription_to_new_restaurant/)
  assert.match(sql,/alter table public\.restaurant_subscriptions enable row level security/i)
})

test('RPCs de assinatura exigem associação empresarial ou administrador da plataforma',async()=>{
  const sql=await readFile('supabase/migrations/20261118150000_subscription_plans_and_quotas.sql','utf8')
  assert.match(sql,/get_my_restaurant_subscription[\s\S]*?rm\.profile_id=auth\.uid\(\)[\s\S]*?rm\.role in \('owner','admin'\)/)
  assert.match(sql,/list_platform_subscriptions[\s\S]*?public\.is_platform_admin\(\)/)
  assert.match(sql,/admin_save_subscription_plan[\s\S]*?public\.is_platform_admin\(\)/)
  assert.match(sql,/admin_set_restaurant_subscription[\s\S]*?public\.is_platform_admin\(\)/)
  assert.match(sql,/Plano pago nunca é ativado manualmente/)
  assert.match(sql,/next_status:=case when coalesce\(plan_row\.monthly_price_cents,0\)=0 then 'active' else 'pending_payment' end/)
})

test('frontend consulta assinatura e expõe administração sob rota protegida',async()=>{
  const [server,settings,overview,app,admin]=await Promise.all([
    readFile('src/services/server.js','utf8'),
    readFile('src/components/company/StoreSettings.jsx','utf8'),
    readFile('src/components/company/SubscriptionOverview.jsx','utf8'),
    readFile('src/App.jsx','utf8'),
    readFile('src/pages/PlatformSubscriptions.jsx','utf8'),
  ])
  assert.match(server,/get_my_restaurant_subscription/)
  assert.match(server,/admin_save_subscription_plan/)
  assert.match(server,/admin_set_restaurant_subscription/)
  assert.match(settings,/SubscriptionOverview/)
  assert.match(overview,/monthlyOrders/)
  assert.match(overview,/pending_payment/)
  assert.match(app,/PlatformAdminRoute><PlatformSubscriptions \/><\/PlatformAdminRoute>/)
  assert.match(admin,/aguardando pagamento/i)
  assert.match(admin,/Nenhuma cobrança foi realizada/)
})
