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
- Demonstração de Pix, cartão e máquina na entrega sem movimentar dinheiro nem solicitar cartão completo ou CVV.
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
9. O painel administrativo usa a coleção `admins`; conceda acesso somente pelo Console/ambiente privilegiado e revise essa lista periodicamente.
10. Confirmar o e-mail é obrigatório para registrar pedidos e solicitações de reembolso.
11. Ativar App Check somente depois de cadastrar uma chave válida e testar o domínio de produção.
12. Substituir as zonas demonstrativas de `src/config/delivery.js` pelas regiões e valores reais do negócio.
13. Habilitar HTTPS no domínio final e manter dependências atualizadas.
14. Ativar a proteção contra enumeração de e-mails no Firebase Authentication.
15. Configurar Firebase App Check com reCAPTCHA Enterprise, monitorar as métricas e só então habilitar a aplicação obrigatória.
