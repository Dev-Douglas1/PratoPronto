import { IdentityError } from '../services/identity-client.js'

export function traduzirErroFirebase(error) {
  if (error instanceof IdentityError) return error.message
  const codigo = String(error?.code || '')
  const mensagem = String(error?.message || '').toLowerCase()

  if (
    codigo.includes('api-key-not-valid') ||
    codigo.includes('invalid-api-key') ||
    mensagem.includes('api-key-not-valid')
  ) {
    return 'O Firebase não está configurado corretamente. Verifique a API Key no arquivo .env e reinicie o servidor.'
  }

  const mensagens = {
    'auth/configuration-not-found':
      'O login por e-mail ainda não foi ativado. No Firebase, abra Authentication → Método de login → E-mail/senha, ative e salve.',

    'auth/email-already-in-use':
      'Este e-mail já está cadastrado. Tente entrar na sua conta.',

    'auth/invalid-email':
      'Digite um endereço de e-mail válido.',

    'auth/weak-password':
      'A senha não atende aos requisitos. Use pelo menos 12 caracteres e confira a política de senhas da conta.',

    'auth/password-does-not-meet-requirements':
      'A senha não atende à política da conta. Use pelo menos 12 caracteres e confira as exigências de letras, números e símbolos.',

    'auth/missing-password':
      'Digite uma senha.',

    'auth/operation-not-allowed':
      'O login por e-mail ainda não foi ativado. No Firebase, abra Authentication → Método de login → E-mail/senha, ative e salve.',

    'auth/unauthorized-domain':
      'Este endereço do app não está autorizado no Firebase. Adicione o domínio atual em Authentication → Configurações → Domínios autorizados.',

    'auth/network-request-failed':
      'Não foi possível conectar ao Firebase. Verifique sua internet.',

    'auth/user-token-expired':
      'Sua sessão terminou. Entre novamente com seu e-mail e senha.',

    'auth/requires-recent-login':
      'Entre novamente com sua senha para continuar.',

    'auth/expired-action-code':
      'Este link de confirmação expirou. Solicite outro e-mail no aplicativo.',

    'auth/invalid-action-code':
      'Este link não é válido ou já foi usado. Volte ao aplicativo para conferir sua confirmação ou solicitar outro e-mail.',

    'auth/quota-exceeded':
      'O limite de envio de e-mails foi atingido. Aguarde e tente novamente mais tarde.',

    'auth/too-many-requests':
      'Muitas tentativas foram feitas. Aguarde alguns minutos e tente novamente. Confira também a caixa de entrada e o spam.',

    'auth/invalid-credential':
      'E-mail ou senha incorretos.',

    'auth/user-not-found':
      'E-mail ou senha incorretos.',

    'auth/wrong-password':
      'E-mail ou senha incorretos.',

    'auth/user-disabled':
      'Esta conta foi desativada.',

    'permission-denied':
      'Você não tem permissão para realizar esta operação.',

    unavailable:
      'O serviço está temporariamente indisponível. Tente novamente.'
  }

  return (
    mensagens[codigo] ||
    'Não foi possível concluir a operação. Confira os dados e tente novamente.'
  )
}

export function criarErroFirebase(error) {
  if (error instanceof IdentityError) return error
  const erroTraduzido = new Error(traduzirErroFirebase(error))
  erroTraduzido.code = error?.code || ''
  erroTraduzido.cause = error
  return erroTraduzido
}
