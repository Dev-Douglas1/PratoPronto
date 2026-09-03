function toDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function pizzaImage(nome, destaque, toppings = []) {
  const toppingDots = toppings
    .map((item, index) => {
      const positions = [
        [88, 70], [140, 82], [106, 112], [76, 130], [142, 136], [114, 154], [64, 96], [160, 110],
      ]
      const [x, y] = positions[index] ?? [90 + index * 8, 90 + index * 5]
      return `<circle cx="${x}" cy="${y}" r="9" fill="${item}" opacity="0.95" />`
    })
    .join('')

  return toDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 170">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#2b1508"/>
          <stop offset="100%" stop-color="#120b06"/>
        </linearGradient>
      </defs>
      <rect width="240" height="170" rx="18" fill="url(#bg)"/>
      <circle cx="120" cy="100" r="64" fill="#f4c16e"/>
      <circle cx="120" cy="100" r="54" fill="#d9472b"/>
      <circle cx="120" cy="100" r="49" fill="#f1df88" opacity="0.9"/>
      ${toppingDots}
      <rect x="14" y="14" rx="10" ry="10" width="212" height="30" fill="#fff22f" opacity="0.96"/>
      <text x="120" y="34" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#111">${nome}</text>
      <text x="120" y="156" text-anchor="middle" font-family="Arial" font-size="11" font-weight="700" fill="#ffffff">${destaque}</text>
    </svg>
  `)
}

function drinkImage(nome, detalhe, cor, destaque, tipo = 'bottle') {
  const body = tipo === 'can'
    ? `<rect x="88" y="36" width="64" height="95" rx="16" fill="${cor}" />
       <rect x="94" y="31" width="52" height="12" rx="6" fill="#d9d9d9" />
       <rect x="96" y="128" width="48" height="6" rx="3" fill="#d9d9d9" />`
    : `<rect x="95" y="28" width="50" height="18" rx="8" fill="#d9d9d9" />
       <rect x="102" y="42" width="36" height="88" rx="16" fill="${cor}" />
       <rect x="98" y="125" width="44" height="12" rx="6" fill="${cor}" opacity="0.95" />`

  return toDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 170">
      <rect width="240" height="170" rx="18" fill="#1b1b1b"/>
      <rect x="14" y="14" rx="10" ry="10" width="212" height="30" fill="#fff22f" opacity="0.96"/>
      <text x="120" y="34" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#111">${nome}</text>
      ${body}
      <rect x="86" y="72" width="68" height="22" rx="10" fill="#ffffff" opacity="0.92" />
      <text x="120" y="87" text-anchor="middle" font-family="Arial" font-size="12" font-weight="700" fill="#111">${detalhe}</text>
      <text x="120" y="154" text-anchor="middle" font-family="Arial" font-size="11" font-weight="700" fill="#ffffff">${destaque}</text>
    </svg>
  `)
}

export const pizzas = [
  {
    id: 'calabresa',
    nome: 'Calabresa',
    descricao: 'Grande • molho da casa • queijo • calabresa',
    preco: 58.9,
    imagem: pizzaImage('Calabresa', 'fatias de calabresa', ['#c0392b', '#c0392b', '#c0392b', '#8bc34a', '#c0392b', '#c0392b']),
  },
  {
    id: 'quatro-queijos',
    nome: '4 Queijos',
    descricao: 'Grande • mussarela • provolone • parmesão • catupiry',
    preco: 62.9,
    imagem: pizzaImage('4 Queijos', 'mistura cremosa de queijos', ['#f7e27f', '#fff0a8', '#f9f1cb', '#ffeb85', '#fff2c5', '#f9d24c']),
  },
  {
    id: 'estrogonofe',
    nome: 'Estrogonofe',
    descricao: 'Grande • molho especial • frango • batata palha',
    preco: 59.9,
    imagem: pizzaImage('Estrogonofe', 'frango e batata palha', ['#d8b36a', '#e6cf7a', '#d8b36a', '#f4e37e', '#e6cf7a', '#d8b36a']),
  },
  {
    id: 'frango-catupiry',
    nome: 'Frango com Catupiry',
    descricao: 'Grande • frango desfiado • catupiry',
    preco: 59.9,
    imagem: pizzaImage('Frango c/ Catupiry', 'frango desfiado e creme', ['#ddc38b', '#fefefe', '#ddc38b', '#fefefe', '#ddc38b', '#fefefe']),
  },
  {
    id: 'mussarela',
    nome: 'Mussarela',
    descricao: 'Grande • molho da casa • mussarela • orégano',
    preco: 54.9,
    imagem: pizzaImage('Mussarela', 'queijo e orégano', ['#fff4b8', '#fff4b8', '#7cb342', '#fff4b8', '#7cb342']),
  },
  {
    id: 'lombo-canadense',
    nome: 'Lombo Canadense',
    descricao: 'Grande • lombo • cebola • mussarela',
    preco: 61.9,
    imagem: pizzaImage('Lombo Canadense', 'lombo e cebola', ['#b86d4b', '#e6e1da', '#b86d4b', '#e6e1da', '#b86d4b', '#e6e1da']),
  },
]

export const bebidas = [
  {
    id: 'coca-cola',
    nome: 'Coca-Cola',
    descricao: '550 ml',
    preco: 7.99,
    imagem: drinkImage('Coca-Cola', '550 ml', '#8b0000', 'refrigerante de cola', 'bottle'),
  },
  {
    id: 'guarana',
    nome: 'Guaraná',
    descricao: '350 ml',
    preco: 6.99,
    imagem: drinkImage('Guaraná', '350 ml', '#2e8b57', 'sabor guaraná', 'can'),
  },
  {
    id: 'fanta',
    nome: 'Fanta',
    descricao: '550 ml',
    preco: 7.99,
    imagem: drinkImage('Fanta', '550 ml', '#ff7f24', 'refrigerante de laranja', 'bottle'),
  },
  {
    id: 'sprite',
    nome: 'Sprite',
    descricao: '550 ml',
    preco: 7.99,
    imagem: drinkImage('Sprite', '550 ml', '#29c45f', 'refrigerante de limão', 'bottle'),
  },
  {
    id: 'monster',
    nome: 'Monster',
    descricao: '473 ml',
    preco: 15.49,
    imagem: drinkImage('Monster', '473 ml', '#1f1f1f', 'energético', 'can'),
  },
  {
    id: 'red-bull',
    nome: 'Red Bull',
    descricao: '473 ml',
    preco: 15.49,
    imagem: drinkImage('Red Bull', '473 ml', '#315efb', 'energético', 'can'),
  },
]

export const produtos = [...pizzas, ...bebidas]
