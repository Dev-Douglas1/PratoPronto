import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Cadastro from './pages/Cadastro.jsx'
import Pizzas from './pages/Pizzas.jsx'
import Bebidas from './pages/Bebidas.jsx'
import Pedido from './pages/Pedido.jsx'
import Pagamento from './pages/Pagamento.jsx'
import Acompanhamento from './pages/Acompanhamento.jsx'
import Perfil from './pages/Perfil.jsx'
import Empresa from './pages/Empresa.jsx'
import PoliticaPrivacidade from './pages/PoliticaPrivacidade.jsx'
import TermosUso from './pages/TermosUso.jsx'
import PrivacidadeDados from './pages/PrivacidadeDados.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AdminRoute from './components/AdminRoute.jsx'
import PwaInstallPrompt from './components/PwaInstallPrompt.jsx'
import { firebaseConfigured } from './firebase.js'
import './App.css'
import './upgrade.css'

function protectedPage(element) {
  return <ProtectedRoute>{element}</ProtectedRoute>
}

function adminPage(element) {
  return <AdminRoute>{element}</AdminRoute>
}

function ProductionConfigError() {
  return (
    <main className="app-shell">
      <div className="app-screen centered-screen">
        <section className="light-card login-card" style={{ width: 'min(100%, 520px)' }} role="alert">
          <span className="eyebrow">CONFIGURAÇÃO DE PRODUÇÃO</span>
          <h1>PratoPronto ainda não está conectado ao Firebase</h1>
          <p>
            Esta implantação foi aberta sem as variáveis `VITE_FIREBASE_*`. O build precisa ser gerado com a configuração do Firebase antes de ser publicado.
          </p>
          <p className="privacy-badge">
            Use o workflow “Publicar PratoPronto em produção” ou gere novamente a pasta `dist` com o arquivo `.env.production` configurado.
          </p>
        </section>
      </div>
    </main>
  )
}

export default function App() {
  if (import.meta.env.PROD && !firebaseConfigured) return <ProductionConfigError />

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/pizzas" element={protectedPage(<Pizzas />)} />
        <Route path="/bebidas" element={protectedPage(<Bebidas />)} />
        <Route path="/pedido" element={protectedPage(<Pedido />)} />
        <Route path="/pagamento" element={protectedPage(<Pagamento />)} />
        <Route path="/acompanhamento" element={protectedPage(<Acompanhamento />)} />
        <Route path="/perfil" element={protectedPage(<Perfil />)} />
        <Route path="/privacidade" element={protectedPage(<PrivacidadeDados />)} />
        <Route path="/empresa" element={adminPage(<Empresa />)} />
        <Route path="/admin" element={<Navigate to="/empresa" replace />} />
        <Route path="/politica-de-privacidade" element={<PoliticaPrivacidade />} />
        <Route path="/termos-de-uso" element={<TermosUso />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <PwaInstallPrompt />
    </>
  )
}
