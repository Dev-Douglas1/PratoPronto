# Auditoria de segurança do Supabase

Data da revisão: 2026-09-22.

## Arquitetura ativa

O runtime usa Supabase Auth, Postgres/RLS, Realtime, Storage privado e RPCs PostgreSQL. Firebase, Firestore, Cloud Functions e o Worker legado não fazem parte do runtime desta branch.

A arquitetura ativa está concentrada em perfis, empresas, membros, produtos, pedidos, avaliações, atendimento, Piloto Parceiro e administração da plataforma.

## Limpeza concluída

Foram removidos os caminhos legados sem uso no frontend atual: `store_settings`, `restaurant_admins`, `pedidos`, `pedido_itens`, `produtos`, `enderecos`, `favoritos`, antigas tabelas privadas de convites/limite e RPCs/helpers duplicados do modelo anterior.

## Hardening aplicado

- RLS está habilitado nas tabelas expostas ao cliente.
- `platform_admins` expõe somente o próprio registro ao administrador autenticado e não permite escrita direta do navegador.
- Documentos de pilotos ficam no bucket privado `pilot-documents`, com limite de 5 MB e acesso restrito ao titular/administrador autorizado.
- Cada piloto possui somente quatro caminhos de documento permitidos (`profile`, `motorcycle`, `cnh-front`, `cnh-back`). Upload/substituição só é permitido durante rascunho/correção; após envio/aprovação o navegador não pode sobrescrever nem apagar os arquivos.
- Ao iniciar uma reverificação, o piloto aprovado sai do estado operacional antes de substituir documentos; o processo também bloqueia atualização enquanto houver entrega ativa atribuída.
- `pilot_profiles` não funciona como diretório de documentos. Empresas recebem somente dados sanitizados de pilotos aprovados por RPC.
- Empresas e pilotos possuem `account_status` separado do status comercial/aprovação, permitindo suspensão e bloqueio sem apagar histórico.
- Empresa suspensa/bloqueada não recebe novos pedidos; operações sensíveis exigem empresa ativa.
- Piloto suspenso/bloqueado não recebe ofertas, não aceita entrega e não inicia/conclui rota.
- Operações críticas do banco passaram a RPCs validadas. Escrita direta de produtos, configurações da empresa e contatos de pilotos foi removida das policies de cliente.
- Alterações de preço/promoção e contatos de pilotos usam RPCs próprias com validação e rate limiting, evitando bypass das regras pelo cliente.
- RPCs críticas possuem limite por usuário e janela de tempo usando `private.rpc_rate_limits` e `private.enforce_rate_limit()`.
- Existe trilha `audit_events` para alterações críticas de empresa, equipe, cardápio, pedidos, ofertas, avaliações, atendimento, pilotos e contatos.
- Proprietário/administrador consegue consultar auditoria da própria empresa; administrador da plataforma consegue consultar auditoria geral.
- Documentos antigos de pilotos entram em `pilot_document_cleanup_queue`: substituídos (7 dias), cadastro rejeitado (30 dias) e piloto bloqueado (90 dias).
- A Edge Function autenticada `pilot-document-cleanup` está implantada para processar itens vencidos da fila sem expor credenciais administrativas ao frontend.
- Senha de entrega fica em estrutura privada e é apagada depois da confirmação correta.

## SECURITY DEFINER

O Database Advisor continua sinalizando funções `SECURITY DEFINER` expostas por RPC. Isso é esperado para operações que precisam modificar dados que o navegador não pode escrever diretamente, como checkout, equipe, progressão de pedido, ofertas de entrega e moderação.

Esses avisos não são tratados como autorização automática. As RPCs sensíveis verificam internamente identidade/propriedade, papel da empresa, piloto atribuído ou administração da plataforma e as operações críticas também possuem rate limiting.

`get_storefront(text)` permanece executável por `anon` porque a loja pública precisa abrir antes do login. Ela retorna somente o subconjunto público de dados; a configuração bruta continua protegida.

Referências do Advisor:
- SECURITY DEFINER anônimo: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- SECURITY DEFINER autenticado: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Performance Advisor

Depois do hardening, não restam avisos de foreign key sem índice nem policies permissivas duplicadas. Os avisos atuais são apenas `unused_index`, esperado enquanto o banco praticamente não possui tráfego real.

Índices não devem ser removidos apenas por aparecerem como não utilizados antes de existir volume de produção suficiente para medir os planos de consulta.

## Pendências de operação real

### Revisão de IDs e equipe em 23/09/2026

O UUID do Supabase Auth é exibido no perfil e aceito, junto com e-mail verificado,
na gestão de membros. A RPC valida o vínculo atual com o restaurante antes de
consultar a conta de destino, inclusive quando o papel do solicitante é nulo.
Somente o proprietário pode conceder/alterar/remover administradores da empresa;
nenhum membro pode alterar o proprietário ou seu próprio acesso por esse formulário.
O ID não é uma credencial, e a RPC não concede administração global da plataforma.

Foram aprovados sete testes PostgreSQL locais de papéis/isolamento, o teste de
interface do ID e a verificação transacional do banco real, com todos os dados de
teste revertidos. O conjunto do aplicativo passou nos 47 testes e no build com Node 22.
A auditoria de dependências de produção não encontrou vulnerabilidades.

Os avisos do Advisor sobre RPCs `SECURITY DEFINER` continuam exigindo revisão por
operação; o teste de equipe não certifica os outros fluxos do aplicativo. A proteção
contra senhas vazadas continua desabilitada e depende da configuração do Auth:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

### Homologação pendente

Ainda não são considerados homologados: SMTP de produção, contas reais de teste, E2E completo cliente → empresa → piloto, backup/restauração, dispositivos reais, hospedagem final e monitoramento de produção. A fila de retenção possui processador seguro, mas a execução periódica automática ainda precisa ser configurada sem expor credenciais.
