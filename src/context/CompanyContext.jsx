import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useUser } from './UserContext.jsx'
import { loadMyCompanies, loadPilotProfile } from '../services/marketplace.js'
import { COMPANY_STAFF_ROLES, DEFAULT_COMPANY_ID } from '../config/marketplace.js'

const CompanyContext = createContext(null)
const STORAGE_KEY = 'pratopronto:empresa-ativa'

export function CompanyProvider({ children }) {
  const { usuario } = useUser()
  const [companies, setCompanies] = useState([])
  const [pilotProfile, setPilotProfile] = useState(null)
  const [activeCompanyId, setActiveCompanyId] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_COMPANY_ID } catch { return DEFAULT_COMPANY_ID }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    if (!usuario?.emailVerificado) {
      setCompanies([]); setPilotProfile(null); return []
    }
    setLoading(true); setError('')
    try {
      const [values, pilot] = await Promise.all([loadMyCompanies(), loadPilotProfile()])
      const list = Array.isArray(values) ? values : []
      setCompanies(list)
      setPilotProfile(pilot)
      setActiveCompanyId(current => {
        const valid = list.some(item => item.companyId === current)
        const next = valid ? current : list[0]?.companyId || DEFAULT_COMPANY_ID
        try { localStorage.setItem(STORAGE_KEY, next) } catch {}
        return next
      })
      return list
    } catch (err) {
      setError(err.message || 'Não foi possível carregar suas empresas.')
      setCompanies([])
      return []
    } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [usuario?.uid, usuario?.emailVerificado])

  function selectCompany(companyId) {
    const next = String(companyId || '').trim()
    if (!next) return
    setActiveCompanyId(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
  }

  const activeCompany = companies.find(item => item.companyId === activeCompanyId) || null
  const staffCompanies = companies.filter(item => COMPANY_STAFF_ROLES.includes(item.role))

  const value = useMemo(() => ({
    companies, staffCompanies, pilotProfile, activeCompanyId, activeCompany,
    loading, error, refresh, selectCompany,
  }), [companies, pilotProfile, activeCompanyId, activeCompany, loading, error])

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export function useCompany() {
  const context = useContext(CompanyContext)
  if (!context) throw new Error('useCompany deve ser usado dentro de CompanyProvider')
  return context
}
