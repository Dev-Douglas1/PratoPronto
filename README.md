# PratoPronto — versão Expo / React Native

Esta branch **expo** é a versão móvel do PratoPronto. A branch **main** continua sendo o site/PWA React + Vite e não foi substituída.

## Abrir no Expo

O projeto está na raiz desta branch, com `App.js`, `app.json` e `package.json` de Expo SDK 57.

```bash
git checkout expo
npm install
npx expo start
```

Para Android, abra o QR Code no Expo Go. Para validar dependências:

```bash
npx expo-doctor
```

## Expo Snack

Importe a branch `expo` do repositório. Se o importador do Snack ignorar a branch e usar sempre a branch padrão, baixe a branch `expo` como ZIP e use **Import project / Upload** no Snack.

A aplicação usa apenas componentes React Native nas telas móveis; não usa `react-dom`, `BrowserRouter`, CSS tradicional ou `localStorage`.

## Supabase

O projeto usa:

- URL: `https://hllvhzzbkjmhxymuwqis.supabase.co`
- chave **publishable** no cliente;
- AsyncStorage para sessão;
- e-mail/senha + OTP de 6 dígitos;
- telefone + OTP SMS;
- Google OAuth;
- perfis, catálogo, carrinho, pedidos, empresa e Piloto Parceiro.

A publishable key é pública por definição. Nunca adicione `service_role`, `sb_secret_*`, SMTP Key, Google Client Secret ou credenciais Firebase ao app.

## Redirects do Supabase

Para build instalado, autorize no Supabase:

```text
pratopronto://auth/callback
pratopronto://reset-password
```

No Expo Go/Snack, o redirect gerado pode ser `exp://...`. O app mostra o redirect usado quando o Google falha; adicione esse endereço em **Authentication > URL Configuration > Redirect URLs** do Supabase para testar.

## Observações

O app móvel reutiliza o mesmo banco Supabase e as mesmas políticas RLS da versão web. Pagamento online continua dependente da configuração do backend; a opção de maquininha na entrega funciona pelo mesmo fluxo de quote/checkout.
