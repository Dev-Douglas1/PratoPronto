import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useUser } from './UserContext.jsx'
import { loadMyCompanies } from '../services/marketplace.js'
import { COMPANY_STAFF_ROLES, DEFAULT_COMPANY_ID } from '../config/marketplace.js'

const CompanyContext = createContext(null)
const STORAGE_KEY = 'pratopronto:empresa-ativa'

export function CompanyProvider({ children }) {
  const { usuario } = useUser()
  const [companies, setCompanies] = useState([])
  const [activeCompanyId, setActiveCompanyId] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_COMPANY_ID } catch { return DEFAULT_COMPANY_ID }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    if (!usuario?.emailVerificado) { setCompanies([]); return [] }
    setLoading(true); setError('')
    try {
      const values = await loadMyCompanies()
      setCompanies(Array.isArray(values) ? values : [])
      setActiveCompanyId(current => {
        const valid = values?.some(item => item.companyId === current)
        const next = valid ? current : values?.[0]?.companyId || DEFAULT_COMPANY_ID
        try { localStorage.setItem(STORAGE_KEY, next) } catch {}
        return next
      })
      return values
    } catch (err) {
      setError(err.message || 'Não foi possível carregar suas empresas.')
      setCompanies([])
      return []
    } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [usuario?.uid, usuario?.emailVerificado])

  function selectCompany(companyId) {
    if (!companies.some(item => item.companyId === companyId)) return
    setActiveCompanyId(companyId)
    try { localStorage.setItem(STORAGE_KEY, companyId) } catch {}
  }

  const activeCompany = companies.find(item => item.companyId === activeCompanyId) || null
  const staffCompanies = companies.filter(item => COMPANY_STAFF_ROLES.includes(item.role))
  const pilotCompanies = companies.filter(item => item.role === 'pilot')

  const value = useMemo(() => ({
    companies, staffCompanies, pilotCompanies, activeCompanyId, activeCompany,
    loading, error, refresh, selectCompany,
  }), [companies, activeCompanyId, activeCompany, loading, error])

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export function useCompany() {
  const context = useContext(CompanyContext)
  if (!context) throw new Error('useCompany deve ser usado dentro de CompanyProvider')
  return context
}
