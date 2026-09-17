import { readFile, writeFile } from 'node:fs/promises'
import { OFFENSIVE_PATTERN } from '../src/input-policy.js'
const file = new URL('../../firestore.rules', import.meta.url)
const source = await readFile(file, 'utf8')
const filter = `    // BEGIN CONTENT FILTER\n    function respectful(value) { return !value.matches(${JSON.stringify('(?is).*' + OFFENSIVE_PATTERN + '.*')}); }\n    // END CONTENT FILTER`
const updated = source.replace(/    \/\/ BEGIN CONTENT FILTER[\s\S]*?    \/\/ END CONTENT FILTER/, filter)
if (process.argv.includes('--check')) {
  if (source !== updated) throw new Error('Sincronize o filtro de conteúdo das regras antes de publicar.')
} else await writeFile(file, updated)
