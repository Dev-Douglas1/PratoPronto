# Corrigir o acesso ao cardápio e à empresa

## O que foi identificado

As telas consultam `productSettings`, `orders`, `refundRequests` e `reviews` no Firestore. O erro `permission-denied` é uma recusa do Firebase; não é um problema das fotos. Também havia dois defeitos de apresentação: o erro do cardápio escondia todas as imagens e o erro de qualquer coleção escondia todas as áreas da empresa.

O app agora mantém os produtos visíveis para consulta, bloqueia adição enquanto preço/disponibilidade não forem confirmados e permite tentar atualizar. O painel trata cada coleção separadamente, mantém Configurações acessível e explica qual consulta foi recusada.

## Publicar as regras testadas

No Firebase Console do projeto `pratopronto-d861d`, abra **Firestore Database → Regras**, substitua o conteúdo pela versão de `firestore.rules` deste projeto e clique em **Publicar**.

Alternativamente, na pasta que contém esta versão dos arquivos, com a conta responsável autenticada na CLI:

```sh
npx firebase deploy --only firestore:rules --project pratopronto-d861d
```

As regras permitem leitura do cardápio por contas verificadas e leitura de pedidos pelo dono ou administrador verificado. Não liberam escrita direta em pedidos nem acesso público a nomes e endereços.

## Conferir a conta da empresa

Em Authentication → Users, confira o UID e o e-mail verificado da conta da empresa. Em Firestore, o documento `admins/UID_DESSA_CONTA` deve ter `role` (texto) igual a `restaurant_admin`. Não use o e-mail como ID desse documento. Essa alteração deve ser feita pelo responsável no console, nunca por uma tela aberta ao cliente. Se o registro já estiver correto, preserve-o.

Saia e entre novamente no app, ou use **Atualizar acesso**. Se a leitura continuar negada, confira se App Check está sendo exigido no Firestore e se o domínio do app está registrado no provedor configurado; não desative a proteção para contornar a falha.

## Limites da validação desta correção

As regras foram verificadas no emulador com clientes, conta não verificada e administrador. Não havia uma sessão administrativa do Firebase disponível neste ambiente para inspecionar ou publicar as regras em produção. A correção do site não publica automaticamente regras ou Cloud Functions no Firebase.

O aviso sobre atendimento depende de `appStorefront`. Se esse serviço continuar indisponível, confira a publicação das Cloud Functions e as configurações da loja antes de aceitar pedidos reais. Nenhum pagamento foi feito neste diagnóstico.
