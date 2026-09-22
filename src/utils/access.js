// Estas decisões apenas escolhem telas. O Supabase Auth e as políticas RLS
// continuam exigindo e-mail verificado para dados protegidos.
export function accountDestination(user) {
  if (!user) return '/login'
  if (user.emailVerificado !== true) return '/verificar-email'
  return user.admin ? '/empresa/pedidos' : '/pizzas'
}
