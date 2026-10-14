import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

export default function StoreFeed({ empresas, loading, erro, onRecarregar }) {
  const navigate = useNavigate()

  const maisPedidas = useMemo(() => {
    return [...empresas]
      .filter((e) => (e.total_pedidos || 0) > 0)
      .sort((a, b) => (b.total_pedidos || 0) - (a.total_pedidos || 0))
      .slice(0, 5)
  }, [empresas])

  const maisProximas = useMemo(() => {
    return [...empresas]
      .filter((e) => e.distancia_km !== null)
      .sort((a, b) => a.distancia_km - b.distancia_km)
      .slice(0, 5)
  }, [empresas])

  if (loading) {
    return <div className="feed-loading">A procurar empresas próximas...</div>
  }

  if (erro) {
    return (
      <div className="feed-error">
        <p>Não foi possível carregar as lojas: {erro}</p>
        <button className="btn btn-secondary" onClick={onRecarregar} type="button">Tentar novamente</button>
      </div>
    )
  }

  if (empresas.length === 0) {
    return <div className="feed-empty">Nenhuma empresa encontrada para esta região.</div>
  }

  return (
    <div className="store-feed">
      {maisPedidas.length > 0 && (
        <section className="feed-section">
          <div className="section-title">
            <h3>🔥 Mais pedidas</h3>
            <span>As preferidas da região</span>
          </div>
          <div className="horizontal-carousel">
            {maisPedidas.map((loja) => (
              <div
                key={`pedida-${loja.id}`}
                className="carousel-card"
                onClick={() => navigate(`/loja/${loja.id}`)}
              >
                <div className="card-badge">{loja.total_pedidos} pedidos</div>
                <img src={loja.logo_url || '/placeholder-store.png'} alt={loja.nome_fantasia} />
                <strong>{loja.nome_fantasia}</strong>
                <small>{loja.status_aberto ? '🟢 Aberta' : '🔴 Fechada'}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {maisProximas.length > 0 && (
        <section className="feed-section">
          <div className="section-title">
            <h3>📍 Pertinho de você</h3>
            <span>Chega mais rápido</span>
          </div>
          <div className="horizontal-carousel">
            {maisProximas.map((loja) => (
              <div
                key={`proxima-${loja.id}`}
                className="carousel-card"
                onClick={() => navigate(`/loja/${loja.id}`)}
              >
                <div className="card-badge">{loja.distancia_km} km</div>
                <img src={loja.logo_url || '/placeholder-store.png'} alt={loja.nome_fantasia} />
                <strong>{loja.nome_fantasia}</strong>
                <small>{loja.tempo_estimado_min || 30} min</small>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="feed-section">
        <div className="section-title">
          <h3>Todas as lojas</h3>
          <span>{empresas.length} opções disponíveis</span>
        </div>
        <div className="vertical-store-list">
          {empresas.map((loja) => (
            <div
              key={loja.id}
              className={`store-row-card ${!loja.status_aberto ? 'is-closed' : ''}`}
              onClick={() => navigate(`/loja/${loja.id}`)}
            >
              <img src={loja.logo_url || '/placeholder-store.png'} alt={loja.nome_fantasia} />
              <div className="store-row-info">
                <h4>{loja.nome_fantasia}</h4>
                <p className="store-row-meta">
                  {loja.distancia_km !== null && <span>{loja.distancia_km} km • </span>}
                  <span>{loja.tempo_estimado_min || 40} min • </span>
                  <span>R$ {Number(loja.taxa_entrega || 0).toFixed(2)}</span>
                </p>
                {loja.fora_do_raio && (
                  <span className="far-badge">Entrega mais distante</span>
                )}
              </div>
              <div className="store-row-status">
                <span className={`status-pill ${loja.status_aberto ? 'open' : 'closed'}`}>
                  {loja.status_aberto ? 'Aberta' : 'Fechada'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}