import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { useUser } from '../context/UserContext.jsx'
import { useCompany } from '../context/CompanyContext.jsx'
import {
  removePilotDocuments, savePilotProfile, submitPilotApplication, uploadPilotDocument,
} from '../services/marketplace.js'

const normalizePlate = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
const futureDate = value => {
  if (!value) return false
  const date = new Date(value + 'T12:00:00')
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now()
}

export default function PilotSignup() {
  const navigate = useNavigate()
  const { usuario, loading } = useUser()
  const { pilotProfile, refresh } = useCompany()
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [motorcycleType, setMotorcycleType] = useState('')
  const [vehicleColor, setVehicleColor] = useState('')
  const [cnhCategory, setCnhCategory] = useState('A')
  const [cnhExpiry, setCnhExpiry] = useState('')
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [motorcyclePhoto, setMotorcyclePhoto] = useState(null)
  const [cnhFront, setCnhFront] = useState(null)
  const [cnhBack, setCnhBack] = useState(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pilotProfile) return
    setVehiclePlate(pilotProfile.vehicle_plate || '')
    setMotorcycleType(pilotProfile.motorcycle_type || '')
    setVehicleColor(pilotProfile.vehicle_color || '')
    setCnhCategory(pilotProfile.cnh_category || 'A')
    setCnhExpiry(pilotProfile.cnh_expiry || '')
  }, [pilotProfile])

  const profileReady = useMemo(() => Boolean(
    usuario?.nome?.trim() &&
    usuario?.email?.trim() &&
    usuario?.telefone?.trim() &&
    usuario?.cidade?.trim()
  ), [usuario])

  const canSubmit = profileReady && vehiclePlate && motorcycleType.trim() && vehicleColor.trim()
    && cnhCategory && futureDate(cnhExpiry) && profilePhoto && motorcyclePhoto && cnhFront && cnhBack && consent

  if (loading) return <AppScreen><div className="light-card">Carregando...</div></AppScreen>
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.emailVerificado !== true) return <Navigate to="/verificar-email" replace />
  if (pilotProfile?.approval_status === 'approved' || pilotProfile?.approval_status === 'pending') {
    return <Navigate to="/piloto" replace />
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setError('')
    setProgress('')

    if (!profileReady) {
      setError('Complete e salve nome, telefone e cidade no perfil antes de se cadastrar como piloto.')
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
    if (!futureDate(cnhExpiry)) {
      setError('Informe uma CNH dentro da validade.')
      return
    }
    if (!profilePhoto || !motorcyclePhoto || !cnhFront || !cnhBack) {
      setError('Envie a foto do piloto, da moto e as duas imagens da CNH.')
      return
    }
    if (!consent) {
      setError('Confirme o envio da documentação para análise.')
      return
    }

    setBusy(true)
    const uploaded = []
    try {
      setProgress('Salvando os dados da moto…')
      await savePilotProfile({
        vehiclePlate,
        motorcycleType: motorcycleType.trim(),
        vehicleColor: vehicleColor.trim(),
        acceptingOffers: false,
      })

      const uploads = [
        ['profile', profilePhoto],
        ['motorcycle', motorcyclePhoto],
        ['cnh-front', cnhFront],
        ['cnh-back', cnhBack],
      ]
      const paths = {}
      for (const [kind, file] of uploads) {
        setProgress('Enviando documentação com segurança…')
        const path = await uploadPilotDocument(file, kind)
        uploaded.push(path)
        paths[kind] = path
      }

      setProgress('Enviando cadastro para análise…')
      await submitPilotApplication({
        cnhCategory,
        cnhExpiry,
        profilePhotoPath: paths.profile,
        motorcyclePhotoPath: paths.motorcycle,
        cnhFrontPath: paths['cnh-front'],
        cnhBackPath: paths['cnh-back'],
      })

      await refresh()
      navigate('/piloto', { replace: true })
    } catch (err) {
      if (uploaded.length) {
        try { await removePilotDocuments(uploaded) } catch {}
      }
      setError(err.message || 'Não foi possível concluir seu cadastro de piloto.')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return <AppScreen className="screen-with-nav">
    <TopBar titulo="Piloto Parceiro" />
    <div className="page-heading">
      <span className="eyebrow">SE TORNE UM PILOTO DAS ENTREGAS</span>
      <h1>Cadastro para análise</h1>
      <p>O PratoPronto usa seus dados do perfil e solicita os dados da moto e a documentação necessária antes de liberar ofertas de entrega.</p>
    </div>

    {pilotProfile?.approval_status === 'rejected' && <section className="light-card">
      <h2>Cadastro precisa de correção</h2>
      <p>{pilotProfile.rejection_reason || 'Revise os dados e envie novamente para análise.'}</p>
    </section>}

    <section className="light-card">
      <h2>Dados vindos do seu perfil</h2>
      <p>
        <strong>{usuario.nome || 'Nome não informado'}</strong><br />
        {usuario.email}<br />
        {usuario.telefone || 'Telefone não informado'}<br />
        {usuario.cidade || 'Cidade não informada'}{usuario.uf ? '/' + usuario.uf : ''}
      </p>
      {!profileReady && <p className="form-error" role="alert">Complete nome, telefone e cidade no seu perfil antes de continuar.</p>}
      {!profileReady && <button className="btn btn-secondary" type="button" onClick={() => navigate('/perfil')}>Completar meu perfil</button>}
    </section>

    <form className="light-card form-card pilot-signup-form" onSubmit={submit}>
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

      <h2>CNH e verificação</h2>
      <div className="payment-grid">
        <div>
          <label htmlFor="pilot-cnh-category">Categoria da CNH</label>
          <select id="pilot-cnh-category" value={cnhCategory} onChange={event => setCnhCategory(event.target.value)}>
            <option value="A">A</option>
            <option value="AB">AB</option>
          </select>
        </div>
        <div>
          <label htmlFor="pilot-cnh-expiry">Validade da CNH</label>
          <input id="pilot-cnh-expiry" required type="date" value={cnhExpiry} onChange={event => setCnhExpiry(event.target.value)} />
        </div>
      </div>

      <label htmlFor="pilot-profile-photo">Foto atual do piloto</label>
      <input id="pilot-profile-photo" required type="file" accept="image/jpeg,image/png,image/webp"
        onChange={event => setProfilePhoto(event.target.files?.[0] || null)} />
      <small>Foto clara do rosto. JPG, PNG ou WEBP, até 5 MB.</small>

      <label htmlFor="pilot-motorcycle-photo">Foto da moto</label>
      <input id="pilot-motorcycle-photo" required type="file" accept="image/jpeg,image/png,image/webp"
        onChange={event => setMotorcyclePhoto(event.target.files?.[0] || null)} />
      <small>A moto e a placa devem estar legíveis na imagem.</small>

      <label htmlFor="pilot-cnh-front">CNH — frente</label>
      <input id="pilot-cnh-front" required type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={event => setCnhFront(event.target.files?.[0] || null)} />

      <label htmlFor="pilot-cnh-back">CNH — verso</label>
      <input id="pilot-cnh-back" required type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={event => setCnhBack(event.target.files?.[0] || null)} />

      <label className="checkbox-line">
        <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
        Confirmo que os dados são meus e autorizo o uso destes arquivos exclusivamente para verificar meu cadastro como Piloto Parceiro.
      </label>
      <p className="muted">Os documentos ficam em armazenamento privado e não são exibidos às empresas. Consulte a <Link to="/politica-de-privacidade">Política de Privacidade</Link>.</p>

      {progress && <p className="success-note" role="status">{progress}</p>}
      {error && <p className="form-error dark-error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !canSubmit}>
        {busy ? 'Enviando para análise…' : pilotProfile?.approval_status === 'rejected' ? 'Reenviar para análise' : 'Enviar cadastro para análise'}
      </button>
      <button className="btn ghost-button" type="button" onClick={() => navigate('/perfil')}>Voltar ao perfil</button>
    </form>
    <BottomNav />
  </AppScreen>
}
