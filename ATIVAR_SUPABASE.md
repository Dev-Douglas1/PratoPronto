# Estado da integração Supabase

O cliente oficial está em `src/lib/supabase.js`, com a dependência instalada e o lockfile completo. As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` configuram esse cliente. Isso **não migra** contas, perfis, pedidos ou pagamentos.

## Serviço atualmente usado pelo app

Login, confirmação de e-mail, perfis e área da empresa continuam usando Firebase Authentication, Firestore e Cloud Functions. A tentativa anterior de cadastrar a mesma senha nos dois provedores foi retirada: criava duas identidades independentes, sem ligar as tabelas ou compartilhar permissões. Nenhuma conta existente foi apagada.

Uma consulta em 17/09/2026 encontrou o projeto Supabase PratoPronto com tabelas vazias. Um login Firebase não autentica automaticamente uma consulta ao Supabase. O erro de permissão das telas atuais vem das consultas ao Firestore.

## Antes de substituir o backend

- Escolher uma única identidade e preparar a migração das contas existentes. Nunca copiar senhas para tabelas de perfil.
- Migrar os dados e os serviços de orçamento, criação de pedidos, pagamentos, reembolsos e avaliações, preservando as relações entre os registros.
- Calcular valores e alterar pagamentos/etapas somente em serviços confiáveis. Clientes não podem escrever preço, total ou status diretamente na tabela de pedidos.
- Vincular o administrador por um registro criado pelo responsável, sem confiar em e-mail ou metadados editáveis no navegador.
- Testar confirmação de e-mail, recuperação, encerramento da sessão, acesso ao próprio pedido e recusa de acesso aos pedidos alheios antes de trocar o provedor ativo.

O SQL de sincronização anterior foi retirado porque permitia escrita direta de valores e status de pedidos pelo cliente. Não use uma cópia antiga desse SQL. A migração para Supabase **ainda não está concluída**, e esta correção não altera as tabelas remotas.

Use somente a chave publicável no React. Chaves de serviço ficam exclusivamente no servidor. O cliente permanece sem sessão persistente e sem processar links de autenticação enquanto o Supabase Auth não for ativado no fluxo do app.
