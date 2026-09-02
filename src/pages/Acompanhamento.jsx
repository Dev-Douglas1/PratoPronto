import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useCart } from '../context/CartContext.jsx'

export default function Acompanhamento() {
  const navigate = useNavigate()
  const { limpar } = useCart()
  const [status, setStatus] = useState('Pedido confirmado • preparando')

  function acompanhar() {
    setStatus('Saiu para entrega • a caminho 🚴')
  }

  function novoPedido() {
    limpar()
    navigate('/pizzas')
  }

  return (
    <AppScreen>
      <TopBar titulo="Acompanhamento do pedido" />
      <div className="status-badge">{status}</div>
      <div className="map-card" aria-label="Mapa ilustrativo de entrega">
        <div className="road road-one" />
        <div className="road road-two" />
        <div className="route-line" />
        <div className="map-pin start-pin" />
        <div className="map-pin end-pin" />
        <span className="map-label restaurant-label">🍕 PratoPronto</span>
        <span className="map-label home-label">🏠 Você</span>
      </div>
      <button className="btn btn-primary wide-button" onClick={acompanhar}>Acompanhar</button>
      <button className="btn ghost-button wide-button" onClick={novoPedido}>Fazer novo pedido</button>
    </AppScreen>
  )
}
