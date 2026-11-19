import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrationPath = 'supabase/migrations/20261119120000_enable_rls_on_private_rate_limits.sql'

test('hardening da tabela interna de rate limit não concede acesso direto', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /ALTER TABLE private\.rpc_rate_limits ENABLE ROW LEVEL SECURITY/i)
  assert.doesNotMatch(sql, /CREATE\s+POLICY|GRANT\s+/i)
  assert.match(sql, /Direct client access is intentionally denied/i)

  const db = new PGlite()
  try {
    await db.exec(`
      CREATE SCHEMA private;
      CREATE TABLE private.rpc_rate_limits (
        scope text NOT NULL,
        actor_id uuid NOT NULL,
        bucket_start timestamptz NOT NULL,
        hits integer NOT NULL DEFAULT 0,
        PRIMARY KEY (scope, actor_id, bucket_start)
      );
    `)
    await db.exec(sql)
    const state = await db.query(`
      SELECT c.relrowsecurity AS rls_enabled,
             (SELECT count(*)::int FROM pg_policies
              WHERE schemaname = 'private'
                AND tablename = 'rpc_rate_limits') AS policy_count
      FROM pg_class c
      WHERE c.oid = 'private.rpc_rate_limits'::regclass
    `)
    assert.equal(state.rows[0].rls_enabled, true)
    assert.equal(state.rows[0].policy_count, 0)
  } finally {
    await db.close()
  }
})

test('auditoria de segurança não aplica revogação em massa de RPCs SECURITY DEFINER', async () => {
  const migration = await readFile(migrationPath, 'utf8')
  assert.doesNotMatch(migration, /REVOKE\s+EXECUTE|ALTER\s+FUNCTION|DROP\s+FUNCTION/i)
})
