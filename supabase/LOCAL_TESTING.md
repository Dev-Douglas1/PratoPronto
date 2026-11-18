# Ambiente local de testes — PratoPronto

Este ambiente é destinado exclusivamente ao desenvolvimento e aos testes locais. Ele não deve ser conectado ao projeto Supabase de produção.

## Requisitos

- Docker Desktop em execução
- Supabase CLI instalado
- Node.js 22.x (o projeto declara `>=22 <23`)

## Inicialização

Na raiz do repositório:

```bash
supabase --version
supabase start
```

O Supabase local disponibiliza API em `http://127.0.0.1:54321` e Studio em `http://127.0.0.1:54323`. Use somente as chaves locais exibidas pelo comando `supabase start`.

## Atenção: migrations ainda precisam ser reconciliadas

A pasta `supabase/migrations` versionada atualmente contém apenas parte do histórico. A instância hospedada de produção possui migrations adicionais. Portanto, **não execute `supabase db reset` nem considere este banco um clone fiel da produção até reconciliar o histórico completo**.

Para reconstruir o schema de referência, um mantenedor com acesso ao projeto deve revisar e executar, a partir deste checkout, o fluxo oficial:

```bash
supabase login
supabase link --project-ref <PROJECT_REF_DE_DESENVOLVIMENTO>
supabase db pull
```

O destino deve ser um projeto descartável de desenvolvimento, nunca produção. Antes de aceitar qualquer operação remota, confira o projeto-alvo. Não use `supabase db reset --linked`, `supabase db push --linked` ou comandos remotos destrutivos neste repositório.

Após trazer e revisar as migrations faltantes, valide primeiro apenas no ambiente local:

```bash
supabase db reset
supabase test db
npm ci
npm test
npm run build
```

## Dados de teste

Não importar dados pessoais, pedidos, credenciais ou registros reais de produção. Criar fixtures sintéticas e contas de teste isoladas. Segredos locais ficam em `.env.local` (não versionar).

## Segurança

- Nunca colocar `service_role`, secret key ou senha de banco no frontend.
- Não apontar `.env.local` para a URL de produção durante os testes.
- Usar exclusivamente as credenciais locais impressas pelo `supabase start`.
- Testar RLS com pelo menos dois usuários e duas empresas fictícias, verificando leitura, escrita, atualização e exclusão cruzadas.
