import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { callServer } from '../services/server.js'
import { useUser } from './UserContext.jsx'

const CompanyContext = createContext(null)

export function CompanyProvider({ children }) {
  const { usuario, autenticado } = useUser()
  const userId = usuario?.uid || ''
  const [staffCompanies, setStaffCompanies] = useState([])
  const [activeCompanyId, setActiveCompanyId] = useState('')
  const [loadingCompany, setLoadingCompany] = useState(true)
  const [error, setError] = useState('')

  const carregarEmpresasDoUsuario = useCallback(async () => {
    if (!autenticado || !userId) {
      setStaffCompanies([])
      setActiveCompanyId('')
      setError('')
      setLoadingCompany(false)
      return []
    }

    setLoadingCompany(true)
    setError('')
    try {
      // A associação empresarial é consultada pela RPC canônica, nunca pelas
      // tabelas legadas empresas/equipe_empresa que não possuem políticas RLS.
      const companies = await callServer('appMyCompanies')
      const rows = Array.isArray(companies) ? companies.filter(company =>
        company?.companyId && company?.restaurantId
      ) : []
      setStaffCompanies(rows)
      setActiveCompanyId(current => rows.some(company => company.companyId === current)
        ? current
        : rows[0]?.companyId || '')
      return rows
    } catch (err) {
      setStaffCompanies([])
      setActiveCompanyId('')
      setError(err?.message || 'Não foi possível carregar as empresas vinculadas à sua conta.')
      return []
    } finally {
      setLoadingCompany(false)
    }
  }, [autenticado, userId])

  useEffect(() => {
    let active = true
    if (!autenticado || !userId) {
      setStaffCompanies([])
      setActiveCompanyId('')
      setError('')
      setLoadingCompany(false)
      return () => { active = false }
    }
    setLoadingCompany(true)
    setError('')
    callServer('appMyCompanies').then(companies => {
      if (!active) return
      const rows = Array.isArray(companies) ? companies.filter(company =>
        company?.companyId && company?.restaurantId
      ) : []
      setStaffCompanies(rows)
      setActiveCompanyId(current => rows.some(company => company.companyId === current)
        ? current
        : rows[0]?.companyId || '')
    }).catch(err => {
      if (!active) return
      setStaffCompanies([])
      setActiveCompanyId('')
      setError(err?.message || 'Não foi possível carregar as empresas vinculadas à sua conta.')
    }).finally(() => { if (active) setLoadingCompany(false) })
    return () => { active = false }
  }, [autenticado, userId])

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
    loading: loadingCompany,
    loadingCompany,
    error,
    recarregarEmpresas: carregarEmpresasDoUsuario,
  }), [staffCompanies, activeCompanyId, activeCompany, selectCompany, loadingCompany, error, carregarEmpresasDoUsuario])

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export const useCompany = () => {
  const context = useContext(CompanyContext)
  if (!context) throw new Error('useCompany deve ser usado dentro de CompanyProvider')
  return context
}
