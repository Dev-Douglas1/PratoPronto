# Checklist de lançamento — Segurança e LGPD

## Já implementado no código

- Firebase Authentication em vez de senha salva pelo app.
- Perfis separados por UID.
- Pedidos associados ao UID do cliente.
- Security Rules negando leitura de dados de outros usuários.
- Área para baixar os próprios dados.
- Área para corrigir dados.
- Exclusão de perfil + pedidos + conta após reautenticação com senha.
- Marketing opcional e separado dos dados necessários ao serviço.
- Versão da política/termos e timestamp do aceite.
- Cartão completo e CVV não persistidos.
- Rotas internas protegidas por autenticação.

## Obrigatório revisar antes de produção

1. Colocar nome/razão social real do controlador e e-mail/canal de privacidade no `.env`.
2. Revisar a Política de Privacidade com a operação real e com todos os fornecedores utilizados.
3. Definir política de retenção e exclusão, inclusive documentos que precisem ser guardados por obrigação legal/fiscal.
4. Criar processo humano para responder solicitações LGPD e incidentes.
5. Ativar uma política forte de senhas no Firebase Authentication.
6. Testar e publicar `firestore.rules`; nunca deixar Firestore em `allow read, write: if true`.
7. Integrar pagamento tokenizado por gateway antes de receber pagamentos reais.
8. Calcular/validar preços e pagamentos em backend confiável antes do uso comercial. Não confie no total enviado pelo navegador.
9. Para status de entrega, criar backend/painel administrativo com autorização própria; clientes não devem editar status do pedido.
10. Habilitar HTTPS no domínio final e manter dependências atualizadas.
11. Ativar a proteção contra enumeração de e-mails no Firebase Authentication.
12. Configurar Firebase App Check com reCAPTCHA Enterprise, monitorar as métricas e só então habilitar a aplicação obrigatória.
