// Estas decisões apenas escolhem telas. O Supabase Auth e as políticas RLS
// continuam exigindo uma identidade confirmada para dados protegidos.
export function profileComplete(user) {
  if (!user) return false
  return Boolean(
    user.nome?.trim() &&
    user.telefone?.trim() &&
    user.cep?.trim() &&
    user.cidade?.trim() &&
    user.uf?.trim() &&
    user.endereco?.trim() &&
    user.numero?.trim() &&
    user.bairro?.trim() &&
    user.privacyPolicyVersion &&
    user.termsVersion
  )
}

export function accountDestination(user) {
  if (!user) return '/login'
  if (user.emailVerificado !== true) return '/verificar-email'
  if (!profileComplete(user)) return '/perfil'
  return user.admin ? '/empresa/pedidos' : '/pizzas'
}
