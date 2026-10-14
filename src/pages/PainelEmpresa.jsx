import { useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import { useCompany } from '../context/CompanyContext.jsx'

export default function PainelEmpresa() {
  const navigate = useNavigate()
  const { staffCompanies, empresaAtiva, loadingCompany } = useCompany()

  if (loadingCompany) {
    return <AppScreen className="screen-content"><p>A carregar dados da empresa...</p></AppScreen>
  }

  // Se o utilizador não tiver nenhuma empresa vinculada
  if (staffCompanies.length === 0) {
    return (
      <AppScreen className="screen-content text-center">
        <h2>Ainda não possui uma empresa</h2>
        <p>Cadastre a sua empresa no PratoPronto para começar a gerir o cardápio e receber pedidos.</p>
        <button
          className="btn btn-primary wide-button"
          onClick={() => navigate('/empresa/nova')}
          type="button"
        >
          + Cadastrar Minha Empresa
        </button>
      </AppScreen>
    )
  }

  return (
    <AppScreen className="screen-content">
      <header className="dashboard-header">
        <h2>Painel: {empresaAtiva?.nome_fantasia}</h2>
        <span className={`status-pill ${empresaAtiva?.status_aberto ? 'open' : 'closed'}`}>
          {empresaAtiva?.status_aberto ? 'Loja Aberta' : 'Loja Fechada'}
        </span>
      </header>

      {/* Conteúdo da gestão de pedidos e cardápio aqui */}
    </AppScreen>
  )
}