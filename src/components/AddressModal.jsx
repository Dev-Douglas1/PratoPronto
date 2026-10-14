import { useEffect, useState } from 'react'
import { getSupabase } from '../lib/supabase.js'

export default function AddressModal({ isOpen, onClose, onSelectAddress, usuarioId }) {
  const [enderecos, setEnderecos] = useState([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [modoCadastro, setModoCadastro] = useState(false)

  const [rotulo, setRotulo] = useState('Casa')
  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [buscandoCep, setBuscandoCep] = useState(false)

  async function carregarEnderecos() {
    if (!usuarioId) return
    try {
      setLoading(true)
      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('enderecos_usuario')
        .select('*')
        .eq('user_id', usuarioId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setEnderecos(data || [])
    } catch (err) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      carregarEnderecos()
    }
  }, [isOpen, usuarioId])

  async function buscarCep(val) {
    const cepLimpo = val.replace(/\D/g, '')
    setCep(val)

    if (cepLimpo.length === 8) {
      try {
        setBuscandoCep(true)
        setErro('')
        const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
        const data = await res.json()

        if (data.erro) {
          setErro('CEP não encontrado.')
          return
        }

        setLogradouro(data.logradouro || '')
        setBairro(data.bairro || '')
        setCidade(data.localidade || '')
        setUf(data.uf || '')
      } catch (err) {
        setErro('Erro ao pesquisar CEP.')
      } finally {
        setBuscandoCep(false)
      }
    }
  }

  async function salvarEndereco(e) {
    e.preventDefault()
    if (!logradouro || !numero || !bairro || !cidade) {
      setErro('Preencha os campos obrigatórios (Logradouro, Número, Bairro, Cidade).')
      return
    }

    try {
      setLoading(true)
      setErro('')

      const novoEndereco = {
        user_id: usuarioId || null,
        rotulo,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        latitude: -23.550520,
        longitude: -46.633308,
      }

      if (usuarioId) {
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from('enderecos_usuario')
          .insert([novoEndereco])
          .select()
          .single()

        if (error) throw error
        onSelectAddress(data)
      } else {
        const localData = { ...novoEndereco, id: `local_${Date.now()}` }
        onSelectAddress(localData)
      }

      limparFormulario()
      setModoCadastro(false)
      onClose()
    } catch (err) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  function limparFormulario() {
    setRotulo('Casa')
    setCep('')
    setLogradouro('')
    setNumero('')
    setComplemento('')
    setBairro('')
    setCidade('')
    setUf('')
    setErro('')
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{modoCadastro ? 'Cadastrar Novo Endereço' : 'Selecionar Endereço'}</h3>
          <button className="modal-close-btn" onClick={onClose} type="button">✕</button>
        </div>

        {erro && <p className="form-error">{erro}</p>}

        {!modoCadastro ? (
          <div className="address-list-container">
            {loading ? (
              <p>A carregar endereços...</p>
            ) : enderecos.length === 0 ? (
              <p className="empty-text">Nenhum endereço cadastrado ainda.</p>
            ) : (
              <div className="address-options">
                {enderecos.map((item) => (
                  <div
                    key={item.id}
                    className="address-item-card"
                    onClick={() => {
                      onSelectAddress(item)
                      onClose()
                    }}
                  >
                    <strong>{item.rotulo || 'Endereço'}</strong>
                    <p>{item.logradouro}, {item.numero} {item.complemento && `- ${item.complemento}`}</p>
                    <small>{item.bairro} - {item.cidade}/{item.uf}</small>
                  </div>
                ))}
              </div>
            )}

            <button
              className="btn btn-primary wide-button"
              type="button"
              onClick={() => {
                limparFormulario()
                setModoCadastro(true)
              }}
            >
              + Adicionar novo endereço
            </button>
          </div>
        ) : (
          <form onSubmit={salvarEndereco} className="address-form">
            <label>Tipo de local</label>
            <div className="label-selector">
              {['Casa', 'Trabalho', 'Outro'].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`chip-btn ${rotulo === item ? 'active' : ''}`}
                  onClick={() => setRotulo(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <label htmlFor="cep">CEP</label>
            <input
              id="cep"
              type="text"
              maxLength={9}
              placeholder="00000-000"
              value={cep}
              onChange={(e) => buscarCep(e.target.value)}
            />
            {buscandoCep && <small>A pesquisar endereço pelo CEP...</small>}

            <label htmlFor="logradouro">Rua / Logradouro *</label>
            <input
              id="logradouro"
              type="text"
              required
              value={logradouro}
              onChange={(e) => setLogradouro(e.target.value)}
            />

            <div className="form-row">
              <div>
                <label htmlFor="numero">Número *</label>
                <input
                  id="numero"
                  type="text"
                  required
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="complemento">Complemento</label>
                <input
                  id="complemento"
                  type="text"
                  placeholder="Apto, Bloco"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                />
              </div>
            </div>

            <label htmlFor="bairro">Bairro *</label>
            <input
              id="bairro"
              type="text"
              required
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
            />

            <div className="form-row">
              <div>
                <label htmlFor="cidade">Cidade *</label>
                <input
                  id="cidade"
                  type="text"
                  required
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="uf">UF</label>
                <input
                  id="uf"
                  type="text"
                  maxLength={2}
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn ghost-button"
                onClick={() => setModoCadastro(false)}
              >
                Voltar
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'A guardar...' : 'Guardar Endereço'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}