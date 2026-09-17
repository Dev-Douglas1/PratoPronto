# Empresa 2.0

`/empresa/:aba` exige conta autenticada, e-mail verificado e papel `restaurant_admin` no UID. `/demo/empresa/:aba` usa dados fictícios em memória, sem pagamentos ou gravações de pedidos reais.

Abas: pedidos, entregas, concluídos, avaliações, cardápio, atendimento e configurações.

O fluxo real é aguardando pagamento → confirmado → preparando → pronto → saiu para entrega → entregue. Maquininha entra como confirmado/pendente de recebimento. Somente a empresa pode avançar etapas pelo servidor, e o recebimento precisa ser confirmado antes de concluir a entrega.

O painel permite buscar cliente/pedido/bairro, filtrar etapas, imprimir comanda de cozinha e entrega em 80 mm, copiar endereço, telefonar para o cliente, pausar produtos e responder avaliações. Clientes só avaliam os próprios pedidos entregues. A comanda é não fiscal.

Configurações reúne endereço da empresa, responsável, atendimento, horários, bairros, taxas, mínimo, frete grátis, previsão, meios de pagamento, retenção operacional e abertura da loja. A aba apresenta verificação do provedor, App Check, backups e ocorrências para reconsulta.

Cancelamentos aprovados solicitam devolução ao Mercado Pago; o status só confirma devolução depois da resposta financeira do provedor. Recebimentos da maquininha exigem devolução manual e referência de comprovante. A versão demo simula esses estados separadamente.

O servidor aceita até 50 linhas e 50 unidades por linha, com limite de R$ 5.000 por pedido. Os preços e adicionais são conferidos independentemente do navegador; não há mais validação financeira limitada a cinco itens nas regras do Firestore.

Ativação, testes e dependências externas: [ATIVAR_OPERACAO.md](ATIVAR_OPERACAO.md).
