# Ativação do PratoPronto

O código de cobrança foi implementado, mas escrever a integração não ativa contas externas. Não foram fornecidos acesso administrativo ao Firebase nem credenciais do Mercado Pago nesta sessão. Nenhuma cobrança ou devolução real foi feita. A demonstração empresarial permanece isolada em `/demo/empresa/pedidos`.

## 1. Preparar o Firebase

Use um projeto de homologação separado do projeto de produção. Não alterne credenciais de teste e produção no mesmo banco: pedidos e notificações precisam continuar vinculados ao ambiente em que foram criados.

Cloud Functions e exportações gerenciadas de backup requerem faturamento habilitado. Confirme o plano e configure alertas de orçamento no Google Cloud antes de publicar o servidor. `maxInstances` limita a escala das funções, mas não é um teto de gastos.

No terminal da sua conta responsável:

```bash
npm ci
npm ci --prefix functions
npx firebase login
gcloud auth application-default login
```

O login do Firebase CLI serve à publicação; o login ADC do Google Cloud serve aos scripts administrativos. Não envie chave privada, arquivo de conta de serviço ou senha por mensagem.

Confira a autenticação e o domínio, primeiro sem aplicar:

```bash
node functions/scripts/configure-auth.js --project pratopronto-d861d --origin https://pratopronto-d861d.web.app
```

Repita com `--apply` para ativar e-mail/senha, adicionar o domínio sem apagar os existentes, exigir senha de pelo menos 12 caracteres e habilitar proteção contra enumeração de e-mails. O script preserva provedores não listados na atualização, incluindo telefone. O app atual faz login por e-mail e senha; ativar telefone no console, por si só, não cria uma tela de login por SMS.

Em **App Check**, registre o app Web com reCAPTCHA Enterprise e os domínios usados. Coloque a chave pública em `VITE_FIREBASE_APPCHECK_SITE_KEY` no ambiente do frontend. Configure e teste a imposição de App Check no Firestore. As funções autenticadas já exigem App Check em nuvem; somente o emulador local dispensa a verificação.

## 2. Vincular o Mercado Pago

Antes de abrir novos cadastros, valide também [a confirmação por link do Firebase](ATIVAR_EMAIL.md). O cadastro usa o envio nativo do Authentication; Resend e Cloud Functions são necessários somente para os avisos separados de login. Contas sem confirmação continuam bloqueadas.

Crie a integração Checkout Pro na conta que receberá as vendas. Para a homologação, siga o fluxo de usuários e cartões de teste do provedor. Para produção, use a conta recebedora real e sua integração produtiva.

Defina os segredos no Secret Manager, pelos prompts do terminal:

```bash
npx firebase functions:secrets:set MP_ACCESS_TOKEN --project pratopronto-d861d
npx firebase functions:secrets:set MP_WEBHOOK_SECRET --project pratopronto-d861d
```

Copie `functions/.env.example` para `functions/.env.pratopronto-d861d`. Preencha `APP_PUBLIC_URL` com a origem HTTPS pública do app, `MP_COLLECTOR_ID` com o ID da conta recebedora e `BACKUP_BUCKET` com o bucket privado preparado no passo 5. `PAYMENT_ENV=test` é para homologação; `production` é para produção. A liberação produtiva também exige `LIVE_ORDERS_ENABLED=true`. Não use uma URL restrita ao proprietário como retorno de compras de clientes.

Cadastre o evento **payment** nas notificações da integração Mercado Pago. URL desta implantação Firebase:

```text
https://southamerica-east1-pratopronto-d861d.cloudfunctions.net/mpWebhook
```

A assinatura vem da configuração de Webhooks. O servidor confere a assinatura e consulta o pagamento na API; não confia na tela de retorno nem nos valores enviados pelo navegador. Pix, crédito e débito online dependem dos meios disponíveis no provedor para a conta. Na entrega, o entregador utiliza a maquininha física da empresa.

## 3. Publicar servidor e regras juntos

```bash
npx firebase deploy --only functions,firestore --project pratopronto-d861d
```

`firebase.json` inclui todas as funções e `firestore.indexes.json`. As regras novas proíbem gravações de pedidos pelo navegador: o servidor é o único responsável por valores, pagamentos e etapas. Faça a transição com a loja fechada para evitar que uma versão antiga do frontend tente gravar pedidos diretamente.

Cadastre sua conta no app e confirme o e-mail. Confira o administrador que será promovido:

```bash
node functions/scripts/grant-admin.js --project pratopronto-d861d --email EMAIL_DA_EMPRESA
```

Repita com `--apply` depois de conferir o usuário exibido. O acesso é concedido ao UID verificado, não a um e-mail embutido no navegador. Saia e entre novamente. Para retirar acesso, o mesmo script aceita `--revoke --apply`; exige outro administrador antes de remover o último.

## 4. Informar os dados da operação

Em **Empresa → Configurações**, informe nome/responsável, atendimento, endereço completo, fuso, horários, bairros atendidos, taxa por bairro, mínimo, limiar de frete grátis, previsão, pagamentos e prazo de retenção operacional. Os campos iniciais não constituem a política real de um restaurante; revise-os antes de salvar. A loja começa sem aceitar pedidos.

A aba também confere conta recebedora, App Check, ambiente e backup. Não marque recebimento de pedidos enquanto houver pendência de infraestrutura. No cardápio, revise preços, disponibilidade, tamanhos, descrições e imagens. Os ajustes de tamanho, borda e adicionais estão no catálogo público compartilhado `functions/src/catalog-data.js`; alterações nesses ajustes exigem publicar frontend e servidor.

## 5. Backups e alertas

Crie um bucket de backup dedicado, privado, na localização compatível com o Firestore. Use acesso uniforme, prevenção de acesso público e política de exclusão em 30 dias (`ops/backup-lifecycle.json`), após revisar o prazo adequado à empresa. Não use um bucket público de imagens. Conceda à conta de serviço da função somente as permissões para exportar o banco e ao agente de serviço do Firestore acesso ao bucket conforme a documentação oficial.

`backupDatabase` solicita uma exportação por dia e consulta o resultado nas execuções seguintes. A aba da empresa só mostra backup concluído depois de a operação retornar sucesso. Configure um canal de alerta do responsável no Cloud Monitoring e aplique a política `ops/monitoring-policy.json`, associando o canal. O arquivo não envia mensagens sozinho.

Teste a restauração em um **projeto de recuperação separado**, nunca sobre o banco ativo. Registre o resultado, a data e os responsáveis. Após restaurar, reaplique as exclusões solicitadas desde o backup antes de atender clientes.

## 6. Publicar para celular

Preencha as variáveis públicas de Firebase/App Check no ambiente do frontend. Nunca coloque `MP_ACCESS_TOKEN`, assinatura de webhook ou credencial Admin em variáveis `VITE_`.

```bash
npm run build
npx firebase deploy --only hosting --project pratopronto-d861d
```

Use a URL HTTPS retornada pela publicação. A PWA possui manifest, ícones, modo de aplicativo, tela sem conexão e atualização mediante escolha do usuário. Android: Chrome → menu → Instalar aplicativo. iPhone: Safari → Compartilhar → Adicionar à Tela de Início. Isso instala a versão Web; não publica APK/AAB nem cria uma página na Play Store/App Store.

## 7. Homologação antes de abrir

Testes locais implementados: cálculo independente do navegador, opções inválidas, 12 produtos no carrinho, área/horário, controle de acesso, resumo expirado, cliques simultâneos, mudança de preço, confirmação do provedor, devolução duplicada, timeout, pagamento tardio e máquina na entrega.

```bash
npm test
npm run test:server
npm run test:rules
npm run test:integration
```

Os testes financeiros automatizados usam um provedor controlado em memória e Firestore Emulator. Eles não substituem a homologação com o Mercado Pago. No projeto de teste, valide Pix/cartões de teste disponíveis, aprovação, recusa, retorno, webhook, cancelamento, reembolso, falha de rede, pedido entregue e avaliação. No celular físico, valide teclado/endereço, instalação, reabertura, checkout externo, impressão e restauração de sessão. Não use uma cobrança real como demonstração automática.

## Operação e limites

- A preferência é criada uma vez por pedido. Resultado desconhecido fica pendente para consulta; não é repetido cegamente.
- Confirmação tardia de pedido já cancelado solicita devolução. Um segundo pagamento do mesmo pedido é devolvido sem cancelar o primeiro.
- Reembolso online só é marcado como concluído após confirmação do Mercado Pago. Não há promessa de crédito instantâneo: prazo e disponibilidade de saldo dependem do provedor.
- Pagamento recebido em maquininha exige devolução pela empresa. A interface registra a referência do comprovante e informa que a confirmação foi feita pela empresa.
- Falhas de webhook/reembolso são armazenadas, reprocessadas e apresentadas em Ocorrências. Após repetidas falhas, a empresa precisa reconsultar e resolver o problema.
- Exclusão de conta aguarda pedidos e devoluções pendentes; contatos e endereços são removidos, preservando registros mínimos de transação. Defina com o responsável os prazos aplicáveis e o atendimento das solicitações.
- Comanda é documento não fiscal. Emissão fiscal, regularização da empresa, operação de entrega e atendimento humano precisam ser definidos para a atividade real. O código não garante conformidade jurídica nem elimina todos os riscos de ataques.

Referências: [Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/create-payment-preference), [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/additional-content/notifications/webhooks), [Firebase Functions](https://firebase.google.com/docs/functions/get-started), [Exportação e restauração](https://firebase.google.com/docs/firestore/manage-data/export-import), [Configuração de autenticação](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig).

## Promoções e limites de cadastro

A nova aba **Ofertas** e as validações exigem as regras e os serviços atualizados. Veja [ATIVAR_OFERTAS.md](ATIVAR_OFERTAS.md) antes de ativar promoções no projeto real.
