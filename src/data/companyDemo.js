import { produtos } from './produtos.js'

export function makeDemoOrder(number = 1048) {
  const produto = produtos[(number - 1048 + produtos.length * 100) % 6]
  return {
    id: 'PP-' + number, userId: 'cliente-ficticio-' + number,
    cliente: { nome: ['Marina Costa', 'Rafael Lima', 'Beatriz Alves', 'Lucas Pereira', 'Ana Ribeiro', 'João Oliveira'][number % 6], email: 'cliente@example.com', telefone: '' },
    entrega: { endereco: 'Rua de Exemplo', numero: String(100 + number % 200), bairro: ['Centro', 'Jardim das Flores', 'Vila Nova'][number % 3], complemento: 'Endereço fictício para demonstração' },
    itens: [{ id: produto.id, nome: produto.nome, detalhes: 'Grande • borda tradicional', quantidade: 1, precoUnitario: produto.preco }, { id: 'coca-cola', nome: 'Coca-Cola', detalhes: '550 ml', quantidade: 1, precoUnitario: 7.99 }],
    subtotal: Math.round((produto.preco + 7.99) * 100) / 100, taxaEntrega: 5,
    total: Math.round((produto.preco + 12.99) * 100) / 100,
    pagamento: { metodo: number % 3 === 0 ? 'maquina_entrega' : 'pix', modalidade: number % 3 === 0 ? 'debito' : 'pix', status: number % 3 === 0 ? 'pendente_entrega' : 'aprovado_demo', ambiente: 'demonstracao', referencia: 'ficticio-' + number },
    status: 'confirmado', createdAt: Date.now(), updatedAt: Date.now(),
  }
}
export function makeCompanyDemo() {
  const stages = ['confirmado', 'preparando', 'preparando', 'pronto', 'saiu_entrega', 'entregue', 'entregue']
  const orders = stages.map((status, i) => {
    const order = makeDemoOrder(1047 - i)
    return { ...order, status, createdAt: Date.now() - (i * 7 + 3) * 60000, pagamento: { ...order.pagamento, status: status === 'entregue' && order.pagamento.metodo === 'maquina_entrega' ? 'recebido_demo' : order.pagamento.status } }
  })
  return {
    orders, settings: [{ id: 'calabresa', preco: produtos.find(item => item.id === 'calabresa').preco, disponivel: true, promocao: { titulo: 'Especial da casa', percentual: 15, inicio: Date.now() - 3600000, fim: Date.now() + 7 * 86400000, ativa: true } }], events: {},
    refunds: [{ id: orders[4].id, orderId: orders[4].id, userId: orders[4].userId, motivo: 'Preciso de ajuda: o pedido está demorando para chegar.', status: 'pendente', createdAt: Date.now() - 120000 }],
    reviews: orders.slice(5).map((order, i) => ({ id: order.id, orderId: order.id, userId: order.userId, nome: order.cliente.nome, notaComida: i ? 4 : 5, notaEntrega: i ? 3 : 5, comentario: i ? 'A pizza veio boa, mas a entrega demorou um pouco.' : 'Pizza quentinha e entrega caprichada. Vou pedir de novo!', createdAt: Date.now() - (i + 1) * 60000 })),
  }
}
