import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useUser } from '../context/UserContext.jsx'
import { getOrdersForUser } from '../services/storage.js'

export default function PrivacidadeDados() {
  const navigate = useNavigate()
  const { usuario, excluirConta } = useUser()
  const [erro, setErro] = useState('')
  const [processando, setProcessando] = useState(false)
  const [senha, setSenha] = useState('')

  async function exportarDados() {
    if (!usuario) return
    try {
      setErro('')
      const pedidos = await getOrdersForUser(usuario.uid)
      const payload = {
        exportadoEm: new Date().toISOString(),
        perfil: usuario,
        pedidos,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'pratopronto-meus-dados.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setErro(error.message)
    }
  }

  async function handleDelete() {
    if (!usuario) return
    const confirmed = window.confirm('Excluir sua conta, perfil e histórico de pedidos? Esta ação não pode ser desfeita.')
    if (!confirmed) return

    try {
      setProcessando(true)
      setErro('')
      await excluirConta(senha)
      navigate('/cadastro')
    } catch (error) {
      setErro(error.message)
    } finally {
      setProcessando(false)
    }
  }

  return (
    <AppScreen>
      <TopBar titulo="Privacidade" />
      <div className="light-card legal-card">
        <div className="privacy-hero-icon">🔒</div>
        <h3>Controle dos seus dados</h3>
        <p>Você pode acessar uma cópia dos dados, corrigir seu perfil, revogar marketing e solicitar a exclusão da conta.</p>
        <ul>
          <li>Perfil: nome, e-mail, telefone e endereço de entrega.</li>
          <li>Pedidos: itens, valores, endereço usado e status.</li>
          <li>Consentimentos: versões da política/termos e preferência de marketing.</li>
          <li>Pagamento: cartão completo, CVV e senha <strong>não são armazenados</strong>.</li>
        </ul>
        {erro && <p className="form-error dark-error">{erro}</p>}
        {usuario ? (
          <>
            <button className="btn btn-primary wide-button" onClick={exportarDados}>Baixar meus dados</button>
            <button className="btn ghost-button wide-button" onClick={() => navigate('/perfil')}>Corrigir meus dados</button>
            <label>Senha para confirmar exclusão</label>
            <input type="password" value={senha} onChange={(event) => setSenha(event.target.value)} placeholder="Sua senha atual" autoComplete="current-password" />
            <button className="btn btn-secondary wide-button" disabled={processando || !senha} onClick={handleDelete}>
              {processando ? 'Excluindo...' : 'Excluir minha conta e meus dados'}
            </button>
          </>
        ) : (
          <button className="btn btn-primary wide-button" onClick={() => navigate('/login')}>Entrar</button>
        )}
      </div>
    </AppScreen>
  )
}
