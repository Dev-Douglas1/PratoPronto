import { getFunctions, httpsCallable } from 'firebase/functions'
import { getToken } from 'firebase/app-check'
import app, { appCheck } from '../firebase.js'
import { identityClient, IdentityError, emailServiceUnavailable } from './identity-client.js'

const functions = app ? getFunctions(app, 'southamerica-east1') : null
const client = identityClient({
  async verifyApp() {
    if (!functions || !appCheck) throw emailServiceUnavailable()
    try { await getToken(appCheck) }
    catch { throw new IdentityError('app-check-failed', 'Não foi possível verificar a segurança desta conexão. Reabra o app e tente novamente. Se continuar, a empresa precisa revisar a configuração de segurança.') }
  },
  async transport(name, data) {
    return (await httpsCallable(functions, name, { timeout: name === 'appEmailServiceStatus' ? 15000 : 45000 })(data)).data
  },
})
export const callIdentity = client.call
