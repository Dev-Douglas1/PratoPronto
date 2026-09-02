export const pizzas = [
  {
    id: 'calabresa',
    nome: 'Calabresa',
    descricao: 'Grande • molho da casa • queijo • calabresa',
    preco: 58.9,
    imagem: 'https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'quatro-queijos',
    nome: '4 Queijos',
    descricao: 'Grande • mussarela • provolone • parmesão • catupiry',
    preco: 62.9,
    imagem: 'https://images.unsplash.com/photo-1594007654729-407eedc4be65?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'estrogonofe',
    nome: 'Estrogonofe',
    descricao: 'Grande • molho especial • frango • batata palha',
    preco: 59.9,
    imagem: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'frango-catupiry',
    nome: 'Frango com Catupiry',
    descricao: 'Grande • frango desfiado • catupiry',
    preco: 59.9,
    imagem: 'https://images.unsplash.com/photo-1548365328-8b849e6f1a6a?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'mussarela',
    nome: 'Mussarela',
    descricao: 'Grande • molho da casa • mussarela • orégano',
    preco: 54.9,
    imagem: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'lombo-canadense',
    nome: 'Lombo Canadense',
    descricao: 'Grande • lombo • cebola • mussarela',
    preco: 61.9,
    imagem: 'https://images.unsplash.com/photo-1566843972142-a7fcb70de55a?auto=format&fit=crop&w=700&q=80',
  },
]

export const bebidas = [
  {
    id: 'coca-cola',
    nome: 'Coca-Cola',
    descricao: '550 ml',
    preco: 7.99,
    imagem: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'guarana',
    nome: 'Guaraná',
    descricao: '350 ml',
    preco: 6.99,
    imagem: 'https://images.unsplash.com/photo-1543253687-c931c8e01820?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'fanta',
    nome: 'Fanta',
    descricao: '550 ml',
    preco: 7.99,
    imagem: 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'sprite',
    nome: 'Sprite',
    descricao: '550 ml',
    preco: 7.99,
    imagem: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'monster',
    nome: 'Monster',
    descricao: '473 ml',
    preco: 15.49,
    imagem: 'https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'red-bull',
    nome: 'Red Bull',
    descricao: '473 ml',
    preco: 15.49,
    imagem: 'https://images.unsplash.com/photo-1613218222871-8d85f3bdf2f3?auto=format&fit=crop&w=700&q=80',
  },
]

export const produtos = [...pizzas, ...bebidas]
