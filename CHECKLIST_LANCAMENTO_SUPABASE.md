# Checklist de lançamento — PratoPronto Supabase

Nenhum software pode ser garantido como “zero erro”. O objetivo desta lista é impedir lançamento enquanto existir qualquer falha conhecida nos fluxos críticos.

## Gate 1 — Banco e segurança

- [ ] Confirmar que o projeto Supabase de produção está ativo e é o projeto correto.
- [ ] Confirmar que somente a chave **publishable** está no frontend.
- [ ] Garantir que nenhuma `service_role`, senha SMTP, token privado ou segredo esteja no GitHub ou em `VITE_*`.
- [ ] Rodar os Security Advisors do Supabase e revisar cada aviso.
- [ ] Rodar os Performance Advisors e criar os índices realmente necessários.
- [ ] Conferir RLS de perfis, empresas, membros, produtos, pedidos, avaliações, reembolsos, pilotos e Storage.
- [ ] Confirmar que `pilot-documents` é privado e limitado a 5 MB por arquivo.
- [ ] Confirmar que empresas não conseguem ler CNH/fotos privadas de pilotos.
- [ ] Confirmar que somente administradores da plataforma conseguem revisar documentos.
- [ ] Remover tabelas/rotinas antigas que não tenham mais uso antes de produção.
- [ ] Configurar rotina de backup e testar restauração.

## Gate 2 — Supabase Auth

- [ ] Criar a primeira conta real do controlador da plataforma.
- [ ] Inserir essa conta em `platform_admins` por uma operação administrativa no Supabase.
- [ ] Configurar URLs de Site URL e Redirect URLs para o domínio real.
- [ ] Configurar e testar SMTP/remetente de produção.
- [ ] Testar cadastro, confirmação de e-mail, login, logout e recuperação de senha.
- [ ] Testar token expirado, link já usado e e-mail já cadastrado.
- [ ] Confirmar que conta não verificada não entra em áreas protegidas.

## Gate 3 — Cliente

- [ ] Testar criação e edição do perfil.
- [ ] Testar CEP/endereço incompleto e fora da área de entrega.
- [ ] Testar pesquisa por empresa e por prato.
- [ ] Testar uma loja com muitos produtos, produto pausado e produto sem imagem.
- [ ] Testar personalização de pizza e cálculo em centavos.
- [ ] Confirmar que o carrinho não mistura empresas.
- [ ] Testar resumo, expiração do resumo e clique duplo em “Confirmar pedido”.
- [ ] Confirmar que o servidor recalcula preço, frete e disponibilidade.
- [ ] Testar acompanhamento em dois celulares/abas ao mesmo tempo.
- [ ] Testar senha de entrega errada e correta.
- [ ] Testar avaliação somente depois de entregue.
- [ ] Testar solicitação de atendimento/cancelamento.

## Gate 4 — Empresas

- [ ] Criar duas empresas reais de teste com proprietários diferentes.
- [ ] Confirmar isolamento: Empresa A nunca lê ou altera dados da Empresa B.
- [ ] Testar Proprietário, Administrador, Atendente e Cozinha separadamente.
- [ ] Confirmar que cada papel enxerga e altera somente o que deve.
- [ ] Testar inclusão, alteração e remoção de membros.
- [ ] Testar cardápio, preço, disponibilidade e promoções.
- [ ] Testar bairros, taxas, pedido mínimo, frete grátis e horários.
- [ ] Testar aceite e progressão dos pedidos.
- [ ] Testar impressão da comanda de cozinha e entrega.
- [ ] Testar resposta a avaliações.
- [ ] Testar atendimento/reembolso sem permitir alteração por papel não autorizado.
- [ ] Testar cadastro de contato de piloto próprio e parceiro.

## Gate 5 — Piloto Parceiro

- [ ] Entrar pelo Perfil em **“Se torne um piloto das entregas”**.
- [ ] Confirmar preenchimento automático de nome, e-mail, telefone e cidade.
- [ ] Validar placa Mercosul/antiga compatível com o formato aceito.
- [ ] Validar tipo/modelo e cor da moto.
- [ ] Enviar foto do piloto, foto da moto, CNH frente e CNH verso.
- [ ] Testar arquivo maior que 5 MB e tipo não permitido.
- [ ] Confirmar que CNH vencida é recusada.
- [ ] Confirmar status “Em análise” e bloqueio de ofertas.
- [ ] Aprovar um piloto pela área `/plataforma/pilotos`.
- [ ] Reprovar outro, mostrar o motivo e testar reenvio.
- [ ] Confirmar que somente piloto aprovado aparece para empresas.
- [ ] Testar ficar disponível/indisponível.
- [ ] Enviar uma oferta, recusar e conferir que o pedido continua livre.
- [ ] Enviar outra oferta, aceitar e conferir cancelamento das concorrentes.
- [ ] Confirmar que só o piloto atribuído inicia a rota.
- [ ] Confirmar que só o piloto atribuído conclui com a senha correta.
- [ ] Confirmar que a senha é apagada após a entrega.

## Gate 6 — Pagamento

- [ ] Manter somente **maquininha/pagamento na entrega** enquanto pagamento online não estiver homologado.
- [ ] Testar valor que o piloto deve cobrar e confirmação de recebimento.
- [ ] Garantir que pedido cancelado não aparece como valor a cobrar.
- [ ] Antes de ativar Pix/cartão: implementar provedor real, webhook assinado, idempotência, reconciliação e reembolso.
- [ ] Nunca armazenar número completo de cartão, CVV ou senha.

## Gate 7 — Privacidade e operação

- [ ] Atualizar Política de Privacidade para empresas, pilotos, CNH/fotos, finalidade e retenção.
- [ ] Atualizar Termos de Uso para marketplace, empresas e Pilotos Parceiros.
- [ ] Definir prazo real de retenção para documentos de pilotos rejeitados/inativos.
- [ ] Implementar exclusão dos arquivos privados quando a retenção terminar.
- [ ] Definir canal de contato de privacidade e suporte.
- [ ] Definir procedimento para fraude, piloto bloqueado, empresa bloqueada e contestação.
- [ ] Revisar necessidade de emissão fiscal e responsabilidades de cada empresa.
- [ ] Guardar trilha de auditoria para aprovação/reprovação de pilotos e mudanças críticas.

## Gate 8 — Qualidade técnica

- [ ] `npm ci` sem erro.
- [ ] `npm audit --omit=dev` sem vulnerabilidade alta/crítica.
- [ ] `npm test` 100% aprovado.
- [ ] `npm run check:production` aprovado.
- [ ] `npm run build` aprovado.
- [ ] GitHub Actions verde no commit exato que será lançado.
- [ ] Testar Chrome Android, Safari iPhone e desktop.
- [ ] Testar rede lenta, offline, reconexão e duas sessões simultâneas.
- [ ] Testar telas pequenas sem overflow ou botões inacessíveis.
- [ ] Testar acessibilidade básica: labels, teclado, foco e mensagens de erro.
- [ ] Testar PWA instalada e atualização de versão.
- [ ] Conferir que service worker não guarda dados sensíveis.
- [ ] Adicionar monitoramento de erros do frontend e alertas operacionais.
- [ ] Definir limite/rate limiting para RPCs sensíveis e detectar abuso.

## Gate 9 — Publicação

- [ ] Escolher hospedagem de produção e domínio.
- [ ] Configurar variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no ambiente de produção.
- [ ] Configurar HTTPS, headers de segurança e política de conteúdo adequada.
- [ ] Publicar primeiro em ambiente de homologação.
- [ ] Rodar E2E real com quatro contas: cliente, proprietário, atendente/cozinha e piloto.
- [ ] Fazer um pedido completo: busca → carrinho → pedido → preparo → oferta → aceite do piloto → entrega com senha → avaliação → resposta da empresa.
- [ ] Repetir o fluxo em celular real.
- [ ] Só promover para produção após todos os gates críticos ficarem marcados.
- [ ] Depois do lançamento, acompanhar logs/erros e manter um plano de rollback para a versão anterior.
