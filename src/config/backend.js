export function assertCurrentBackend(env = {}) {
  const url = String(env.VITE_SUPABASE_URL || '').trim()
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
  if (!url || !key) throw new Error('O Supabase precisa estar configurado para usar o PratoPronto.')
  let parsed
  try { parsed = new URL(url) } catch { throw new Error('VITE_SUPABASE_URL inválida.') }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) {
    throw new Error('VITE_SUPABASE_URL deve apontar para o projeto Supabase por HTTPS.')
  }
  if (/service_role|secret/i.test(key)) {
    throw new Error('Use somente a chave publishable do Supabase no frontend.')
  }
  return true
}
