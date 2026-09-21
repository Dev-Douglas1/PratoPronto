import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'
import { savePilotProfile } from '../services/marketplace.js'

const normalizePlate = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)

export default function PilotSignup() {
  const navigate = useNavigate()
  const { usuario, loading } = useUser()
  const { pilotProfile, refresh } = useCompany()
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [motorcycleType, setMotorcycleType] = useState('')
  const [vehicleColor, setVehicleColor] = useState('')
  const [acceptingOffers, setAcceptingOffers] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const profileReady = useMemo(() => Boolean(
    usuario?.nome?.trim() &&
    usuario?.telefone?.trim() &&
    usuario?.cidade?.trim()
  ), [usuario])

  if (loading) return <AppScreen><div className="light-card">Carregando...</div></AppScreen>
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.emailVerificado !== true) return <Navigate to="/verificar-email" replace />
  if (pilotProfile) return <Navigate to="/piloto" replace />

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (!profileReady) {
      setError('Complete e salve seu nome, telefone e cidade no perfil antes de se cadastrar como piloto.')
      return
    }
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(vehiclePlate)) {
      setError('Informe uma placa válida, como ABC1D23.')
      return
    }
    if (motorcycleType.trim().length < 2) {
      setError('Informe o tipo ou modelo da moto.')
      return
    }
    if (vehicleColor.trim().length < 2) {
      setError('Informe a cor da moto.')
      return
    }

    setBusy(true)
    try {
      await savePilotProfile({ vehiclePlate, motorcycleType: motorcycleType.trim(), vehicleColor: vehicleColor.trim(), acceptingOffers })
      await refresh()
      navigate('/piloto', { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível concluir seu cadastro de piloto.')
    } finally {
      setBusy(false)
    }
  }

  return <AppScreen className="screen-with-nav">
    <TopBar titulo="Piloto Parceiro" />
    <div className="page-heading">
      <span className="eyebrow">SE TORNE UM PILOTO DAS ENTREGAS</span>
      <h1>Cadastre sua moto</h1>
      <p>Seus dados pessoais vêm do seu perfil PratoPronto. Aqui você informa somente os dados necessários para realizar entregas.</p>
    </div>

    <section className="light-card">
      <h2>Dados do seu perfil</h2>
      <p><strong>{usuario.nome || 'Nome não informado'}</strong><br />{usuario.email}<br />{usuario.telefone || 'Telefone não informado'}<br />{usuario.cidade || 'Cidade não informada'}{usuario.uf ? '/' + usuario.uf : ''}</p>
      {!profileReady && <p className="form-error" role="alert">Complete nome, telefone e cidade no seu perfil antes de continuar.</p>}
      {!profileReady && <button className="btn btn-secondary" type="button" onClick={() => navigate('/perfil')}>Completar meu perfil</button>}
    </section>

    <form className="light-card form-card" onSubmit={submit}>
      <h2>Dados da moto</h2>
      <label htmlFor="pilot-plate">Placa da moto</label>
      <input id="pilot-plate" required inputMode="text" autoCapitalize="characters" maxLength={7} placeholder="ABC1D23"
        value={vehiclePlate} onChange={event => setVehiclePlate(normalizePlate(event.target.value))} />

      <label htmlFor="pilot-type">Tipo ou modelo da moto</label>
      <input id="pilot-type" required minLength={2} maxLength={60} placeholder="Ex.: CG 160, Factor 150, scooter"
        value={motorcycleType} onChange={event => setMotorcycleType(event.target.value)} />

      <label htmlFor="pilot-color">Cor da moto</label>
      <input id="pilot-color" required minLength={2} maxLength={40} placeholder="Ex.: preta"
        value={vehicleColor} onChange={event => setVehicleColor(event.target.value)} />

      <label className="checkbox-line">
        <input type="checkbox" checked={acceptingOffers} onChange={event => setAcceptingOffers(event.target.checked)} />
        Quero começar disponível para receber ofertas de entrega
      </label>

      {error && <p className="form-error dark-error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !profileReady}>
        {busy ? 'Cadastrando...' : 'Cadastrar como Piloto Parceiro'}
      </button>
      <button className="btn ghost-button" type="button" onClick={() => navigate('/perfil')}>Voltar ao perfil</button>
    </form>
    <BottomNav />
  </AppScreen>
}
