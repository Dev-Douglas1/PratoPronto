# PratoPronto

Marketplace React/Vite para pedidos, empresas e entregas, usando **Supabase Auth, Postgres, Row Level Security, Realtime e Storage privado**.

## Áreas do aplicativo

- Cliente: cadastro, confirmação de e-mail, perfil, endereço, busca de empresas/pratos, cardápio, carrinho, checkout, acompanhamento, atendimento e avaliação.
- Empresa: múltiplas empresas por conta, equipe com papéis `owner`, `admin`, `attendant` e `kitchen`, cardápio próprio, pedidos, impressão, avaliações, atendimento e contatos de pilotos.
- Piloto Parceiro: cadastro iniciado pelo Perfil, dados da moto, documentação privada, aprovação manual, ofertas para aceitar/recusar, rota e confirmação da entrega por senha de 4 dígitos.
- Plataforma: revisão privada de cadastros de Pilotos Parceiros antes de liberar ofertas.

## Backend atual

O Firebase e o Worker antigos foram retirados do runtime desta branch. O frontend usa apenas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Nunca coloque `service_role`, chaves secretas, credenciais SMTP ou outros segredos em variáveis `VITE_*`.

O cálculo e as alterações sensíveis usam RPCs PostgreSQL com validação de usuário/papel no Supabase. As tabelas sensíveis usam RLS. Os documentos de pilotos ficam no bucket privado `pilot-documents`.

## Pagamentos

Nesta fase Supabase, o fluxo operacional liberado é **pagamento na entrega/maquininha**. Pix e cartão online não devem ser anunciados como ativos até uma integração de pagamento real, webhook e reembolso serem homologados novamente.

## Executar

```bash
npm ci
npm run dev
```

Crie um `.env.local` com:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

## Testes

```bash
npm audit --omit=dev
npm test
npm run check:production
npm run build
```

A CI também abre as principais rotas em Vite, compila o build e testa o PWA.

## Rotas principais

- `/perfil` — perfil do cliente e entrada para cadastro de piloto.
- `/piloto/cadastro` — moto, CNH, fotos e envio para análise.
- `/piloto` — status do cadastro, ofertas e entregas.
- `/empresa/:aba` — área da empresa.
- `/empresa/nova` — cadastro de nova empresa.
- `/loja/:companyId` — loja pública de cada empresa.
- `/plataforma/pilotos` — análise de pilotos, somente para `platform_admins`.
- `/demo/empresa/pedidos` — demonstração sem dados reais.

## Lançamento

Use [CHECKLIST_LANCAMENTO_SUPABASE.md](CHECKLIST_LANCAMENTO_SUPABASE.md) como gate de produção. Não publique somente porque o build passou: autenticação real, e-mail, primeiro administrador, pedidos, empresa e entrega precisam ser testados ponta a ponta no ambiente real.
