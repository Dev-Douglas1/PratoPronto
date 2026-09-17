import { useUser } from '../context/UserContext.jsx'

export default function SessionNotice() {
  const { avisoLogin } = useUser()
  return avisoLogin ? <p className="session-notice" role="status">{avisoLogin}</p> : null
}
