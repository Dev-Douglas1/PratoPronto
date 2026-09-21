# Auditoria de segurança do Supabase

Data da revisão: 2026-09-21.

## Resultado da limpeza

A arquitetura ativa ficou concentrada nas tabelas de perfil, empresas, membros, produtos, pedidos, avaliações, atendimento, Piloto Parceiro e administração da plataforma.

Foram removidos do banco os caminhos legados que não eram usados pelo frontend atual:

- `store_settings`
- `restaurant_admins`
- `pedidos`
- `pedido_itens`
- `produtos`
- `enderecos`
- `favoritos`
- `private.rate_limits`
- `private.admin_invitations`
- RPCs antigas `app_commit`, `app_rate` e helpers públicos duplicados de autorização
- trigger antigo de convite administrativo

As duas tabelas privadas antigas estavam sem RLS. Como não pertenciam mais ao runtime e não tinham consumidores no código atual, elas foram removidas em vez de serem reabertas por políticas novas.

## Hardening aplicado

- `platform_admins` permite leitura direta somente do próprio registro do administrador autenticado; não há escrita direta pelo cliente.
- `is_platform_admin()` e `get_my_pilot_profile()` passaram a `SECURITY INVOKER`.
- `pilot_profiles` deixou de servir como diretório direto. O usuário só pode ler seu próprio registro; a lista pública para empresas passa pela RPC sanitizada `list_available_pilots()`.
- Escritas de `pilot_profiles` continuam exclusivamente por RPC.
- A política ampla `ALL` de `products` foi dividida em INSERT/UPDATE/DELETE, evitando uma segunda política permissiva de SELECT.
- Índices duplicados de pedidos foram removidos.
- Foreign keys do runtime receberam índices de cobertura.

## Avisos que permanecem

O Database Advisor ainda lista RPCs `SECURITY DEFINER` executáveis por usuários autenticados. Isso é intencional para operações que não podem depender de escrita direta do navegador, como checkout, alteração de etapa, gerenciamento de equipe, ofertas de entrega e aprovação de piloto.

Essas RPCs não devem ser consideradas seguras apenas por usarem `SECURITY DEFINER`. Cada uma precisa manter uma verificação interna de identidade, propriedade, papel da empresa ou administração da plataforma antes de alterar dados.

`get_storefront(text)` também permanece `SECURITY DEFINER` e executável por `anon` porque a loja precisa abrir antes do login. Ela retorna apenas o subconjunto público da configuração da empresa; a tabela bruta `restaurant_settings` continua protegida.

## Performance Advisor

Depois da limpeza não restaram avisos de foreign key sem índice, políticas com `auth.uid()` recalculado por linha, políticas permissivas duplicadas ou índices duplicados. Os avisos restantes são apenas de índices ainda não utilizados, esperado enquanto o banco de produção continua praticamente vazio.

Não remover índices apenas porque aparecem como "unused" antes de existir tráfego real suficiente para medir uso.
