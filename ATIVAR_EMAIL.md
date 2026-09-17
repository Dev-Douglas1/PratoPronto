# Confirmação por link do Firebase

O cadastro agora usa `sendEmailVerification` do Firebase Authentication. O próprio Firebase envia o e-mail em português e valida o link na página padrão do projeto. Essa confirmação não depende de Resend, domínio próprio, chave de envio, Cloud Functions ou da função antiga `appEmailServiceStatus`.

## Como a pessoa confirma

1. Preenche o cadastro. A conta permanece pendente e o perfil não recebe senha nem link de confirmação.
2. Recebe o e-mail enviado pelo Firebase e toca no link.
3. Volta à aba/app original. O PratoPronto consulta o Firebase ao recuperar o foco. Também existe o botão **Já confirmei meu e-mail**.
4. O acesso só é liberado quando `reload` e um novo token retornam o e-mail confirmado. Tocar no botão sem abrir o link não confirma a conta.

Se o envio falhar, a tela mostra o erro e mantém a conta pendente para nova tentativa. O reenvio tem intervalo de um minuto no app; o Firebase aplica seus próprios limites de envio. Nenhum erro é apresentado como envio bem-sucedido.

O link usa o manipulador padrão do Firebase, sem redirecionamento personalizado ou parâmetros confiados ao navegador. Se o link estiver inválido ou vencido, o Firebase informa o erro e a pessoa pode solicitar outro na tela de confirmação.

As sessões continuam somente em memória. Alternar para o aplicativo de e-mail mantém a aba aberta e permite conferir a confirmação ao voltar. Se a pessoa fechar/recarregar o app ou o sistema encerrar a aba, ela entra novamente com e-mail e senha. Uma conta já confirmada não precisa confirmar o cadastro de novo. Abrir o link de uma conta não libera outra conta conectada.

## Configuração do projeto real

- Use as configurações públicas corretas de `pratopronto-d861d` e ative **Authentication → E-mail/senha**.
- Em **Authentication → Modelos → Verificação de endereço de e-mail**, mantenha o manipulador padrão do Firebase. O app solicita o idioma `pt-BR`.
- Publique o frontend atualizado no endereço que os clientes utilizam. Publicar a cópia hospedada no Sites não atualiza automaticamente `https://pratopronto-d861d.web.app`.
- Publique também `firestore.rules` para exigir o token `email_verified` nos dados privados. Contas pendentes podem somente criar o próprio perfil inicial com os campos permitidos. O navegador não pode atribuir administração nem editar sua confirmação.

No checkout atualizado, usando a conta responsável pelo Firebase:

```bash
npm ci
npx firebase login
npm run build
npx firebase deploy --only hosting,firestore:rules --project pratopronto-d861d
```

O cadastro por link não desativa o App Check de outros serviços. Pedidos, pagamentos, funções de negócio e avisos de login continuam exigindo a configuração de segurança própria da operação. Não exponha credenciais administrativas no frontend.

## Avisos de novos acessos

O aviso separado “novo acesso à sua conta” continua usando a fila privada do servidor e o Resend. Não é o e-mail de confirmação do cadastro. Enquanto esse envio não estiver ativado, contas confirmadas conseguem entrar e recebem um aviso no app de que o e-mail de acesso não pôde ser solicitado.

Para ativar esses avisos, ainda são necessários: domínio verificado e remetente autorizado no Resend; `SECURITY_EMAIL_FROM` no servidor; `RESEND_API_KEY` e `EMAIL_CODE_SECRET` no Secret Manager; App Check configurado; e publicação de `appLoginNotice`, `sendLoginEmail` e `cleanEmailSecurityData`. A chave `EMAIL_CODE_SECRET` continua sendo usada para identificadores privados e deduplicação da fila.

```bash
npx firebase deploy --only functions:pratopronto:appLoginNotice,functions:pratopronto:sendLoginEmail,functions:pratopronto:cleanEmailSecurityData --project pratopronto-d861d
```

Os endpoints antigos `appEmailServiceStatus`, `appSendEmailCode` e `appConfirmEmailCode` não são mais exportados pelo servidor. Se uma versão antiga deles tiver sido publicada por outra instalação, retire esses endpoints ao concluir a migração. Os registros antigos continuam privados e podem ser removidos pela rotina de expiração. O app atual não os utiliza.

## Verificação

```bash
npm test
npm run test:server
npm run test:auth
```

Os testes usam o SDK Firebase contra os emuladores locais. Cobrem envio nativo, conta ainda pendente antes de abrir o link, ação inválida, link de outra conta, uso único, atualização do token, login posterior, falha de sessão e regras que negam acesso sem confirmação. Não enviam mensagens reais.

Na conta real, ainda é preciso validar a chegada na caixa de entrada ou spam de um e-mail de teste que você controla. A aceitação do envio pelo Firebase não garante entrega na caixa de entrada. Não foram feitas alterações administrativas no Firebase nesta atualização.

Referências: [confirmação de e-mail do Firebase](https://firebase.google.com/docs/auth/web/manage-users#send_a_user_a_verification_email), [persistência da sessão](https://firebase.google.com/docs/auth/web/auth-state-persistence), [avisos pelo Resend](https://resend.com/docs/api-reference/emails/send-email).
