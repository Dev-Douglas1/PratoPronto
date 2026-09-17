import { readFileSync, writeFileSync } from 'node:fs'

// Compatibility with the previous CI/deployment command. Current rules already
// deny all browser writes to orders, including restaurant accounts.
const source = readFileSync('firestore.rules', 'utf8')
const orders = source.match(/match \/orders\/\{orderId\} \{([\s\S]*?)\n    \}/)?.[1]
const permissions = orders?.replace(/\/\/[^\n]*/g, '').matchAll(/allow\s+([^:]+):\s*if\s+([^;]+);/g)
let deniesWrites = false
for (const [, actions, condition] of permissions || []) {
  if (actions.split(',').some(action => ['write', 'create', 'update', 'delete'].includes(action.trim()))) {
    if (condition.trim() !== 'false') throw new Error('Há uma permissão de escrita em pedidos. Revise as regras antes de publicar.')
    if (actions.trim() === 'write') deniesWrites = true
  }
}
if (!deniesWrites) throw new Error('Não foi encontrado o bloqueio de escrita de pedidos. Nenhum arquivo foi gerado.')
writeFileSync('firestore.secure.rules', source)
console.log('Regras seguras copiadas: escrita de pedidos pelo navegador bloqueada.')
