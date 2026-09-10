import { readFileSync, writeFileSync } from 'node:fs'

const sourcePath = 'firestore.rules'
const outputPath = 'firestore.secure.rules'
const source = readFileSync(sourcePath, 'utf8')

const orderBlock = 'match /orders/{orderId} {'
const orderIndex = source.indexOf(orderBlock)
if (orderIndex === -1) {
  console.error('Não foi possível localizar o bloco /orders em firestore.rules.')
  process.exit(1)
}

const beforeOrders = source.slice(0, orderIndex)
const ordersAndAfter = source.slice(orderIndex)
const directCreatePattern = /allow create: if emailVerificado\(\)[\s\S]*?&& request\.resource\.data\.updatedAt == request\.time;/

if (!directCreatePattern.test(ordersAndAfter)) {
  console.error('Não foi possível localizar a regra de criação direta de pedidos. Nenhuma regra segura foi gerada.')
  process.exit(1)
}

const secureOrdersAndAfter = ordersAndAfter.replace(
  directCreatePattern,
  `// Modo backend seguro: somente o Firebase Admin SDK/Cloud Functions cria pedidos.\n      // O Admin SDK ignora Security Rules; navegadores e clientes não confiáveis são bloqueados.\n      allow create: if false;`,
)

const output = beforeOrders + secureOrdersAndAfter
writeFileSync(outputPath, output)
console.log(`Regras seguras geradas em ${outputPath}. Criação direta de pedidos pelo cliente: BLOQUEADA.`)
