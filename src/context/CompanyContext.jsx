import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { callServer } from '../services/server.js'
import { isPlatformAdmin, loadPilotProfile } from '../services/marketplace.js'
import { useUser } from './UserContext.jsx'

const CompanyContext = createContext(null)

export function CompanyProvider({ children }) {
  const { usuario, autenticado } = useUser()
  const userId = usuario?.uid || ''
  const [staffCompanies, setStaffCompanies] = useState([])
  const [activeCompanyId, setActiveCompanyId] = useState('')
  const [pilotProfile, setPilotProfile] = useState(null)
  const [platformAdmin, setPlatformAdmin] = useState(false)
  const [loadingCompany, setLoadingCompany] = useState(true)
  const [error, setError] = useState('')

  const carregarEmpresasDoUsuario = useCallback(async (isCurrent = () => true) => {
    if (!autenticado || !userId) {
      if (isCurrent()) {
        setStaffCompanies([])
        setActiveCompanyId('')
        setPilotProfile(null)
        setPlatformAdmin(false)
        setError('')
        setLoadingCompany(false)
      }
      return []
    }

    if (isCurrent()) {
      setLoadingCompany(true)
      setError('')
    }
    try {
      const [companies, pilot, admin] = await Promise.all([
        callServer('appMyCompanies'),
        loadPilotProfile().catch(() => null),
        isPlatformAdmin().catch(() => false),
      ])
      if (!isCurrent()) return []
      const rows = Array.isArray(companies) ? companies.filter(company =>
        company?.companyId && company?.restaurantId
      ) : []
      setStaffCompanies(rows)
      setPilotProfile(pilot)
      setPlatformAdmin(admin === true)
      setActiveCompanyId(current => rows.some(company => company.companyId === current)
        ? current
        : rows[0]?.companyId || '')
      return rows
    } catch (err) {
      if (!isCurrent()) return []
      setStaffCompanies([])
      setActiveCompanyId('')
      setPilotProfile(null)
      setPlatformAdmin(false)
      setError(err?.message || 'Não foi possível carregar as empresas vinculadas à sua conta.')
      return []
    } finally {
      if (isCurrent()) setLoadingCompany(false)
    }
  }, [autenticado, userId])

  useEffect(() => {
    let active = true
    carregarEmpresasDoUsuario(() => active)
    return () => { active = false }
  }, [carregarEmpresasDoUsuario])

  const selectCompany = useCallback(companyId => {
    if (staffCompanies.some(company => company.companyId === companyId)) setActiveCompanyId(companyId)
  }, [staffCompanies])

  const activeCompany = useMemo(
    () => staffCompanies.find(company => company.companyId === activeCompanyId) || null,
    [staffCompanies, activeCompanyId],
  )

  const value = useMemo(() => ({
    staffCompanies,
    activeCompanyId,
    activeCompany,
    selectCompany,
    pilotProfile,
    platformAdmin,
    loading: loadingCompany,
    loadingCompany,
    error,
    recarregarEmpresas: carregarEmpresasDoUsuario,
  }), [staffCompanies, activeCompanyId, activeCompany, selectCompany, pilotProfile, platformAdmin, loadingCompany, error, carregarEmpresasDoUsuario])

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export const useCompany = () => {
  const context = useContext(CompanyContext)
  if (!context) throw new Error('useCompany deve ser usado dentro de CompanyProvider')
  return context
}
