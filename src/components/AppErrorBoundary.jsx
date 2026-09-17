import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() {
    // Do not log profiles, addresses, payment details or arbitrary error payloads.
    console.error('PratoPronto: não foi possível mostrar esta tela.')
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="startup-card" role="alert">
      <img src="/icons/app-icon.svg" width="64" height="64" alt="" />
      <h1>Não foi possível abrir esta tela</h1>
      <p>Tente carregar o aplicativo novamente. Se estava fazendo um pagamento, consulte seu pedido antes de pagar outra vez.</p>
      <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
      <a href="/">Voltar ao início</a>
    </main>
  }
}
