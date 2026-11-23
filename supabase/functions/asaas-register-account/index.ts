import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function baseUrl(environment: string) {
  if (environment === "production") return "https://api.asaas.com/v3";
  if (environment === "sandbox") return "https://api-sandbox.asaas.com/v3";
  throw new Error("ASAAS_ENVIRONMENT deve ser sandbox ou production.");
}
async function asaas(path: string, apiKey: string) {
  const response = await fetch(baseUrl(Deno.env.get("ASAAS_ENVIRONMENT") || "") + path, {
    method: "GET",
    signal: AbortSignal.timeout(20000),
    headers: { "access_token": apiKey, "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Não foi possível validar a conta Asaas informada.");
  return body;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: { message: "Use POST." } }, 405);
  try {
    const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: { message: "Entre na sua conta." } }, 401);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.id || !user.email_confirmed_at) return json({ error: { message: "Sessão inválida ou e-mail não confirmado." } }, 401);

    const raw = await request.text();
    if (raw.length > 10000) return json({ error: { message: "Solicitação muito grande." } }, 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { return json({ error: { message: "JSON inválido." } }, 400); }
    const restaurantId = body?.restaurantId;
    const apiKey = body?.apiKey;
    if (typeof restaurantId !== "string" || !uuid.test(restaurantId)) return json({ error: { message: "Empresa inválida." } }, 400);
    if (typeof apiKey !== "string" || apiKey.trim().length < 20 || apiKey.length > 500) {
      return json({ error: { message: "Chave de API Asaas inválida." } }, 400);
    }

    const environment = Deno.env.get("ASAAS_ENVIRONMENT") || "";
    if (!["sandbox", "production"].includes(environment)) {
      return json({ error: { message: "ASAAS_ENVIRONMENT ainda não foi configurado no Supabase." } }, 503);
    }

    const { data: membership } = await admin.from("restaurant_members")
      .select("role,active").eq("restaurante_id", restaurantId).eq("profile_id", user.id).eq("active", true).maybeSingle();
    if (!membership || membership.role !== "owner") return json({ error: { message: "Somente o proprietário pode vincular a conta de recebimento." } }, 403);
    const { data: restaurant } = await admin.from("restaurantes")
      .select("ativo,account_status").eq("id", restaurantId).maybeSingle();
    if (!restaurant || restaurant.ativo !== true || restaurant.account_status !== "active") {
      return json({ error: { message: "Empresa suspensa ou bloqueada não pode habilitar recebimentos." } }, 403);
    }
    const platformWalletId = Deno.env.get("ASAAS_PLATFORM_WALLET_ID") || "";
    if (!uuid.test(platformWalletId)) {
      return json({ error: { message: "Configure primeiro ASAAS_PLATFORM_WALLET_ID nos Secrets das Edge Functions." } }, 503);
    }

    const [accountStatus, wallets] = await Promise.all([
      asaas("/myAccount/status", apiKey),
      asaas("/wallets/", apiKey),
    ]);
    const walletId = typeof wallets?.walletId === "string"
      ? wallets.walletId
      : (Array.isArray(wallets?.data) ? wallets.data[0]?.walletId : null);
    if (typeof walletId !== "string" || !uuid.test(walletId)) {
      return json({ error: { message: "O Asaas não retornou um walletId válido para esta conta." } }, 422);
    }
    if (walletId === platformWalletId) {
      return json({ error: { message: "Esta é a carteira da plataforma. Informe a chave da subconta do restaurante, não a chave principal." } }, 422);
    }
    const general = String(accountStatus?.general || "");
    const onboardingStatus = general === "APPROVED" ? "active" : "under_review";
    const providerAccountId = typeof accountStatus?.id === "string" ? accountStatus.id : null;

    const { data: saved, error: saveError } = await admin.rpc("edge_store_gateway_secret", {
      p_restaurant_id: restaurantId,
      p_provider: "asaas",
      p_environment: environment,
      p_provider_account_id: providerAccountId,
      p_wallet_id: walletId,
      p_api_key: apiKey,
      p_onboarding_status: onboardingStatus,
      p_metadata: {
        accountGeneralStatus: general,
        registeredAt: new Date().toISOString(),
      },
    });
    if (saveError || !saved) return json({ error: { message: "Não foi possível armazenar a credencial no Vault." } }, 500);

    return json({
      success: true,
      onboardingStatus,
      accountGeneralStatus: general,
      walletLinked: true,
      secretStoredInVault: true,
      message: onboardingStatus === "active"
        ? "Conta Asaas aprovada e credencial armazenada com segurança."
        : "Credencial armazenada no Vault. O recebimento online será liberado após a aprovação cadastral geral no Asaas.",
    }, 200);
  } catch {
    return json({ error: { message: "Falha ao validar ou vincular a conta Asaas. Verifique a credencial e tente novamente." } }, 503);
  }
});
