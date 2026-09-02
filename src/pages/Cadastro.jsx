import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'

export default function Cadastro() {
  const navigate = useNavigate()
  const [dados, setDados] = useState({ nome: '', email: '', senha: '' })
  const [erro, setErro] = useState('')

  function alterar(event) {
    setDados((atual) => ({ ...atual, [event.target.name]: event.target.value }))
  }

  function cadastrar(event) {
    event.preventDefault()
    if (!dados.nome.trim() || !dados.email.trim() || dados.senha.length < 6) {
      setErro('Preencha os campos. A senha deve ter pelo menos 6 caracteres.')
      return
    }
    navigate('/pizzas')
  }

  return (
    <AppScreen>
      <TopBar titulo="Cadastro" />
      <form className="light-card form-card" onSubmit={cadastrar}>
        <label>Nome</label>
        <input name="nome" value={dados.nome} onChange={alterar} placeholder="Seu nome" />
        <label>E-mail</label>
        <input name="email" value={dados.email} onChange={alterar} placeholder="voce@email.com" />
        <label>Senha</label>
        <input name="senha" type="password" value={dados.senha} onChange={alterar} placeholder="Mínimo 6 caracteres" />
        {erro && <p className="form-error dark-error">{erro}</p>}
        <button className="btn btn-primary" type="submit">Cadastrar</button>
        <Link className="text-link dark-link" to="/login">Já tenho uma conta</Link>
      </form>
    </AppScreen>
  )
}
