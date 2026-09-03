import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useUser } from '../context/UserContext.jsx'
import BottomNav from '../components/BottomNav.jsx'

export default function Perfil() {
  const navigate = useNavigate()
  const { usuario, loading, atualizar, sair } = useUser()
  const [form, setForm] = useState({})
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (usuario) setForm(usuario)
  }, [usuario])

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    setForm((atual) => ({ ...atual, [name]: type === 'checkbox' ? checked : value }))
  }

  async function salvar(event) {
    event.preventDefault()
    setErro('')
    setMensagem('')
    try {
      await atualizar(form)
      setMensagem('Dados atualizados com sucesso.')
    } catch (error) {
      setErro(error.message)
    }
  }

  if (loading) return <AppScreen><div className="light-card">Carregando...</div></AppScreen>
  if (!usuario) return <Navigate to="/login" replace />

  return (
    <AppScreen className="screen-with-nav">
      <TopBar titulo="Meu perfil" />
      <div className="profile-heading">
        <div className="profile-avatar">{(usuario.nome || usuario.email || 'U').charAt(0).toUpperCase()}</div>
        <div><span className="eyebrow">MINHA CONTA</span><h1>{usuario.nome || 'Cliente PratoPronto'}</h1><p>{usuario.email}</p></div>
      </div>
      <form className="light-card form-card" onSubmit={salvar}>
        <label>Nome</label>
        <input name="nome" value={form.nome ?? ''} onChange={handleChange} />
        <label>E-mail</label>
        <input value={form.email ?? ''} disabled />
        <label>Telefone</label>
        <input name="telefone" value={form.telefone ?? ''} onChange={handleChange} />
        <label>Endereço</label>
        <input name="endereco" value={form.endereco ?? ''} onChange={handleChange} />
        <div className="payment-grid">
          <div>
            <label>Número</label>
            <input name="numero" value={form.numero ?? ''} onChange={handleChange} />
          </div>
          <div>
            <label>Bairro</label>
            <input name="bairro" value={form.bairro ?? ''} onChange={handleChange} />
          </div>
        </div>
        <label>Complemento</label>
        <input name="complemento" value={form.complemento ?? ''} onChange={handleChange} />
        <label className="checkbox-line"><input type="checkbox" name="aceitarMarketing" checked={Boolean(form.aceitarMarketing)} onChange={handleChange} /> Receber promoções por e-mail</label>
        {mensagem && <p className="success-note">{mensagem}</p>}
        {erro && <p className="form-error dark-error">{erro}</p>}
        <button className="btn btn-primary" type="submit">Salvar dados</button>
        <button className="btn ghost-button" type="button" onClick={() => navigate('/privacidade')}>Privacidade e meus dados</button>
        <button className="btn btn-secondary" type="button" onClick={async () => { await sair(); navigate('/login') }}>Sair</button>
      </form>
      <BottomNav />
    </AppScreen>
  )
}
