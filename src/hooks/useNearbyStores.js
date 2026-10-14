import { useEffect, useState } from 'react'
import { getSupabase } from '../lib/supabase.js'

export default function useNearbyStores(enderecoAtivo) {
  const [empresas, setEmpresas] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  async function buscarLojas() {
    try {
      setLoading(true)
      setErro('')
      const supabase = getSupabase()

      if (enderecoAtivo?.latitude && enderecoAtivo?.longitude) {
        const { data, error } = await supabase.rpc('buscar_empresas_ranqueadas', {
          user_lat: Number(enderecoAtivo.latitude),
          user_lng: Number(enderecoAtivo.longitude),
        })

        if (error) throw error
        setEmpresas(data || [])
      } else {
        const { data, error } = await supabase
          .from('empresas')
          .select('*')
          .eq('ativo', true)
          .order('status_aberto', { ascending: false })

        if (error) throw error
        setEmpresas(
          (data || []).map((e) => ({
            ...e,
            distancia_km: null,
            fora_do_raio: false,
            pontuacao_relevancia: e.status_aberto ? 100 : 0,
          }))
        )
      }
    } catch (err) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    buscarLojas()

    const supabase = getSupabase()
    const channel = supabase
      .channel('realtime-empresas-home')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'empresas' },
        (payload) => {
          setEmpresas((prev) =>
            prev.map((emp) =>
              emp.id === payload.new.id
                ? {
                    ...emp,
                    status_aberto: payload.new.status_aberto,
                    nome_fantasia: payload.new.nome_fantasia || emp.nome_fantasia,
                  }
                : emp
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enderecoAtivo?.id, enderecoAtivo?.latitude, enderecoAtivo?.longitude])

  return { empresas, loading, erro, recarregar: buscarLojas }
}