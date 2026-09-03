import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import ProductGrid from '../components/ProductGrid.jsx'
import BottomActions from '../components/BottomActions.jsx'
import { bebidas } from '../data/produtos.js'

export default function Bebidas() {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const filtradas = useMemo(
    () => bebidas.filter((bebida) => bebida.nome.toLowerCase().includes(busca.toLowerCase())),
    [busca],
  )

  return (
    <AppScreen>
      <TopBar titulo="Cardápio" carrinho />
      <input className="search-input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 buscar bebida..." />
      <div className="section-chip">BEBIDAS</div>
      <ProductGrid produtos={filtradas} />
      <BottomActions>
        <button className="btn btn-secondary" onClick={() => navigate('/pizzas')}>Ver pizzas</button>
        <button className="btn btn-primary" onClick={() => navigate('/pedido')}>Ver pedido</button>
      </BottomActions>
      <button className="btn ghost-button wide-button" onClick={() => navigate('/perfil')}>Meu perfil</button>
    </AppScreen>
  )
}
