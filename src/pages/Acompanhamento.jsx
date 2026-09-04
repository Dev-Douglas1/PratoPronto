import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useUser } from '../context/UserContext.jsx'
import { getLastOrder } from '../services/storage.js'
import { formatarMoeda } from '../utils/moeda.js'

export default function Acompanhamento() {
  const navigate = useNavigate()
  const { usuario } = useUser()
  const [order, setOrder] = useState(null)
  const [status, setStatus] = useState('Carregando pedido...')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      if (!usuario?.uid) {
        if (active) setStatus('Entre na sua conta para consultar pedidos.')
        return
      }

      try {
        const latest = await getLastOrder(usuario.uid)
        if (!active) return
        setOrder(latest)
        setStatus(latest?.status || 'Nenhum pedido encontrado.')
      } catch (error) {
        if (active) setErro(error.message)
      }
    }

    load()
    return () => { active = false }
  }, [usuario])

  async function acompanhar() {
    if (!usuario?.uid) return
    try {
      setErro('')
      const latest = await getLastOrder(usuario.uid)
      setOrder(latest)
      setStatus(latest?.status || 'Nenhum pedido encontrado.')
    } catch (error) {
      setErro(error.message)
    }
  }

  return (
    <AppScreen>
      <TopBar titulo="Acompanhamento do pedido" perfil />
      <div className="page-heading">
        <span className="eyebrow">ACOMPANHE EM TEMPO REAL</span>
        <h1>Seu pedido está a caminho</h1>
      </div>
      {order ? (
        <div className="delivery-summary">
          <span className="delivery-summary__icon">✓</span>
          <div>
            <strong>Pedido #{order.id.slice(0, 8)}</strong>
            <span>Total: {formatarMoeda(order.total)}</span>
            <small>{order.entrega.endereco}, {order.entrega.numero} • {order.entrega.bairro}</small>
          </div>
        </div>
      ) : null}
      <div className="status-badge">{status}</div>
      {erro && <p className="form-error">{erro}</p>}
      <div className="order-progress" aria-label="Etapas do pedido">
        <div className="is-done"><i>✓</i><span><strong>Pedido confirmado</strong><small>Recebemos seu pedido</small></span></div>
        <div className="is-current"><i>2</i><span><strong>Preparando</strong><small>Sua pizza está no forno</small></span></div>
        <div><i>3</i><span><strong>Saiu para entrega</strong><small>O entregador está a caminho</small></span></div>
        <div><i>4</i><span><strong>Entregue</strong><small>Bom apetite!</small></span></div>
      </div>
      <div className="map-card" aria-label="Mapa ilustrativo de entrega">
        <div className="road road-one" />
        <div className="road road-two" />
        <div className="route-line" />
        <div className="map-pin start-pin" />
        <div className="map-pin end-pin" />
        <span className="map-label restaurant-label">🍕 PratoPronto</span>
        <span className="map-label home-label">🏠 Você</span>
      </div>
      <button className="btn btn-primary wide-button" disabled={!order} onClick={acompanhar}>Atualizar acompanhamento</button>
      <button className="btn ghost-button wide-button" onClick={() => navigate('/pizzas')}>Fazer novo pedido</button>
    </AppScreen>
  )
}
