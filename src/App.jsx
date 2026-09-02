import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Cadastro from './pages/Cadastro.jsx'
import Pizzas from './pages/Pizzas.jsx'
import Bebidas from './pages/Bebidas.jsx'
import Pedido from './pages/Pedido.jsx'
import Pagamento from './pages/Pagamento.jsx'
import Acompanhamento from './pages/Acompanhamento.jsx'
import './App.css'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/pizzas" element={<Pizzas />} />
      <Route path="/bebidas" element={<Bebidas />} />
      <Route path="/pedido" element={<Pedido />} />
      <Route path="/pagamento" element={<Pagamento />} />
      <Route path="/acompanhamento" element={<Acompanhamento />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
