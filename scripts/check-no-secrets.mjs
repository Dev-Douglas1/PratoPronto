import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
const IGNORED_DIRS = new Set(['.git','node_modules','dist','.vite','coverage'])
const TEXT_EXT = new Set(['.js','.jsx','.mjs','.cjs','.ts','.tsx','.json','.md','.yml','.yaml','.toml','.env','.txt','.sql','.html','.css'])
const EXACT_TEXT = new Set(['.env.example','.gitignore'])

const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['supabase-secret', /sb_secret_[A-Za-z0-9_-]{16,}/],
  ['firebase-api-key-leftover', /AIza[0-9A-Za-z_-]{25,}/],
  ['private-jwt', /eyJhbGciOi[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/],
  ['vite-service-role', /VITE_[A-Z0-9_]*(?:SERVICE_ROLE|PRIVATE_KEY|SECRET_KEY)[A-Z0-9_]*/],
]

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(path))
    else if (TEXT_EXT.has(extname(entry.name).toLowerCase()) || EXACT_TEXT.has(entry.name)) out.push(path)
  }
  return out
}

const findings = []
for (const file of await walk(ROOT)) {
  const path = relative(ROOT, file).replaceAll('\\','/')
  const source = await readFile(file, 'utf8')
  for (const [name, pattern] of patterns) {
    if (pattern.test(source)) findings.push({ path, name })
  }
}

if (findings.length) {
  console.error('Possível segredo ou configuração proibida encontrada:')
  for (const finding of findings) console.error(`- ${finding.path}: ${finding.name}`)
  process.exit(1)
}
console.log('Nenhum padrão de segredo privado foi encontrado nos arquivos do projeto.')
