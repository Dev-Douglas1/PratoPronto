# Integração da versão atualizada com a main

Esta branch resolve a divergência entre main em 546be9d e a versão atualizada em fd2ac81.
O commit de integração terá os dois pais: o histórico anterior permanece recuperável.
Não há reset ou push forçado da main.

## Escolhas da resolução

- Interface, cadastro com e-mail confirmado, sessão privada, catálogo com imagens, promoções e painel: versão atualizada.
- Cloud Functions, validação de preços no servidor e regras que negam todas as escritas em pedidos pelo navegador: versão atualizada.
- App Check Enterprise com debug restrito a desenvolvimento, cabeçalhos de segurança/CSP, inicialização do Codespaces, CI e arquivos de publicação: integrados a partir da main.
- O Worker, cliente HTTP seguro, limites, idempotência e scripts ficam preservados. O Worker não é o backend da interface 2.0: usa catalog/settings/delivery, enquanto esta usa productSettings e as funções appQuote/appCheckout.
- A tela Empresa.jsx e os estilos upgrade.css antigos foram substituídos por CompanyDashboard.jsx e company.css. O instalador antigo foi substituído por InstallApp.jsx.
- Não foram alterados bancos, permissões remotas, dados de clientes, serviços publicados nem configurações de pagamento.

## Compatibilidade de operação

Se o ambiente usa VITE_SECURE_ORDER_BACKEND=true, esta interface bloqueia chamadas de pedidos e a publicação de produção. Não altere a chave só para remover o aviso: primeiro homologue o servidor functions/ e os contratos/dados de pedidos ou mantenha a versão Worker anterior. Não há troca automática de servidor, cobrança, migração de pedidos antigos nem fallback de escrita direta no Firestore.

A interface atual precisa dos serviços em ATIVAR_OPERACAO.md para operar pedidos. Publicar apenas o frontend não ativa esses serviços. Os documentos PRODUCTION_RELEASE.md, SECURE_ORDER_BACKEND.md e SECURITY_THREAT_MODEL.md mantêm o histórico do Worker e estão identificados como documentação da implementação anterior.

Supabase permanece opcional; a autenticação ativa continua no Firebase. Nenhuma senha é armazenada em perfis. Os arquivos .env e credenciais não fazem parte desta integração.

## Recuperar o Codespaces

Estes passos são para o caso apresentado: main estava limpa antes da tentativa de merge.

1. Cancele apenas a tentativa de merge que parou: `git merge --abort`.
2. Atualize referências: `git fetch origin`.
3. Confira a main: `git switch main` e `git pull --ff-only origin main`.
4. Integre a resolução: `git merge --ff-only origin/codex/integracao-main-atualizada`.
5. Execute `npm ci` e `npm run build`.
6. Se tudo passar, envie: `git push origin main`.

Se a main tiver recebido outros commits desde a preparação desta integração, o comando --ff-only para sem modificar seu trabalho. Nesse caso, reconcilie os novos commits antes de enviar. Não use reset --hard nem push --force.

## Validação

A integração inclui testes para impedir troca silenciosa de backend, recusar configurações de produção com debug e impedir que o gerador de regras aceite escrita direta em pedidos. Os testes de aplicativo, servidor e regras devem passar antes da publicação. Isso não equivale a homologar pagamento ou envio de e-mails em produção.
