# Ofertas e validações do PratoPronto

## O que mudou

- **Empresa → Ofertas**: criar e editar uma oferta por produto, definir título (3–60 caracteres), desconto inteiro (1–90%), início, término (até 90 dias) e pausar/reativar. Produtos indisponíveis continuam indisponíveis.
- A tela da empresa mostra os horários no fuso do aparelho que está editando. Os instantes são salvos em milissegundos UTC e comparados com o horário do servidor ao comprar.
- O cardápio mostra o preço anterior, o desconto e o título, além do filtro de ofertas. O carrinho recalcula a estimativa. O servidor sempre calcula o valor final em centavos, incluindo tamanho, borda e adicionais. O desconto não se aplica ao frete.
- Uma promoção vencida, pausada ou alterada entre o resumo e a confirmação exige que o cliente confira o resumo novamente. Pedidos já confirmados preservam seu preço e sua promoção.
- O editor de preços preserva a promoção; editar uma oferta preserva o preço e a disponibilidade. As gravações ficam em `productSettings/{produto}.promocao` e exigem administrador com e-mail confirmado pelas regras.
- Layout branco com detalhes amarelos, menu da empresa preto, botões para toque, textos maiores e edição de ofertas em uma coluna no celular.

## Campos e linguagem

- Nome: de 2 a 80 caracteres; letras, acentos, espaços, apóstrofos, hífens e ponto. Senhas e nomes nunca são gravados juntos como credenciais; a senha é tratada pelo Firebase Authentication.
- Telefone: 10 ou 11 números incluindo DDD, salvo somente com números. Não comprova posse do telefone. Não foi adicionado SMS.
- Novas senhas: 12 a 128 caracteres, com letra e número. Senhas existentes continuam podendo ser usadas no login; uma senha não é cortada, normalizada nem filtrada por palavrões.
- Filtro de palavrões comuns e algumas variações com números, acentos ou separadores em nomes, títulos de ofertas, avaliações, respostas e observações/atendimentos. Críticas respeitosas são permitidas. Nenhum filtro automático identifica toda linguagem ofensiva ou resolve todos os casos de contexto.
- A mesma lista serve o formulário, os serviços e as regras do Firestore. Ao alterar `functions/src/input-policy.js`, execute `node functions/scripts/sync-content-rules.js`, teste e publique as regras. Esse filtro não substitui autenticação ou autorização.

## Ativação no Firebase real

A publicação no Sites atualiza a interface hospedada no Sites. Ela não publica serviços nem regras em `pratopronto-d861d` e não atualiza automaticamente `https://pratopronto-d861d.web.app`.

A conta responsável pelo Firebase precisa publicar, a partir deste código atualizado:

1. `firestore.rules`, para autorizar a empresa a salvar ofertas e exigir os novos limites e o filtro de conteúdo. Com as regras anteriores, uma gravação com `promocao` será recusada.
2. As Cloud Functions de negócio atualizadas, especialmente `appQuote` e `appCheckout`, para o desconto ser incluído no valor cobrado. Atualize também as funções de configurações e atendimento, que utilizam a validação compartilhada. Siga as credenciais e pré-requisitos de `ATIVAR_OPERACAO.md`.
3. A política de senha do Authentication com mínimo 12 e máximo 128. O formulário limita o cadastro, mas isso não altera a política do Firebase automaticamente. O script existente `functions/scripts/configure-auth.js` prepara essa configuração e só aplica com `--apply`, usando a conta administrativa responsável. Preserve requisitos adicionais que a empresa já tenha configurado.
4. O frontend no Firebase Hosting, se esse for o endereço utilizado pelos clientes.

Publique os serviços que calculam os preços antes de liberar ofertas para clientes. Não abra as regras do banco para contornar uma falha. Não ative uma promoção no projeto real enquanto a versão antiga do servidor estiver calculando os pedidos.

A demonstração em `/demo/empresa/promocoes` usa dados fictícios em memória e permite experimentar o editor. Ela não grava ofertas na loja real. Nesta atualização, não foram feitas alterações administrativas no projeto Firebase nem cobranças reais.

## Testes

- `npm test`: renderização das telas, menu da empresa, consistência entre preços exibidos e o cálculo do servidor, sincronismo do filtro.
- `npm run test:server`: limites de entrada, variações ofensivas, nomes válidos, horários, centavos e descontos.
- `npm run test:auth`: autenticação por link, bloqueio de conta não verificada e regras do banco.
- `npm run test:integration`: fluxo de resumo e pedido com o emulador local, incluindo oferta vencida/pausada e preservação do desconto confirmado.

Referência para a política de senha: https://firebase.google.com/docs/auth/web/password-auth#recommended_set_a_password_policy
