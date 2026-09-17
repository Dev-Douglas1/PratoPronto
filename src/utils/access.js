// These decisions only select screens. Firebase rules and server authorization
// independently require a verified email before allowing protected data.
export function accountDestination(user) {
  if (!user) return '/login'
  if (user.emailVerificado !== true) return '/verificar-email'
  return user.admin ? '/empresa/pedidos' : '/pizzas'
}
