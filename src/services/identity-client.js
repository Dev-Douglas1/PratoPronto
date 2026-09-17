export class IdentityError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'IdentityError'
    this.code = `identity/${code}`
  }
}

const unavailable = 'A confirmação por e-mail ainda não está disponível. A empresa precisa ativar o envio de códigos. Tente novamente mais tarde.'

// The transport is supplied by the Firebase adapter. A status check never sends
// an email, receives a password or grants access to an account.
export function identityClient({ verifyApp, transport }) {
  async function call(name, data = {}) {
    await verifyApp()
    try { return await transport(name, data) }
    catch (error) {
      const code = String(error?.code || '').replace(/^functions\//, '')
      const messages = {
        unauthenticated: 'Não foi possível validar sua sessão. Entre novamente. Se o aviso continuar, a empresa precisa verificar o serviço de confirmação.',
        'not-found': unavailable,
        'failed-precondition': name === 'appConfirmEmailCode' ? 'O código expirou, foi substituído ou já foi usado. Solicite um novo código.' : unavailable,
        internal: 'Não conseguimos conectar ao serviço de confirmação. Confira sua conexão e tente novamente em instantes.',
        unavailable: 'Não foi possível enviar ou confirmar o código agora. Tente novamente em instantes. O acesso continua bloqueado até a confirmação.',
        'deadline-exceeded': 'A confirmação demorou mais que o esperado. Confira seu e-mail antes de solicitar outro código.',
        'resource-exhausted': 'O limite de tentativas foi atingido. Aguarde antes de solicitar ou digitar outro código.',
      }
      throw new IdentityError(code, messages[code] || 'Não foi possível confirmar o código. Confira os 4 números do e-mail mais recente e tente novamente.')
    }
  }
  async function checkEmailService() {
    const status = await call('appEmailServiceStatus')
    if (status?.ready !== true || status.codeLength !== 4) throw new IdentityError('service-not-ready', unavailable)
  }
  return { call, checkEmailService }
}

export function emailServiceUnavailable() {
  return new IdentityError('service-not-ready', unavailable)
}
