import { useUser } from '../context/UserContext.jsx'

export function useAuth() {
  const auth = useUser()

  return {
    ...auth,
    user: auth.autenticado ? auth.usuario : null,
  }
}

export default useAuth