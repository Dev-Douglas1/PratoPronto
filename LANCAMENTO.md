# Estado de lançamento — 10/09/2026

A interface e o backend foram implementados nesta entrega. A operação comercial ainda depende de ativação no Firebase/Mercado Pago e homologação com as contas reais. Nenhum pagamento real foi feito nesta sessão.

| Área | Implementado | Pendência externa |
|---|---|---|
| Pedidos | Cálculo de preços/adicionais/frete no servidor, resumo com validade e prevenção de duplicação | Publicar funções, regras e índices no Firebase |
| Pagamento | Checkout Pro, conferência da conta/moeda/valor/ambiente, assinatura do webhook e reconciliação | Conta recebedora, segredos e homologação no provedor |
| Reembolso | Fila durável, chave estável, confirmação do provedor, pagamento tardio/duplicado e devolução manual da maquininha | Saldo e permissões da conta; teste real do fluxo de homologação |
| Empresa | Configuração de horários, bairros, taxas, meios de pagamento, atendimento e painel de ocorrências | Dados reais e acesso administrativo por UID |
| Segurança | Regras fechadas para pedidos, App Check nas funções, limitação de tentativas, verificação de conta e e-mail | Registrar App Check, publicar regras, configurar autenticação e monitoramento |
| Privacidade | Exportação, perfil, marketing, solicitação durável de exclusão e remoção de contatos de pedidos encerrados | Revisar retenção, dados do controlador e procedimentos do negócio |
| Backups | Exportação diária, acompanhamento da operação e política de ciclo de vida preparada | Bucket privado, permissões e teste de restauração |
| Celular | PWA, ícones, layout adaptável, offline e atualização por escolha do usuário | Link público da operação e teste físico Android/iPhone |
| Comanda | Impressão operacional para cozinha e motoboy | Emissão fiscal e regularização conforme a atividade real |

Os testes automatizados usam emulador e um provedor controlado em memória. Cadastro real, Pix/cartão no Mercado Pago, acesso administrativo em produção, backup/restauração no Google Cloud e instalação em aparelho físico não foram homologados nesta sessão.

Procedimento completo: [ATIVAR_OPERACAO.md](ATIVAR_OPERACAO.md).

## Correções e experiência no celular

| Necessidade | Situação nesta atualização |
|---|---|
| Abrir sem tela vazia antes do login | Corrigido acesso a `store.zones` quando a loja ainda era nula. Teste reproduz o estado sem loja e sem usuário. |
| Mensagem quando a interface falha | Tratamento de erro de renderização, carregamento inicial e botão para tentar novamente. |
| Todas as abas acessíveis no celular | Quatro atalhos fixos e menu Mais para Concluídos, Avaliações e Configurações; desktop preserva todas as abas. |
| Resumo fácil de ler | Cartões em duas colunas, tipografia maior, conteúdo branco e navegação preta/amarela. |
| Controles de toque | Botões de 44–48 px, campos com texto de 16 px, janelas roláveis e respeito à área segura da tela. |
| Não confundir falha com ausência de pedidos | Erros têm recuperação; contadores desconhecidos mostram traço, sem informar zero como resultado confirmado. |
| Conexão verdadeira com os dados | Estado considera os snapshots do banco e indica quando os dados são locais; alterações ficam bloqueadas até sincronizar. |
| Busca sem resultados | Mensagem própria e botão para limpar filtros. |
| Evitar regressão em novas versões | Testes de renderização do início, login, cadastro, recuperação e todas as abas da empresa executam antes de cada build. |

Verificação desta atualização: renderização automatizada do código React, casos de frete e geração da versão de produção. O teste físico do layout e dos fluxos em Android/iPhone continua pendente. A compilação e os testes reduzem regressões; não garantem ausência de todos os erros. Pagamentos e serviços reais mantêm as pendências externas da tabela acima.
