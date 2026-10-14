import { createContext, useContext, useEffect, useState } from 'react'
import { getSupabase } from '../lib/supabase.js'
import { useUser } from './UserContext.jsx'

const CompanyContext = createContext({})

export function CompanyProvider({ children }) {
  const { usuario, autenticado } = useUser()
  const [staffCompanies, setStaffCompanies] = useState([])
  const [empresaAtiva, setEmpresaAtiva] = useState(null)
  const [loadingCompany, setLoadingCompany] = useState(true)

  async function carregarEmpresasDoUsuario() {
    if (!autenticado || !usuario) {
      setStaffCompanies([])
      setEmpresaAtiva(null)
      setLoadingCompany(false)
      return
    }

    try {
      setLoadingCompany(true)
      const supabase = getSupabase()

      // Busca empresas onde o utilizador é dono ou membro da equipa
      const { data, error } = await supabase
        .from('equipe_empresa')
        .select(`
          empresa_id,
          cargo,
          empresas (*)
        `)
        .eq('user_id', usuario.uid || usuario.id)

      if (error) throw error

      const listaEmpresas = (data || [])
        .map((item) => item.empresas)
        .filter((emp) => emp && emp.ativo !== false)

      setStaffCompanies(listaEmpresas)

      if (listaEmpresas.length > 0) {
        // Define a primeira empresa como ativa por padrão se nenhuma estiver selecionada
        setEmpresaAtiva((prev) => prev || listaEmpresas[0])
      } else {
        setEmpresaAtiva(null)
      }
    } catch (err) {
      console.error('Erro ao carregar empresas do utilizador:', err.message)
    } finally {
      setLoadingCompany(false)
    }
  }

  useEffect(() => {
    carregarEmpresasDoUsuario()
  }, [autenticado, usuario?.uid, usuario?.id])

  return (
    <CompanyContext.Provider
      value={{
        staffCompanies,
        empresaAtiva,
        setEmpresaAtiva,
        loadingCompany,
        recarregarEmpresas: carregarEmpresasDoUsuario,
      }}
    >
      {children}
    </CompanyContext.Provider>
  )
}

export const useCompany = () => useContext(CompanyContext)