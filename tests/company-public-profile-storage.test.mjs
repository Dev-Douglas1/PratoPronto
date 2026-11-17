import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationPath = 'supabase/drafts/company-public-profile.sql'
const servicePath = 'src/services/marketplace.js'

test('bucket público limita leitura ao bucket de imagens do perfil', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /values\s*\('company-public-assets','company-public-assets',true,4194304,array\['image\/jpeg','image\/png','image\/webp'\]\)/i)
  assert.match(sql, /on storage\.objects for select\s+to public\s+using\s*\(bucket_id = 'company-public-assets'\)/i)
})

test('upload exige usuário autenticado e papel owner/admin da empresa indicada pela pasta', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  const service = await readFile(servicePath, 'utf8')
  assert.match(sql, /on storage\.objects for insert\s+to authenticated/i)
  assert.match(sql, /private\.restaurant_role\s*\(\s*private\.restaurant_id_from_slug\(\(storage\.foldername\(name\)\)\[1\]\),\s*\(select auth\.uid\(\)\)\s*\) in \('owner','admin'\)/i)
  assert.match(service, /await supabase\.auth\.getUser\(\)/)
  assert.match(service, /const path = companyId \+ '\/' \+ kind \+ '-'/)
  assert.match(service, /upsert:false/)
})

test('arquivos não permitem sobrescrita nem exclusão pelo cliente', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  const policies = [...sql.matchAll(/create policy[\s\S]*?;/gi)].map(([statement]) => statement.toLowerCase())
  assert.equal(policies.some(statement => /for update|for delete|for all/.test(statement)), false)
  assert.equal(policies.filter(statement => /for insert/.test(statement)).length, 1)
})

test('upload rejeita tipos não permitidos e arquivos acima de 4 MB', async () => {
  const service = await readFile(servicePath, 'utf8')
  assert.match(service, /new Set\(\['image\/jpeg','image\/png','image\/webp'\]\)/)
  assert.match(service, /file\.size < 1 \|\| file\.size > COMPANY_IMAGE_MAX_BYTES/)
  assert.match(service, /COMPANY_IMAGE_MAX_BYTES = 4 \* 1024 \* 1024/)
})
