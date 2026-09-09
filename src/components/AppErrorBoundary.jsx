import { Component } from 'react'

const shellStyle = {
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  padding: '24px',
  background: '#070707',
  color: '#f5f5f5',
  fontFamily: 'system-ui, sans-serif',
}

const cardStyle = {
  width: 'min(100%, 560px)',
  padding: '24px',
  border: '1px solid rgba(255, 242, 47, 0.35)',
  borderRadius: '20px',
  background: '#151515',
  boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
}

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[PratoPronto] Erro inesperado na interface.', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main style={shellStyle}>
        <section style={cardStyle} role="alert">
          <strong style={{ color: '#fff22f', fontSize: '14px' }}>PRATOPRONTO</strong>
          <h1 style={{ marginBottom: '8px' }}>Não foi possível abrir o aplicativo</h1>
          <p style={{ color: '#c9c9c9', lineHeight: 1.55 }}>
            Ocorreu um erro ao iniciar esta versão. Recarregue a página. Se o problema continuar,
            verifique a configuração do Firebase e a implantação do build de produção.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: '100%',
              minHeight: '46px',
              marginTop: '12px',
              border: 0,
              borderRadius: '12px',
              background: '#fff22f',
              color: '#111',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Recarregar
          </button>
        </section>
      </main>
    )
  }
}
