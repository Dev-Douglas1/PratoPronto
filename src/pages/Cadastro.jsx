import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import { useUser } from '../context/UserContext.jsx'
import { traduzirErroFirebase } from '../utils/firebaseError'

const initialState = {
  nome: '',
  email: '',
  telefone: '',
  senha: '',
  endereco: '',
  numero: '',
  bairro: '',
  complemento: '',
  aceitarPolitica: false,
  aceitarTermos: false,
  aceitarMarketing: false,
}

export default function Cadastro() {
  const navigate = useNavigate()
  const { cadastrar, firebaseConfigured } = useUser()

  const [dados, setDados] = useState(initialState)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  function alterar(event) {
    const { name, value, type, checked } = event.target

    setDados((atual) => ({
      ...atual,
      [name]: type === 'checkbox' ? checked : value,
    }))

    // Apaga o erro quando o usuário começa a corrigir os dados
    if (erro) {
      setErro('')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErro('')

    if (!firebaseConfigured) {
      setErro(
        'O Firebase não está configurado. Verifique os dados no arquivo .env e reinicie o servidor.'
      )
      return
    }

    const nome = dados.nome.trim()
    const email = dados.email.trim().toLowerCase()
    const telefone = dados.telefone.trim()
    const endereco = dados.endereco.trim()
    const numero = dados.numero.trim()
    const bairro = dados.bairro.trim()
    const complemento = dados.complemento.trim()

    if (!nome) {
      setErro('Digite seu nome.')
      return
    }

    if (!email) {
      setErro('Digite seu e-mail.')
      return
    }

    if (!email.includes('@') || !email.includes('.')) {
      setErro('Digite um endereço de e-mail válido.')
      return
    }

    if (!telefone) {
      setErro('Digite seu telefone.')
      return
    }

    if (dados.senha.length < 8) {
      setErro('A senha deve ter pelo menos 8 caracteres.')
      return
    }

    if (!endereco) {
      setErro('Digite a rua ou avenida do endereço de entrega.')
      return
    }

    if (!numero) {
      setErro('Digite o número do endereço.')
      return
    }

    if (!bairro) {
      setErro('Digite o bairro do endereço de entrega.')
      return
    }

    if (!dados.aceitarPolitica) {
      setErro('É necessário aceitar a Política de Privacidade.')
      return
    }

    if (!dados.aceitarTermos) {
      setErro('É necessário aceitar os Termos de Uso.')
      return
    }

    const dadosCorrigidos = {
      ...dados,
      nome,
      email,
      telefone,
      endereco,
      numero,
      bairro,
      complemento,
    }

    try {
      setEnviando(true)

      await cadastrar(dadosCorrigidos)

      navigate('/pizzas')
    } catch (error) {
      console.error('Erro ao cadastrar usuário:', error)
      setErro(traduzirErroFirebase(error))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AppScreen>
      <TopBar titulo="Cadastro" />

      <form
        className="light-card form-card"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="privacy-badge">
          LGPD • Dados usados para criação da conta, entrega e histórico de
          pedidos. Marketing é opcional.
        </div>

        <label htmlFor="nome">Nome</label>
        <input
          id="nome"
          name="nome"
          type="text"
          value={dados.nome}
          onChange={alterar}
          placeholder="Seu nome"
          autoComplete="name"
          disabled={enviando}
        />

        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          value={dados.email}
          onChange={alterar}
          placeholder="voce@email.com"
          autoComplete="email"
          disabled={enviando}
        />

        <label htmlFor="telefone">Telefone</label>
        <input
          id="telefone"
          name="telefone"
          type="tel"
          value={dados.telefone}
          onChange={alterar}
          placeholder="(41) 99999-9999"
          autoComplete="tel"
          disabled={enviando}
        />

        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          name="senha"
          type="password"
          value={dados.senha}
          onChange={alterar}
          placeholder="Mínimo de 8 caracteres"
          autoComplete="new-password"
          minLength={8}
          disabled={enviando}
        />

        <label htmlFor="endereco">Endereço</label>
        <input
          id="endereco"
          name="endereco"
          type="text"
          value={dados.endereco}
          onChange={alterar}
          placeholder="Rua ou avenida"
          autoComplete="street-address"
          disabled={enviando}
        />

        <div className="payment-grid">
          <div>
            <label htmlFor="numero">Número</label>
            <input
              id="numero"
              name="numero"
              type="text"
              value={dados.numero}
              onChange={alterar}
              placeholder="123"
              autoComplete="address-line2"
              disabled={enviando}
            />
          </div>

          <div>
            <label htmlFor="bairro">Bairro</label>
            <input
              id="bairro"
              name="bairro"
              type="text"
              value={dados.bairro}
              onChange={alterar}
              placeholder="Bairro"
              autoComplete="address-level3"
              disabled={enviando}
            />
          </div>
        </div>

        <label htmlFor="complemento">Complemento</label>
        <input
          id="complemento"
          name="complemento"
          type="text"
          value={dados.complemento}
          onChange={alterar}
          placeholder="Apto, bloco, referência (opcional)"
          autoComplete="address-line3"
          disabled={enviando}
        />

        <label className="checkbox-line">
          <input
            type="checkbox"
            name="aceitarPolitica"
            checked={dados.aceitarPolitica}
            onChange={alterar}
            disabled={enviando}
          />

          <span>
            Li e concordo com a{' '}
            <Link to="/politica-de-privacidade">
              Política de Privacidade
            </Link>
          </span>
        </label>

        <label className="checkbox-line">
          <input
            type="checkbox"
            name="aceitarTermos"
            checked={dados.aceitarTermos}
            onChange={alterar}
            disabled={enviando}
          />

          <span>
            Li e concordo com os{' '}
            <Link to="/termos-de-uso">
              Termos de Uso
            </Link>
          </span>
        </label>

        <label className="checkbox-line">
          <input
            type="checkbox"
            name="aceitarMarketing"
            checked={dados.aceitarMarketing}
            onChange={alterar}
            disabled={enviando}
          />

          <span>
            Quero receber promoções por e-mail (opcional)
          </span>
        </label>

        {erro && (
          <p
            className="form-error dark-error"
            role="alert"
            aria-live="polite"
          >
            {erro}
          </p>
        )}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={enviando}
        >
          {enviando ? 'Cadastrando...' : 'Cadastrar'}
        </button>

        <Link className="text-link dark-link" to="/login">
          Já tenho uma conta
        </Link>
      </form>
    </AppScreen>
  )
}