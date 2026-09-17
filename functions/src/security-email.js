import { DomainError } from './domain.js'

function configuredTransport(apiKey, from) {
  return typeof apiKey === 'string' && Boolean(apiKey.trim()) &&
    typeof from === 'string' && /^[^\r\n]+@[^\r\n]+\.[^\r\n]+$/.test(from)
}

// This checks server deployment/configuration, not inbox delivery. It does not
// send mail and does not expose a secret, sender, recipient or account status.
export function emailServiceStatus({ apiKey, from, secret }) {
  if (!configuredTransport(apiKey, from) || typeof secret !== 'string' || secret.length < 32) {
    throw new DomainError('failed-precondition', 'A confirmação por e-mail ainda não foi ativada pela empresa.')
  }
  return { ready: true, codeLength: 4 }
}

// Only server secrets may configure this transport. Never use VITE_ variables.
export function securityEmail({ apiKey, from, fetcher = fetch }) {
  return {
    async send({ to, subject, text, key }) {
      if (!configuredTransport(apiKey, from)) {
        throw new DomainError('failed-precondition', 'O envio de e-mails ainda não foi ativado pela empresa. Sua conta continua aguardando confirmação.')
      }
      try {
        const response = await fetcher('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify({ from, to: [to], subject, text }),
          signal: AbortSignal.timeout(12000),
        })
        if (!response.ok || !(await response.json()).id) throw new Error('delivery-not-accepted')
      } catch {
        // Provider responses can contain recipient addresses. Do not log them.
        throw new DomainError('unavailable', 'Não foi possível enviar o e-mail agora. Aguarde um minuto e tente novamente. Sua conta ainda não foi liberada.')
      }
    },
  }
}
