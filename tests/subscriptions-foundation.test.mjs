import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sql = await readFile('supabase/drafts/subscriptions-foundation.sql', 'utf8')
const adr = await readFile('docs/subscriptions-foundation.md', 'utf8')

test('foundation remains a draft and does not replace live RPCs', () => {
  assert.match(sql, /DRAFT ONLY/)
  assert.match(sql, /private\.restaurant_subscriptions/)
  assert.match(sql, /private\.subscription_trial_registry/)
  assert.match(sql, /private\.subscription_events/)
  assert.doesNotMatch(sql, /alter function public\.(quote_order|checkout_order)/i)
})

test('trial registry uses full CNPJ and survives account deletion', () => {
  assert.match(sql, /cnpj text primary key check \(cnpj ~ '\^\[0-9\]\{14\}\$'\)/)
  assert.match(sql, /references public\.restaurantes\(id\) on delete set null/)
  assert.match(sql, /trial_ends_at timestamptz not null/)
  assert.match(adr, /Cada filial pode ter seu próprio trial/)
})

test('commercial gate is independent from administrative blocking', () => {
  assert.match(sql, /r\.account_status = 'active'/)
  assert.match(sql, /function private\.restaurant_subscription_allows_operations/)
  assert.match(adr, /Não usar set_restaurant_account_status para inadimplência/)
})

test('private tables enable RLS and revoke direct browser access', () => {
  for (const table of ['subscription_plans', 'restaurant_subscriptions', 'subscription_trial_registry', 'subscription_events']) {
    assert.match(sql, new RegExp('alter table private\\.' + table + ' enable row level security', 'i'))
  }
  assert.match(sql, /revoke all on table[\s\S]*?from public, anon, authenticated/i)
})

test('no payment integration or provider credentials are included', () => {
  assert.doesNotMatch(sql, /mercadopago|stripe|access_token|webhook_secret|card_number/i)
  assert.match(adr, /provedor de pagamento, Pix, cartão, cobrança recorrente ou webhook/)
})
