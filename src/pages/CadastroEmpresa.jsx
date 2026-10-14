import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import { getSupabase } from '../lib/supabase.js'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'

export default function CadastroEmpresa() {
  const navigate = useNavigate()
  const { usuario, autenticado } = useUser()
  const { recarregarEmpresas } = useCompany()

  const [nomeFantasia, setNomeFantasia] = useState('')
  const [tempoEstimado, setTempoEstimado] = useState(30)
  const [taxaEntrega, setTaxaEntrega] = useState(5.00)
  const [raioKm, setRaioKm] = useState(8.0)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  if (!autenticado) {
    return (
      <AppScreen className="screen-content">
        <h2>Acesso Restrito</h2>
        <p>Precisa de iniciar sessão para registar uma empresa.</p>
        <button className="btn btn-primary" onClick={() => navigate('/login')} type="button">
          Fazer Login
        </button>
      </AppScreen>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nomeFantasia.trim()) {
      setErro('Insira o nome da empresa.')
      return
    }

    try {
      setLoading(true)
      setErro('')
      const supabase = getSupabase()

      const novaEmpresa = {
        nome_fantasia: nomeFantasia.trim(),
        tempo_estimado_min: Number(tempoEstimado),
        taxa_entrega: Number(taxaEntrega),
        raio_atendimento_km: Number(raioKm),
        dono_id: usuario.uid || usuario.id,
        status_aberto: true,
        ativo: true,
      }

      const { data, error } = await supabase
        .from('empresas')
        .insert([novaEmpresa])
        .select()
        .single()

      if (error) throw error

      await recarregarEmpresas()
      navigate('/empresa/pedidos')
    } catch (err) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppScreen className="screen-content">
      <h2>Cadastrar Minha Empresa</h2>
      <p>Preencha os dados básicos do seu estabelecimento para começar a receber pedidos.</p>

      {erro && <p className="form-error">{erro}</p>}

      <form onSubmit={handleSubmit} className="form-grid">
        <label htmlFor="nomeFantasia">Nome do Estabelecimento *</label>
        <input
          id="nomeFantasia"
          type="text"
          required
          placeholder="Ex: Pizzaria Bella Italia"
          value={nomeFantasia}
          onChange={(e) => setNomeFantasia(e.target.value)}
        />

        <div className="form-row">
          <div>
            <label htmlFor="tempoEstimado">Tempo Estimado (min)</label>
            <input
              id="tempoEstimado"
              type="number"
              value={tempoEstimado}
              onChange={(e) => setTempoEstimado(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="taxaEntrega">Taxa de Entrega (R$)</label>
            <input
              id="taxaEntrega"
              type="number"
              step="0.50"
              value={taxaEntrega}
              onChange={(e) => setTaxaEntrega(e.target.value)}
            />
          </div>
        </div>

        <label htmlFor="raioKm">Raio de Atendimento (km)</label>
        <input
          id="raioKm"
          type="number"
          step="0.5"
          value={raioKm}
          onChange={(e) => setRaioKm(e.target.value)}
        />

        <div className="form-actions">
          <button
            type="button"
            className="btn ghost-button"
            onClick={() => navigate('/')}
          >
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'A criar...' : 'Criar Empresa'}
          </button>
        </div>
      </form>
    </AppScreen>
  )
}