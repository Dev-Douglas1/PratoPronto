import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import ProductGrid from '../components/ProductGrid.jsx'
import BottomActions from '../components/BottomActions.jsx'
import { pizzas } from '../data/produtos.js'

export default function Pizzas() {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const filtradas = useMemo(
    () => pizzas.filter((pizza) => pizza.nome.toLowerCase().includes(busca.toLowerCase())),
    [busca],
  )

  return (
    <AppScreen>
      <TopBar titulo="Cardápio" carrinho />
      <input className="search-input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 buscar pizza..." />
      <div className="section-chip">PIZZAS</div>
      <ProductGrid produtos={filtradas} />
      <BottomActions>
        <button className="btn btn-secondary" onClick={() => navigate('/bebidas')}>Ver bebidas</button>
        <button className="btn btn-primary" onClick={() => navigate('/pedido')}>Ver pedido</button>
      </BottomActions>
      <button className="btn ghost-button wide-button" onClick={() => navigate('/perfil')}>Meu perfil</button>
    </AppScreen>
  )
}
