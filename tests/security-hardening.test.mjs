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


const advancedMigrationPath = 'supabase/migrations/20261119130000_harden_company_docs_pilot_directory.sql'

test('hardening avançado restringe diretório de pilotos, documentos e segredos de entrega', async () => {
  const sql = await readFile(advancedMigrationPath, 'utf8')
  assert.match(sql, /public\.list_available_pilots\(\)/i)
  assert.match(sql, /rm\.role IN \('owner', 'admin', 'attendant'\)/i)
  assert.match(sql, /r\.account_status = 'active'/i)
  assert.match(sql, /DROP POLICY IF EXISTS company_docs_upload_owner/i)
  assert.match(sql, /DROP POLICY IF EXISTS company_docs_update_owner/i)
  assert.match(sql, /public\.can_upload_company_registration_document/i)
  assert.match(sql, /o\.owner_id = uid::text/i)
  assert.match(sql, /p_path IS DISTINCT FROM expected_path/i)
  assert.match(sql, /REVOKE ALL ON TABLE public\.delivery_secrets FROM anon, authenticated/i)
  assert.match(sql, /GRANT SELECT ON TABLE public\.delivery_secrets TO authenticated/i)
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM public\.delivery_secrets/i)
})

test('migration avançada aplica em PostgreSQL temporário e mantém os fluxos autorizados', async () => {
  const sql = await readFile(advancedMigrationPath, 'utf8')
  const db = new PGlite()
  const userId = '11111111-1111-4111-8111-111111111111'
  const otherUserId = '22222222-2222-4222-8222-222222222222'
  const restaurantId = '33333333-3333-4333-8333-333333333333'
  const requestId = '44444444-4444-4444-8444-444444444444'
  const rejectedRequestId = '55555555-5555-4555-8555-555555555555'
  const validPath = `${userId}/${requestId}/cnpj_card.pdf`

  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE SCHEMA private;
      CREATE SCHEMA storage;

      CREATE TABLE auth.users (
        id uuid PRIMARY KEY,
        email_confirmed_at timestamptz,
        phone_confirmed_at timestamptz,
        deleted_at timestamptz,
        banned_until timestamptz
      );
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

      CREATE FUNCTION private.verified(actor uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
      AS $$ SELECT EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = actor
          AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)
          AND u.deleted_at IS NULL
      ) $$;

      CREATE TABLE public.restaurantes (
        id uuid PRIMARY KEY,
        account_status text NOT NULL
      );
      CREATE TABLE public.restaurant_members (
        restaurante_id uuid NOT NULL,
        profile_id uuid NOT NULL,
        role text NOT NULL,
        active boolean NOT NULL
      );
      CREATE TABLE public.pilot_profiles (
        profile_id uuid PRIMARY KEY,
        display_name text,
        vehicle_type text,
        city text,
        accepting_offers boolean,
        motorcycle_type text,
        vehicle_color text,
        approval_status text,
        account_status text
      );
      CREATE TABLE public.company_registration_requests (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        person_type text NOT NULL,
        status text NOT NULL
      );
      CREATE TABLE public.company_registration_documents (
        request_id uuid NOT NULL,
        user_id uuid NOT NULL,
        document_type text NOT NULL,
        storage_path text NOT NULL,
        mime_type text NOT NULL,
        file_size bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (request_id, document_type)
      );
      CREATE TABLE storage.objects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id text NOT NULL,
        name text NOT NULL,
        owner uuid,
        owner_id text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE (bucket_id, name)
      );
      CREATE FUNCTION storage.foldername(path text) RETURNS text[]
      LANGUAGE sql IMMUTABLE
      AS $$
        SELECT CASE
          WHEN array_length(string_to_array(path, '/'), 1) > 1
          THEN (string_to_array(path, '/'))[1:array_length(string_to_array(path, '/'), 1) - 1]
          ELSE ARRAY[]::text[]
        END
      $$;
      CREATE FUNCTION public.is_platform_admin() RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT false $$;
      CREATE FUNCTION public.can_upload_company_registration_document(p_request_id uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
      AS $$ SELECT EXISTS (
        SELECT 1 FROM public.company_registration_requests q
        WHERE q.id = p_request_id
          AND q.user_id = auth.uid()
          AND q.status = 'pending'
      ) $$;

      CREATE TABLE public.delivery_secrets (
        order_id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        code text NOT NULL
      );
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.delivery_secrets ENABLE ROW LEVEL SECURITY;
      CREATE POLICY company_docs_read_owner ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = 'company-registration-documents'
          AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR public.is_platform_admin())
        );
      CREATE POLICY company_docs_upload_owner ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'company-registration-documents'
          AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
        );
      CREATE POLICY company_docs_update_owner ON storage.objects
        FOR UPDATE TO authenticated
        USING (
          bucket_id = 'company-registration-documents'
          AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
        )
        WITH CHECK (
          bucket_id = 'company-registration-documents'
          AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
        );
      CREATE POLICY delivery_secret_owner_read ON public.delivery_secrets
        FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
      GRANT SELECT, INSERT, UPDATE ON storage.objects TO authenticated;
      GRANT ALL ON public.delivery_secrets TO anon, authenticated;
    `)

    await db.exec(sql)

    const privileges = await db.query(`
      SELECT
        has_table_privilege('anon', 'public.delivery_secrets', 'SELECT') AS anon_select,
        has_table_privilege('authenticated', 'public.delivery_secrets', 'SELECT') AS auth_select,
        has_table_privilege('authenticated', 'public.delivery_secrets', 'INSERT') AS auth_insert,
        has_table_privilege('authenticated', 'public.delivery_secrets', 'UPDATE') AS auth_update
    `)
    assert.equal(privileges.rows[0].anon_select, false)
    assert.equal(privileges.rows[0].auth_select, true)
    assert.equal(privileges.rows[0].auth_insert, false)
    assert.equal(privileges.rows[0].auth_update, false)

    await db.query(
      `INSERT INTO auth.users(id,email_confirmed_at) VALUES ($1,now()),($2,now())`,
      [userId, otherUserId],
    )
    await db.query(
      `INSERT INTO public.pilot_profiles VALUES ($1,'Piloto teste','Moto','Curitiba',true,'CG 160','Preta','approved','active')`,
      [otherUserId],
    )
    await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [userId])
    await db.exec('SET ROLE authenticated')
    await assert.rejects(
      () => db.query('SELECT * FROM public.list_available_pilots()'),
      /somente para a equipe|Acesso restrito/i,
    )
    await db.exec('RESET ROLE')

    await db.query(
      `INSERT INTO public.restaurantes(id,account_status) VALUES ($1,'active')`,
      [restaurantId],
    )
    await db.query(
      `INSERT INTO public.restaurant_members VALUES ($1,$2,'attendant',true)`,
      [restaurantId, userId],
    )
    await db.exec('SET ROLE authenticated')
    const pilots = await db.query('SELECT profile_id FROM public.list_available_pilots()')
    assert.equal(pilots.rows.length, 1)
    assert.equal(pilots.rows[0].profile_id, otherUserId)
    await db.exec('RESET ROLE')

    await db.query(
      `INSERT INTO public.company_registration_requests VALUES ($1,$2,'pj','pending'),($3,$2,'pj','pending')`,
      [requestId, userId, rejectedRequestId],
    )
    await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [userId])
    await db.exec('SET ROLE authenticated')
    await db.query(
      `INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES ('company-registration-documents',$1,$2,$2)`,
      [validPath, userId],
    )
    const registered = await db.query(
      `SELECT public.register_company_document($1,'cnpj_card',$2,'application/pdf',123) AS result`,
      [requestId, validPath],
    )
    assert.equal(registered.rows[0].result.saved, true)

    await db.query(
      `UPDATE storage.objects SET metadata='{"version":2}'::jsonb WHERE bucket_id='company-registration-documents' AND name=$1`,
      [validPath],
    )
    await db.exec('RESET ROLE')

    await db.query(
      `UPDATE public.company_registration_requests SET status='approved' WHERE id=$1`,
      [requestId],
    )
    await db.exec('SET ROLE authenticated')
    const locked = await db.query(
      `UPDATE storage.objects SET metadata='{"version":3}'::jsonb WHERE bucket_id='company-registration-documents' AND name=$1`,
      [validPath],
    )
    assert.equal(locked.affectedRows ?? locked.rowCount, 0)
    await assert.rejects(
      () => db.query(
        `SELECT public.register_company_document($1,'cnpj_card',$2,'application/pdf',123)`,
        [requestId, validPath],
      ),
      /Solicitação não encontrada|já analisada/i,
    )
    await assert.rejects(
      () => db.query(
        `SELECT public.register_company_document($1,'cnpj_card',$2,'application/pdf',123)`,
        [rejectedRequestId, `${userId}/${rejectedRequestId}/cnpj_card.pdf`],
      ),
      /arquivo não foi localizado|armazenamento privado/i,
    )
    await db.exec('RESET ROLE')

    await db.query(
      `INSERT INTO public.delivery_secrets(order_id,user_id,code) VALUES ($1,$2,'1234')`,
      [restaurantId, userId],
    )
    await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [userId])
    await db.exec('SET ROLE authenticated')
    const ownSecret = await db.query('SELECT code FROM public.delivery_secrets')
    assert.equal(ownSecret.rows.length, 1)
    assert.equal(ownSecret.rows[0].code, '1234')
    await db.exec('RESET ROLE')
  } finally {
    await db.close()
  }
})


test('storefront e cotação não expõem nem aceitam restaurantes inativos', async () => {
  const migrationPath = 'supabase/migrations/20261119140000_guard_inactive_restaurant_storefront.sql'
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /r\.ativo = true AND r\.account_status = 'active'/i)
  assert.match(sql, /if not r\.ativo or r\.account_status <> 'active'/i)

  const db = new PGlite()
  const restaurantId = '66666666-6666-4666-8666-666666666666'
  try {
    await db.exec(`
      CREATE SCHEMA private;
      CREATE SCHEMA auth;
      CREATE TABLE public.restaurantes (
        id uuid PRIMARY KEY,
        slug text NOT NULL,
        nome text NOT NULL,
        telefone text,
        ativo boolean NOT NULL,
        account_status text NOT NULL
      );
      CREATE TABLE public.restaurant_settings (
        restaurante_id uuid PRIMARY KEY,
        data jsonb
      );
      CREATE TABLE public.profiles (
        id uuid, nome text, email text, telefone text, endereco text,
        numero text, bairro text, complemento text, cep text, cidade text, uf text
      );
      CREATE TABLE public.products (
        id uuid, restaurant_id uuid, slug text, active boolean, price_cents integer,
        config jsonb, promotion jsonb, name text, description text, category text, image_url text
      );
      CREATE TABLE public.quotes (
        id uuid, user_id uuid, restaurant_id uuid, data jsonb, revision uuid, expires_at timestamptz
      );
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION private.restaurant_id_from_slug(p_slug text) RETURNS uuid
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
      AS $$ SELECT id FROM public.restaurantes WHERE slug = lower(trim(p_slug)) LIMIT 1 $$;
      CREATE FUNCTION private.verified(actor uuid) RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT true $$;
      CREATE FUNCTION private.enforce_rate_limit(text, integer, integer) RETURNS void
      LANGUAGE sql AS $$ SELECT $$;
      CREATE FUNCTION private.normalize_search(value text) RETURNS text
      LANGUAGE sql IMMUTABLE AS $$ SELECT lower(trim(coalesce(value,''))) $$;
    `)
    await db.exec(sql)
    await db.query(
      `INSERT INTO public.restaurantes VALUES ($1,'loja-teste','Loja teste','41999999999',true,'active')`,
      [restaurantId],
    )
    await db.query(
      `INSERT INTO public.restaurant_settings VALUES ($1,$2::jsonb)`,
      [restaurantId, JSON.stringify({
        name: 'Loja teste', phone: '41999999999', address: {}, hours: [], zones: [],
        methods: ['maquina_entrega'], acceptingOrders: true,
      })],
    )
    const active = await db.query(`SELECT public.get_storefront('loja-teste') AS storefront`)
    assert.equal(active.rows[0].storefront.name, 'Loja teste')

    await db.query(`UPDATE public.restaurantes SET ativo=false WHERE id=$1`, [restaurantId])
    await assert.rejects(
      () => db.query(`SELECT public.get_storefront('loja-teste')`),
      /Empresa não está disponível/i,
    )
    await db.query(
      `UPDATE public.restaurantes SET ativo=true,account_status='suspended' WHERE id=$1`,
      [restaurantId],
    )
    await assert.rejects(
      () => db.query(`SELECT public.get_storefront('loja-teste')`),
      /Empresa não está disponível/i,
    )
  } finally {
    await db.close()
  }
})
