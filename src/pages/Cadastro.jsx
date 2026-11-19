import PasswordField from '../components/PasswordField.jsx'
import { validateCep, validateName, validatePassword, validatePhone, phoneInput, normalizeCep, normalizeName } from '../shared/input-policy.js'
import AddressFields from '../components/AddressFields.jsx'
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import { useUser } from '../context/UserContext.jsx'
import { traduzirErroSupabase } from '../utils/supabaseError.js'
import '../styles/auth.css'

const initialState = {
  nome: '',
  email: '',
  telefone: '',
  senha: '',
  confirmarSenha: '',
  endereco: '',
  numero: '',
  bairro: '',
  cep: '',
  cidade: '',
  uf: '',
  complemento: '',
  aceitarPolitica: false,
  aceitarTermos: false,
  aceitarMarketing: false,
}

export default function Cadastro() {
  const navigate = useNavigate()
  const { cadastrar, supabaseConfigured } = useUser()

  const [etapa, setEtapa] = useState(1)
  const [dados, setDados] = useState(initialState)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)

  // Busca o CEP com cancelamento para impedir que uma resposta antiga
  // sobrescreva o endereço digitado para um CEP mais recente.
  useEffect(() => {
    const cepNumerico = dados.cep.replace(/\D/g, '')
    if (cepNumerico.length !== 8) {
      setBuscandoCep(false)
      return undefined
    }

    const controller = new AbortController()
    let active = true
    setBuscandoCep(true)

    fetch(`https://viacep.com.br/ws/${cepNumerico}/json/`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Falha na consulta do CEP.')
        return response.json()
      })
      .then(data => {
        if (!active) return
        if (!data.erro) {
          setDados(prev => ({
            ...prev,
            endereco: data.logradouro || prev.endereco,
            bairro: data.bairro || prev.bairro,
            cidade: data.localidade || prev.cidade,
            uf: data.uf || prev.uf,
            complemento: data.complemento || prev.complemento,
          }))
          setErro('')
        } else {
          setErro('CEP não encontrado. Preencha o endereço manualmente.')
        }
      })
      .catch(error => {
        if (active && error.name !== 'AbortError') {
          setErro('Erro ao consultar o CEP. Verifique a conexão.')
        }
      })
      .finally(() => {
        if (active) setBuscandoCep(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [dados.cep])

  function alterar(event) {
    const { name, value, type, checked } = event.target
    if (name === 'telefone' && phoneInput(value).length > 11) {
      setErro('O telefone deve ter no máximo 11 números, incluindo o DDD.')
      return
    }

    setDados((atual) => ({
      ...atual,
      [name]: type === 'checkbox'
        ? checked
        : name === 'telefone'
          ? phoneInput(value)
          : name === 'cep'
            ? normalizeCep(value)
            : value,
    }))

    if (erro) setErro('')
  }

  function avancarParaEtapa2(e) {
    e.preventDefault()
    setErro('')

    try {
      validateName(dados.nome)
      const email = dados.email.trim().toLowerCase()
      if (!email || !email.includes('@') || !email.includes('.')) {
        setErro('Digite um e-mail válido.')
        return
      }
      validatePhone(dados.telefone)
      validatePassword(dados.senha)

      if (dados.senha !== dados.confirmarSenha) {
        setErro('As duas senhas precisam ser iguais.')
        return
      }

      setEtapa(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setErro(error.message)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (enviando) return
    setErro('')

    if (!supabaseConfigured) {
      setErro('O cadastro ainda não está disponível. A empresa precisa concluir a ativação do serviço.')
      return
    }

    try {
      validateCep(dados.cep)
    } catch (error) {
      setErro(error.message)
      return
    }

    const nome = normalizeName(dados.nome)
    const email = dados.email.trim().toLowerCase()
    const telefone = validatePhone(dados.telefone)
    const cep = validateCep(dados.cep)
    const cidade = dados.cidade.trim()
    const uf = dados.uf.trim().toUpperCase()
    const endereco = dados.endereco.trim()
    const numero = dados.numero.trim()
    const bairro = dados.bairro.trim()
    const complemento = dados.complemento.trim()

    if (!cidade) { setErro('Digite a cidade do endereço de entrega.'); return }
    if (!uf) { setErro('Selecione o estado do endereço de entrega.'); return }
    if (!endereco) { setErro('Digite a rua ou avenida do endereço de entrega.'); return }
    if (!numero) { setErro('Digite o número do endereço.'); return }
    if (!bairro) { setErro('Digite o bairro do endereço de entrega.'); return }
    if (!dados.aceitarPolitica) { setErro('É necessário aceitar a Política de Privacidade.'); return }
    if (!dados.aceitarTermos) { setErro('É necessário aceitar os Termos de Uso.'); return }

    const dadosCorrigidos = {
      ...dados,
      nome,
      email,
      telefone,
      cep,
      cidade,
      uf,
      endereco,
      numero,
      bairro,
      complemento,
    }

    try {
      setEnviando(true)
      await cadastrar(dadosCorrigidos)
      setDados(atual => ({ ...atual, senha: '', confirmarSenha: '' }))
      navigate('/verificar-email', { replace: true })
    } catch (error) {
      setErro(traduzirErroSupabase(error))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AppScreen className="auth-page">
      <div className="auth-header">
        <h1 className="auth-title">Crie sua conta</h1>
        <p className="auth-subtitle">
          {etapa === 1 
            ? 'Passo 1 de 2: Preencha seus dados pessoais' 
            : 'Passo 2 de 2: Informe o endereço para entregas'}
        </p>
      </div>

      {etapa === 1 && (
        <form onSubmit={avancarParaEtapa2} noValidate>
          <div className="form-card">
            <h3 className="form-section-title">Dados Pessoais e Acesso</h3>

            <div className="input-group">
              <label htmlFor="nome">Nome</label>
              <input
                id="nome"
                name="nome"
                type="text"
                value={dados.nome}
                onChange={alterar}
                placeholder="Seu nome completo"
                autoComplete="name"
                maxLength={80}
                minLength={2}
                disabled={enviando}
              />
              <small className="field-help">De 2 a 80 caracteres · {dados.nome.length}/80</small>
            </div>

            <div className="input-group">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                value={dados.email}
                onChange={alterar}
                placeholder="voce@email.com"
                autoComplete="email"
                maxLength={254}
                disabled={enviando}
              />
            </div>

            <div className="input-group">
              <label htmlFor="telefone">Telefone</label>
              <input
                id="telefone"
                name="telefone"
                type="tel"
                value={dados.telefone}
                onChange={alterar}
                placeholder="(41) 99999-9999"
                autoComplete="tel"
                maxLength={32}
                inputMode="tel"
                disabled={enviando}
              />
              <small className="field-help">DDD + telefone: 10 ou 11 números.</small>
            </div>

            <div className="input-group">
              <label htmlFor="senha">Senha</label>
              <PasswordField
                id="senha"
                name="senha"
                value={dados.senha}
                onChange={alterar}
                placeholder="De 6 a 12 caracteres"
                autoComplete="new-password"
                minLength={6}
                maxLength={12}
                disabled={enviando}
              />
              <small className="field-help">De 6 a 12 caracteres (com minúscula, maiúscula e número).</small>
            </div>

            <div className="input-group">
              <label htmlFor="confirmarSenha">Confirmar senha</label>
              <PasswordField
                id="confirmarSenha"
                name="confirmarSenha"
                value={dados.confirmarSenha}
                onChange={alterar}
                placeholder="Digite a senha novamente"
                autoComplete="new-password"
                minLength={6}
                maxLength={12}
                disabled={enviando}
              />
            </div>

            {erro && (
              <p className="form-error dark-error" role="alert">
                {erro}
              </p>
            )}

            <div className="btn-group">
              <button className="btn btn-primary" type="submit">
                Continuar
              </button>

              <button 
                className="btn btn-outline" 
                type="button" 
                onClick={() => navigate('/')}
              >
                Voltar
              </button>
            </div>

            <p className="auth-footer-link">
              Já tem uma conta?{' '}
              <Link className="text-link dark-link" to="/login">
                Entrar
              </Link>
            </p>
          </div>
        </form>
      )}

      {etapa === 2 && (
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-card">
            <h3 className="form-section-title">Endereço de Entrega</h3>

            <AddressFields data={dados} onChange={alterar} />

            {buscandoCep && (
              <small className="field-help warning-text">Buscando endereço pelo CEP...</small>
            )}

            <div className="input-group">
              <label htmlFor="endereco">Endereço</label>
              <input
                id="endereco"
                name="endereco"
                type="text"
                value={dados.endereco}
                onChange={alterar}
                placeholder="Rua, Avenida ou Logradouro"
                autoComplete="street-address"
                maxLength={180}
                disabled={enviando}
              />
            </div>

            <div className="form-row">
              <div className="input-group">
                <label htmlFor="numero">Número</label>
                <input
                  id="numero"
                  name="numero"
                  type="text"
                  value={dados.numero}
                  onChange={alterar}
                  placeholder="123"
                  autoComplete="address-line2"
                  maxLength={20}
                  disabled={enviando}
                />
              </div>

              <div className="input-group">
                <label htmlFor="bairro">Bairro</label>
                <input
                  id="bairro"
                  name="bairro"
                  type="text"
                  value={dados.bairro}
                  onChange={alterar}
                  placeholder="Bairro"
                  autoComplete="address-level3"
                  maxLength={100}
                  disabled={enviando}
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="complemento">Complemento</label>
              <input
                id="complemento"
                name="complemento"
                type="text"
                value={dados.complemento}
                onChange={alterar}
                placeholder="Apto, bloco, referência (opcional)"
                autoComplete="address-line3"
                maxLength={180}
                disabled={enviando}
              />
            </div>

            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="aceitarPolitica"
                  checked={dados.aceitarPolitica}
                  onChange={alterar}
                  disabled={enviando}
                />
                <span>
                  Li e concordo com a{' '}
                  <Link to="/politica-de-privacidade">Política de Privacidade</Link>
                </span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="aceitarTermos"
                  checked={dados.aceitarTermos}
                  onChange={alterar}
                  disabled={enviando}
                />
                <span>
                  Li e concordo com os{' '}
                  <Link to="/termos-de-uso">Termos de Uso</Link>
                </span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="aceitarMarketing"
                  checked={dados.aceitarMarketing}
                  onChange={alterar}
                  disabled={enviando}
                />
                <span>Quero receber promoções por e-mail (opcional)</span>
              </label>
            </div>

            {erro && (
              <p className="form-error dark-error" role="alert">
                ⚠️ {erro}
              </p>
            )}

            <div className="btn-group">
              <button className="btn btn-primary" type="submit" disabled={enviando}>
                {enviando ? 'Cadastrando...' : 'Cadastrar'}
              </button>

              <button 
                className="btn btn-outline" 
                type="button" 
                onClick={() => {
                  setErro('')
                  setEtapa(1)
                }}
              >
                Voltar
              </button>
            </div>

            <p className="auth-footer-link">
              Já tem uma conta?{' '}
              <Link className="text-link dark-link" to="/login">
                Entrar
              </Link>
            </p>
          </div>
        </form>
      )}
    </AppScreen>
  )
}