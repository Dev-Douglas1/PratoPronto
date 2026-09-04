export const pizzas = [
  {
    id: 'calabresa',
    nome: 'Calabresa',
    descricao: 'Grande • molho da casa • queijo • calabresa',
    preco: 58.9,
    imagem: '/images/produtos/pizza-calabresa.webp',
  },
  {
    id: 'quatro-queijos',
    nome: '4 Queijos',
    descricao: 'Grande • mussarela • provolone • parmesão • catupiry',
    preco: 62.9,
    imagem: '/images/produtos/pizza-quatro-queijos.webp',
  },
  {
    id: 'estrogonofe',
    nome: 'Estrogonofe',
    descricao: 'Grande • molho especial • frango • batata palha',
    preco: 59.9,
    imagem: '/images/produtos/pizza-estrogonofe.webp',
  },
  {
    id: 'frango-catupiry',
    nome: 'Frango com Catupiry',
    descricao: 'Grande • frango desfiado • catupiry',
    preco: 59.9,
    imagem: '/images/produtos/pizza-frango-catupiry.webp',
  },
  {
    id: 'mussarela',
    nome: 'Mussarela',
    descricao: 'Grande • molho da casa • mussarela • tomate • orégano',
    preco: 54.9,
    imagem: '/images/produtos/pizza-mussarela.webp',
  },
  {
    id: 'lombo-canadense',
    nome: 'Lombo Canadense',
    descricao: 'Grande • lombo • cebola • mussarela',
    preco: 61.9,
    imagem: '/images/produtos/pizza-lombo-canadense.webp',
  },
]

export const bebidas = [
  {
    id: 'coca-cola',
    nome: 'Coca-Cola',
    descricao: '550 ml',
    preco: 7.99,
    imagem: '/images/produtos/coca-cola.webp',
  },
  {
    id: 'guarana',
    nome: 'Guaraná',
    descricao: '350 ml',
    preco: 6.99,
    imagem: '/images/produtos/guarana.webp',
  },
  {
    id: 'fanta',
    nome: 'Fanta',
    descricao: '550 ml',
    preco: 7.99,
    imagem: '/images/produtos/fanta.webp',
  },
  {
    id: 'sprite',
    nome: 'Sprite',
    descricao: '550 ml',
    preco: 7.99,
    imagem: '/images/produtos/sprite.webp',
  },
  {
    id: 'monster',
    nome: 'Monster',
    descricao: '473 ml',
    preco: 15.49,
    imagem: '/images/produtos/monster.webp',
  },
  {
    id: 'red-bull',
    nome: 'Red Bull',
    descricao: '473 ml',
    preco: 15.49,
    imagem: '/images/produtos/red-bull.webp',
  },
]

export const produtos = [...pizzas, ...bebidas]
