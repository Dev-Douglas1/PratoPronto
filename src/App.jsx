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
import PoliticaPrivacidade from './pages/PoliticaPrivacidade.jsx'
import TermosUso from './pages/TermosUso.jsx'
import PrivacidadeDados from './pages/PrivacidadeDados.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import './App.css'

function protectedPage(element) {
  return <ProtectedRoute>{element}</ProtectedRoute>
}

export default function App() {
  return (
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
      <Route path="/politica-de-privacidade" element={<PoliticaPrivacidade />} />
      <Route path="/termos-de-uso" element={<TermosUso />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
