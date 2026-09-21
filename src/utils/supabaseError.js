export function traduzirErroSupabase(error) {
  const raw = String(error?.message || error || '').trim()
  const code = String(error?.code || '').toLowerCase()
  const text = raw.toLowerCase()

  if (text.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (text.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (text.includes('user already registered')) return 'Já existe uma conta com esse e-mail.'
  if (text.includes('password should be')) return 'A senha não atende aos requisitos de segurança.'
  if (text.includes('rate limit') || code === 'over_request_rate_limit') return 'Muitas tentativas. Aguarde um pouco e tente novamente.'
  if (text.includes('network') || text.includes('fetch')) return 'Falha de conexão. Verifique sua internet e tente novamente.'
  if (text.includes('row-level security') || code === '42501') return 'Sua conta não tem permissão para esta ação.'
  if (text.includes('jwt') || text.includes('session')) return 'Sua sessão expirou. Entre novamente.'
  return raw || 'Não foi possível concluir a operação.'
}

export function criarErroSupabase(error) {
  const result = new Error(traduzirErroSupabase(error))
  result.code = error?.code || ''
  result.details = error?.details
  return result
}
