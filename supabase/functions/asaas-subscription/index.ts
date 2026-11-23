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

function brDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}
function baseUrl(environment: string) {
  if (environment === "production") return "https://api.asaas.com/v3";
  if (environment === "sandbox") return "https://api-sandbox.asaas.com/v3";
  throw new Error("ASAAS_ENVIRONMENT deve ser sandbox ou production.");
}
async function asaas(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(baseUrl(Deno.env.get("ASAAS_ENVIRONMENT") || "") + path, {
    ...init,
    signal: AbortSignal.timeout(60000),
    headers: { "Content-Type": "application/json", "access_token": apiKey, ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.errors?.[0]?.description === "string" ? body.errors[0].description : "O Asaas recusou a operação.";
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body;
}
async function currentPix(subscriptionId: string, apiKey: string) {
  const list = await asaas(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=10&offset=0`, apiKey);
  const payments = Array.isArray(list?.data) ? list.data : [];
  const pending = payments.find((p: any) => p.status === "PENDING" && p.billingType === "PIX");
  if (!pending?.id) return null;
  const qr = await asaas(`/payments/${encodeURIComponent(pending.id)}/pixQrCode`, apiKey);
  return {
    paymentId: pending.id,
    dueDate: pending.dueDate,
    status: pending.status,
    pix: { payload: qr.payload, encodedImage: qr.encodedImage, expirationDate: qr.expirationDate },
  };
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
    if (raw.length > 12000) return json({ error: { message: "Solicitação muito grande." } }, 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { return json({ error: { message: "JSON inválido." } }, 400); }
    const restaurantId = body?.restaurantId;
    if (typeof restaurantId !== "string" || !uuid.test(restaurantId)) return json({ error: { message: "Empresa inválida." } }, 400);
    if (body?.acceptTerms !== true || body?.consentTermsVersion !== "pratopronto-subscription-v1") {
      return json({ error: { message: "É necessário aceitar expressamente a mensalidade de R$ 49,90 e a recorrência mensal." } }, 400);
    }
    if (body?.billingType !== "PIX") {
      return json({ error: { message: "Nesta primeira versão, a recorrência está disponível por cobrança Pix mensal. Cartão recorrente exige fluxo de tokenização." } }, 400);
    }

    const environment = Deno.env.get("ASAAS_ENVIRONMENT") || "";
    const apiKey = Deno.env.get("ASAAS_API_KEY") || "";
    if (!["sandbox", "production"].includes(environment) || apiKey.length < 20) {
      return json({ error: { message: "Credencial principal Asaas ainda não configurada no Supabase." } }, 503);
    }

    const { data: membership, error: memberError } = await admin.from("restaurant_members")
      .select("role,active").eq("restaurante_id", restaurantId).eq("profile_id", user.id).eq("active", true).maybeSingle();
    if (memberError || !membership || membership.role !== "owner") {
      return json({ error: { message: "Somente o proprietário ativo da empresa pode contratar a assinatura." } }, 403);
    }

    const { data: restaurant, error: restaurantError } = await admin.from("restaurantes")
      .select("id,nome,cnpj,cpf,ativo,account_status").eq("id", restaurantId).maybeSingle();
    if (restaurantError || !restaurant || restaurant.ativo !== true || restaurant.account_status !== "active") {
      return json({ error: { message: "Empresa inexistente, suspensa ou bloqueada." } }, 404);
    }

    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("nome,email,telefone").eq("id", user.id).single();
    if (profileError || !profile?.email) return json({ error: { message: "Complete o e-mail do proprietário antes de contratar." } }, 400);

    const { data: registration } = await admin.from("company_registration_requests")
      .select("legal_name,cnpj,cpf,contact_phone,status")
      .eq("restaurant_id", restaurantId).eq("status", "approved")
      .order("reviewed_at", { ascending: false }).limit(1).maybeSingle();
    const document = String(registration?.cnpj || registration?.cpf || restaurant.cnpj || restaurant.cpf || "").replace(/\D/g, "");
    if (![11, 14].includes(document.length)) {
      return json({ error: { message: "O cadastro aprovado da empresa precisa ter CPF ou CNPJ válido para cobrança." } }, 400);
    }

    const { data: plan, error: planError } = await admin.from("subscription_plans")
      .select("id,monthly_price_cents,is_active").eq("code", "profissional").single();
    if (planError || !plan?.is_active || plan.monthly_price_cents !== 4990) {
      return json({ error: { message: "Plano Profissional de R$ 49,90 não está configurado corretamente." } }, 503);
    }

    const { data: current, error: subscriptionError } = await admin.from("restaurant_subscriptions")
      .select("*").eq("restaurant_id", restaurantId).maybeSingle();
    if (subscriptionError || !current) return json({ error: { message: "Assinatura da empresa não encontrada." } }, 409);

    if (current.plan_id === plan.id && current.status === "active" && current.external_subscription_id) {
      const existing = await currentPix(current.external_subscription_id, apiKey).catch(() => null);
      return json({ status: "active", subscriptionId: current.external_subscription_id, alreadyActive: true, currentPayment: existing });
    }
    if (current.external_provider === "asaas" && current.external_subscription_id) {
      const existing = await currentPix(current.external_subscription_id, apiKey).catch(() => null);
      return json({ status: "awaiting_first_payment", subscriptionId: current.external_subscription_id, alreadyCreated: true, currentPayment: existing });
    }
    if (current.checkout_external_reference && !current.external_subscription_id) {
      return json({ error: { message: "Existe uma tentativa de contratação em conciliação. Não crie outra assinatura até verificar o Asaas." } }, 409);
    }

    const externalReference = `pratopronto-subscription:${restaurantId}:${crypto.randomUUID()}`;
    const { error: reserveError } = await admin.from("restaurant_subscriptions").update({
      external_provider: "asaas",
      billing_type: "PIX",
      checkout_external_reference: externalReference,
      consented_at: new Date().toISOString(),
      consent_terms_version: "pratopronto-subscription-v1",
    }).eq("restaurant_id", restaurantId);
    if (reserveError) return json({ error: { message: "Não foi possível registrar o consentimento da assinatura." } }, 500);

    let customerId = current.external_customer_id as string | null;
    try {
      if (!customerId) {
        const createdCustomer = await asaas("/customers", apiKey, {
          method: "POST",
          body: JSON.stringify({
            name: String(registration?.legal_name || restaurant.nome || profile.nome || "Empresa PratoPronto").slice(0, 100),
            email: profile.email,
            cpfCnpj: document,
            mobilePhone: String(registration?.contact_phone || profile.telefone || "").replace(/\D/g, "") || undefined,
            externalReference: `pratopronto-restaurant:${restaurantId}`,
          }),
        });
        customerId = createdCustomer?.id;
        if (typeof customerId !== "string" || !customerId.startsWith("cus_")) throw new Error("O Asaas não retornou o identificador do cliente.");
        await admin.from("restaurant_subscriptions").update({ external_customer_id: customerId }).eq("restaurant_id", restaurantId);
      }

      const createdSubscription = await asaas("/subscriptions", apiKey, {
        method: "POST",
        body: JSON.stringify({
          customer: customerId,
          billingType: "PIX",
          nextDueDate: brDate(),
          value: 49.90,
          cycle: "MONTHLY",
          description: "PratoPronto — Plano Profissional (R$ 49,90/mês)",
          externalReference,
        }),
      });
      const providerSubscriptionId = createdSubscription?.id;
      if (typeof providerSubscriptionId !== "string" || !providerSubscriptionId.startsWith("sub_")) {
        throw new Error("O Asaas não retornou o identificador da assinatura.");
      }

      const { error: saveError } = await admin.from("restaurant_subscriptions").update({
        external_provider: "asaas",
        external_customer_id: customerId,
        external_subscription_id: providerSubscriptionId,
        billing_type: "PIX",
        next_due_date: createdSubscription.nextDueDate || brDate(),
        last_payment_status: "PENDING",
        updated_at: new Date().toISOString(),
      }).eq("restaurant_id", restaurantId);
      if (saveError) throw new Error("Assinatura criada no Asaas, mas não foi possível salvar a referência local. Não repita; concilie pelo externalReference.");

      const firstPayment = await currentPix(providerSubscriptionId, apiKey).catch(() => null);
      return json({
        status: "awaiting_first_payment",
        subscriptionId: providerSubscriptionId,
        billingType: "PIX",
        amountCents: 4990,
        cycle: "MONTHLY",
        nextDueDate: createdSubscription.nextDueDate || brDate(),
        currentPayment: firstPayment,
        note: "A assinatura recorrente foi criada. O plano pago só será ativado após o webhook confirmar o primeiro pagamento.",
      }, 201);
    } catch (error) {
      const status = (error as any)?.status;
      if (status && status >= 400 && status < 500) {
        await admin.from("restaurant_subscriptions").update({
          external_provider: null,
          checkout_external_reference: null,
          billing_type: null,
        }).eq("restaurant_id", restaurantId).is("external_subscription_id", null);
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a assinatura.";
    const status = (error as any)?.status;
    return json({ error: { message } }, status && status >= 400 && status < 500 ? 422 : 503);
  }
});
