import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AdminRoute from './components/AdminRoute.jsx'
import PilotRoute from './components/PilotRoute.jsx'
import SessionNotice from './components/SessionNotice.jsx'
import './App.css'

const Home = lazy(() => import('./pages/Home.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const Cadastro = lazy(() => import('./pages/Cadastro.jsx'))
const RecuperarSenha = lazy(() => import('./pages/RecuperarSenha.jsx'))
const VerificarEmail = lazy(() => import('./pages/VerificarEmail.jsx'))
const Pizzas = lazy(() => import('./pages/Pizzas.jsx'))
const Bebidas = lazy(() => import('./pages/Bebidas.jsx'))
const Pedido = lazy(() => import('./pages/Pedido.jsx'))
const Pagamento = lazy(() => import('./pages/Pagamento.jsx'))
const Acompanhamento = lazy(() => import('./pages/Acompanhamento.jsx'))
const Perfil = lazy(() => import('./pages/Perfil.jsx'))
const PoliticaPrivacidade = lazy(() => import('./pages/PoliticaPrivacidade.jsx'))
const TermosUso = lazy(() => import('./pages/TermosUso.jsx'))
const PrivacidadeDados = lazy(() => import('./pages/PrivacidadeDados.jsx'))
const CompanyDashboard = lazy(() => import('./pages/CompanyDashboard.jsx'))
const CompanyOnboarding = lazy(() => import('./pages/CompanyOnboarding.jsx'))
const MarketplaceStore = lazy(() => import('./pages/MarketplaceStore.jsx'))
const PilotPartner = lazy(() => import('./pages/PilotPartner.jsx'))
const PilotSignup = lazy(() => import('./pages/PilotSignup.jsx'))

function protectedPage(element) {
  return <ProtectedRoute>{element}</ProtectedRoute>
}

export default function App() {
  return (
    <Suspense fallback={<div className="app-shell"><div className="app-screen"><div className="light-card">Carregando...</div></div></div>}>
      <SessionNotice />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/recuperar-senha" element={<RecuperarSenha />} />
        <Route path="/verificar-email" element={<ProtectedRoute allowUnverified><VerificarEmail /></ProtectedRoute>} />
        <Route path="/pizzas" element={protectedPage(<Pizzas />)} />
        <Route path="/bebidas" element={protectedPage(<Bebidas />)} />
        <Route path="/pedido" element={protectedPage(<Pedido />)} />
        <Route path="/pagamento" element={protectedPage(<Pagamento />)} />
        <Route path="/acompanhamento" element={protectedPage(<Acompanhamento />)} />
        <Route path="/perfil" element={protectedPage(<Perfil />)} />
        <Route path="/privacidade" element={protectedPage(<PrivacidadeDados />)} />
        <Route path="/loja/:companyId" element={<MarketplaceStore />} />
        <Route path="/empresa/nova" element={protectedPage(<CompanyOnboarding />)} />
        <Route path="/piloto/cadastro" element={protectedPage(<PilotSignup />)} />
        <Route path="/piloto" element={<PilotRoute><PilotPartner /></PilotRoute>} />
        <Route path="/admin" element={<Navigate to="/empresa/pedidos" replace />} />
        <Route path="/empresa/:aba?" element={<AdminRoute><CompanyDashboard /></AdminRoute>} />
        <Route path="/demo/empresa/:aba?" element={<CompanyDashboard demo />} />
        <Route path="/politica-de-privacidade" element={<PoliticaPrivacidade />} />
        <Route path="/termos-de-uso" element={<TermosUso />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
