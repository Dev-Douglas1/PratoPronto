import test, { before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

let db
const uid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const restaurant = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
before(async () => {
  db = new PGlite()
  await db.exec(await readFile(new URL('./support/team-schema.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../supabase/migrations/20260923024345_account_ids_and_team_permissions.sql', import.meta.url), 'utf8'))
})
after(async () => { await db?.close() })
beforeEach(async () => { await db.exec('begin') })
afterEach(async () => { await db.exec('rollback') })
async function as(n, role = 'authenticated') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [n ? uid(n) : ''])
  await db.exec(`set local role ${role}`)
}
async function add(identifier, role = 'attendant', company = 'loja-a') {
  return (await db.query('select public.add_restaurant_member($1,$2,$3) as result', [company, identifier, role])).rows[0].result
}
async function remove(id, company = 'loja-a') {
  return (await db.query('select public.remove_restaurant_member($1,$2) as result', [company, id])).rows[0].result
}
async function rejects(action, code) {
  // A denied statement must not abort the surrounding test transaction.
  await db.exec('savepoint denied_call')
  await assert.rejects(action, error => error.code === code)
  await db.exec('rollback to savepoint denied_call')
}

test('proprietário usa ID estável, atualiza função sem duplicar vínculo e mantém e-mail compatível', async () => {
  await as(1)
  assert.equal((await add(uid(3), 'admin')).userId, uid(3))
  const first = await db.query('select id from public.restaurant_members where profile_id=$1', [uid(3)])
  await add(uid(3), 'kitchen')
  const next = await db.query('select id,role from public.restaurant_members where profile_id=$1', [uid(3)])
  assert.equal(next.rows.length, 1)
  assert.equal(first.rows[0].id, next.rows[0].id)
  assert.equal(next.rows[0].role, 'kitchen')
  assert.equal((await add(' USER3@EXAMPLE.TEST ')).userId, uid(3))
  assert.equal(await remove(uid(3)), true)
  assert.equal((await db.query('select active from public.restaurant_members where profile_id=$1', [uid(3)])).rows[0].active, false)
})

test('telefone confirmado pode entrar na equipe por ID, mas e-mail não verificado não serve para localizar', async () => {
  await as(1)
  assert.equal((await add(uid(7))).userId, uid(7))
  await rejects(() => add('phone@example.test'), '22023')
  for (const id of [uid(8), uid(9), uid(10), uid(99)]) await rejects(() => add(id), '22023')
})

test('conhecer um ID não autoriza cliente, cozinha ou proprietário de outro restaurante', async () => {
  for (const actor of [3, 4, 5]) {
    await as(actor)
    await rejects(() => add(uid(3), 'admin'), '42501')
    await rejects(() => remove(uid(2)), '42501')
  }
  await as(1)
  await rejects(() => add(uid(3), 'admin', 'loja-b'), '42501')
  await rejects(() => remove(uid(4), 'loja-b'), '42501')
})

test('administrador gerencia operação sem promover administradores, remover pares ou alterar proprietário', async () => {
  await as(2)
  await add(uid(3), 'kitchen')
  assert.equal(await remove(uid(3)), true)
  await rejects(() => add(uid(3), 'admin'), '42501')
  await rejects(() => add(uid(6), 'kitchen'), '42501')
  await rejects(() => remove(uid(6)), '42501')
  await rejects(() => add(uid(1), 'attendant'), '42501')
  await rejects(() => remove(uid(1)), '42501')
  await rejects(() => add(uid(2), 'kitchen'), '42501')
  await rejects(() => remove(uid(2)), '42501')
})

test('nem proprietário concede papel global, recria dono ou remove seu próprio vínculo', async () => {
  await as(1)
  for (const role of ['owner', 'platform_admin', '', null]) await rejects(() => add(uid(3), role), '22023')
  await rejects(() => add(uid(1), 'admin'), '42501')
  await rejects(() => remove(uid(1)), '42501')
  for (const value of [null, '', 'id-curto', uid(3) + '-errado']) await rejects(() => add(value), '22023')
})

test('conta não confirmada, bloqueada ou restaurante suspenso não altera permissões', async () => {
  for (const actor of [8, 9, 10]) {
    await db.exec('reset role')
    await db.query('insert into public.restaurant_members(restaurante_id,profile_id,role) values($1,$2,$3)', [restaurant(1), uid(actor), 'admin'])
    await as(actor)
    await rejects(() => add(uid(3)), '42501')
    await rejects(() => remove(uid(5)), '42501')
  }
  await db.exec("reset role; update public.restaurantes set account_status='suspended' where slug='loja-a'")
  await as(1)
  await rejects(() => add(uid(3)), '42501')
})

test('cliente não escreve vínculos diretamente e lista somente a equipe autorizada', async () => {
  await as(1)
  await rejects(() => db.query('update public.restaurant_members set role=$1 where profile_id=$2', ['owner', uid(3)]), '42501')
  await rejects(() => db.query('insert into public.restaurant_members(restaurante_id,profile_id,role) values($1,$2,$3)', [restaurant(2), uid(3), 'owner']), '42501')
  const list = await db.query("select * from public.list_restaurant_members('loja-a')")
  assert.equal(list.rows.length, 4)
  await as(4)
  assert.equal((await db.query("select * from public.list_restaurant_members('loja-a')")).rows.length, 0)
  await as(null, 'anon')
  await rejects(() => add(uid(3)), '42501')
  await rejects(() => db.query('select * from public.restaurant_members'), '42501')
})
