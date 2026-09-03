export function traduzirErroFirebase(error) {
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
      'A senha é muito fraca. Use pelo menos 6 caracteres.',

    'auth/missing-password':
      'Digite uma senha.',

    'auth/operation-not-allowed':
      'O login por e-mail ainda não foi ativado. No Firebase, abra Authentication → Método de login → E-mail/senha, ative e salve.',

    'auth/unauthorized-domain':
      'Este endereço do Codespace não está autorizado no Firebase. Adicione o domínio atual em Authentication → Configurações → Domínios autorizados.',

    'auth/network-request-failed':
      'Não foi possível conectar ao Firebase. Verifique sua internet.',

    'auth/too-many-requests':
      'Muitas tentativas foram feitas. Aguarde alguns minutos e tente novamente.',

    'auth/invalid-credential':
      'E-mail ou senha incorretos.',

    'auth/user-not-found':
      'Não encontramos uma conta com esse e-mail.',

    'auth/wrong-password':
      'A senha informada está incorreta.',

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
  const erroTraduzido = new Error(traduzirErroFirebase(error))
  erroTraduzido.code = error?.code || ''
  erroTraduzido.cause = error
  return erroTraduzido
}
