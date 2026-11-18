import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('promoções usam o catálogo da empresa selecionada, não apenas o catálogo padrão', async () => {
  const component = await readFile('src/components/company/Promotions.jsx', 'utf8')
  const dashboard = await readFile('src/pages/CompanyDashboard.jsx', 'utf8')
  assert.match(component, /products: companyProducts/)
  assert.match(component, /const catalog = Array\.isArray\(companyProducts\) \? companyProducts : produtos/)
  assert.match(component, /const offers = catalog\.flatMap/)
  assert.match(component, /const available = catalog\.filter/)
  assert.match(component, /products=\{catalog\}/)
  assert.match(dashboard, /<Promotions settings=\{data\.settings\} products=\{companyId === DEFAULT_COMPANY_ID \|\| demo \? produtos : data\.settings\}/)
})
