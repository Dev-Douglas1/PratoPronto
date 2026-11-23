import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const fail = (message: string, status = 400) => json({ error: { message } }, status);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function brDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(Date.UTC(Number(v.year), Number(v.month) - 1, Number(v.day) + offsetDays))
    .toISOString().slice(0, 10);
}
function baseUrl(environment: string) {
  if (environment === "production") return "https://api.asaas.com/v3";
  if (environment === "sandbox") return "https://api-sandbox.asaas.com/v3";
  throw new Error("ASAAS_ENVIRONMENT deve ser sandbox ou production.");
}
async function asaas(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(baseUrl(Deno.env.get("ASAAS_ENVIRONMENT") || "") + path, {
    ...init,
    signal: AbortSignal.timeout(25000),
    headers: {
      "Content-Type": "application/json",
      "access_token": apiKey,
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.errors?.[0]?.description === "string"
      ? body.errors[0].description
      : "O Asaas recusou a operação.";
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body;
}
async function getAsaasKey(restaurantId: string, environment: string) {
  const { data, error } = await admin.rpc("edge_get_gateway_secret", {
    p_restaurant_id: restaurantId,
    p_provider: "asaas",
    p_environment: environment,
  });
  if (error) throw new Error("Não foi possível recuperar a credencial segura do recebedor.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.api_key || row.onboarding_status !== "active") {
    throw new Error("O recebedor Asaas ainda não está aprovado e habilitado.");
  }
  return row;
}
async function pixFor(paymentId: string, apiKey: string) {
  return await asaas(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`, apiKey);
}
function trustedAsaasInvoice(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" &&
      ["www.asaas.com", "asaas.com", "sandbox.asaas.com", "www.asaas.com.br", "asaas.com.br"].includes(url.hostname) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return fail("Use POST.", 405);

  try {
    const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return fail("Entre na sua conta para continuar.", 401);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.id || !user.email_confirmed_at) return fail("Sessão inválida ou e-mail não confirmado.", 401);

    const raw = await request.text();
    if (raw.length > 12000) return fail("Solicitação muito grande.", 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { return fail("JSON inválido."); }
    const orderId = body?.orderId;
    if (typeof orderId !== "string" || !uuid.test(orderId)) return fail("Pedido inválido.");

    const environment = Deno.env.get("ASAAS_ENVIRONMENT") || "";
    if (!["sandbox", "production"].includes(environment)) {
      return fail("Integração Asaas ainda não configurada. Defina ASAAS_ENVIRONMENT e as credenciais no Supabase.", 503);
    }
    const platformWalletId = Deno.env.get("ASAAS_PLATFORM_WALLET_ID") || "";
    if (!uuid.test(platformWalletId)) return fail("A carteira principal do Split Asaas ainda não foi configurada.", 503);

    const { data: order, error: orderError } = await admin.from("orders")
      .select("id,user_id,restaurant_id,payment_method,payment_status,status,total_cents,data")
      .eq("id", orderId).maybeSingle();
    if (orderError || !order || order.user_id !== user.id) return fail("Pedido não encontrado para esta conta.", 404);
    if (!["pix", "credit_card"].includes(order.payment_method)) return fail("Este pedido não foi criado para pagamento online.");
    const billingType = order.payment_method === "credit_card" ? "CREDIT_CARD" : "PIX";
    if (order.status !== "aguardando_pagamento" || order.payment_status !== "pending") {
      return fail("Este pedido não está aguardando pagamento.", 409);
    }

    const { data: prepared, error: prepareError } = await admin.rpc("edge_prepare_order_payment", {
      p_order_id: orderId,
      p_environment: environment,
    });
    if (prepareError) return fail("Não foi possível reservar a tentativa de pagamento.", 409);
    if (prepared?.inProgress) {
      return fail("Já existe uma tentativa de cobrança em processamento. Não inicie outra; a conciliação precisa verificar a primeira.", 409);
    }

    const gateway = await getAsaasKey(order.restaurant_id, environment);
    if (!gateway.wallet_id || gateway.wallet_id === platformWalletId) {
      return fail("A carteira recebedora do restaurante é inválida ou coincide com a carteira da plataforma.", 409);
    }
    const paymentId = prepared.paymentId;
    let providerPaymentId = prepared.providerPaymentId || null;
    let providerCustomerId = prepared.providerCustomerId || null;

    if (providerPaymentId) {
      if (billingType === "CREDIT_CARD") {
        const existing = await asaas(`/payments/${encodeURIComponent(providerPaymentId)}`, gateway.api_key);
        if (existing.externalReference !== orderId) return fail("A referência do pagamento no Asaas não corresponde ao pedido.", 409);
        if (!trustedAsaasInvoice(existing.invoiceUrl)) return fail("A fatura hospedada do Asaas não está disponível para esta tentativa.", 409);
        return json({ orderId, paymentId, providerPaymentId, status: existing.status || prepared.status, billingType, checkoutUrl: existing.invoiceUrl });
      }
      const pix = await pixFor(providerPaymentId, gateway.api_key);
      return json({
        orderId, paymentId, providerPaymentId, status: prepared.status,
        pix: { payload: pix.payload, encodedImage: pix.encodedImage, expirationDate: pix.expirationDate },
      });
    }

    if (!prepared.created) return fail("Tentativa de pagamento já existe e precisa ser conciliada antes de repetir.", 409);

    const customer = order.data?.cliente || {};
    if (!providerCustomerId) {
      const createdCustomer = await asaas("/customers", gateway.api_key, {
        method: "POST",
        body: JSON.stringify({
          name: String(customer.nome || "Cliente PratoPronto").slice(0, 100),
          email: typeof customer.email === "string" ? customer.email : undefined,
          mobilePhone: typeof customer.telefone === "string" ? customer.telefone.replace(/\D/g, "") : undefined,
          externalReference: `pratopronto-user:${user.id}`,
        }),
      });
      providerCustomerId = createdCustomer.id;
      if (typeof providerCustomerId !== "string" || !providerCustomerId.startsWith("cus_")) {
        throw new Error("O Asaas não retornou um identificador válido de cliente.");
      }
      const { error: customerSaveError } = await admin.rpc("edge_set_order_payment_customer", {
        p_payment_id: paymentId,
        p_customer_id: providerCustomerId,
      });
      if (customerSaveError) throw new Error("Não foi possível registrar o cliente do pagamento. A cobrança ainda não foi criada.");
    }

    const commissionCents = Number(prepared.commissionCents || 0);
    const split = commissionCents > 0
      ? [{ walletId: platformWalletId, fixedValue: commissionCents / 100 }]
      : undefined;

    let createdPayment: any;
    try {
      createdPayment = await asaas("/payments", gateway.api_key, {
        method: "POST",
        body: JSON.stringify({
          customer: providerCustomerId,
          billingType,
          value: Number(prepared.amountCents) / 100,
          dueDate: brDate(billingType === "CREDIT_CARD" ? 3 : 0),
          description: `Pedido PratoPronto #${orderId.slice(-8)}`,
          externalReference: orderId,
          ...(split ? { split } : {}),
        }),
      });
    } catch (error) {
      const status = (error as any)?.status;
      if (status && status >= 400 && status < 500) {
        await admin.rpc("edge_fail_order_payment", {
          p_payment_id: paymentId,
          p_error: String((error as Error).message).slice(0, 500),
        });
      }
      throw error;
    }

    providerPaymentId = createdPayment?.id;
    if (typeof providerPaymentId !== "string" || !providerPaymentId.startsWith("pay_")) {
      throw new Error("O Asaas não retornou o identificador da cobrança. A tentativa foi preservada para conciliação.");
    }

    const { error: saveError } = await admin.rpc("edge_set_order_payment_provider", {
      p_payment_id: paymentId,
      p_provider_payment_id: providerPaymentId,
      p_metadata: {
        platformWalletId,
        commissionCents,
        asaasInvoiceUrl: typeof createdPayment.invoiceUrl === "string" ? createdPayment.invoiceUrl : null,
        billingType,
      },
    });
    if (saveError) throw new Error("Cobrança criada no Asaas, mas a referência local não foi gravada. Não repita a cobrança; concilie pelo externalReference.");

    if (billingType === "CREDIT_CARD") {
      if (!trustedAsaasInvoice(createdPayment.invoiceUrl)) {
        throw new Error("O Asaas criou a cobrança, mas não retornou uma fatura hospedada válida. A referência foi preservada para conciliação.");
      }
      return json({
        orderId, paymentId, providerPaymentId, status: createdPayment.status || "PENDING",
        billingType, checkoutUrl: createdPayment.invoiceUrl,
      }, 201);
    }
    const pix = await pixFor(providerPaymentId, gateway.api_key);
    return json({
      orderId, paymentId, providerPaymentId, status: createdPayment.status || "PENDING",
      pix: { payload: pix.payload, encodedImage: pix.encodedImage, expirationDate: pix.expirationDate },
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar o pagamento.";
    return fail(message, (error as any)?.status && (error as any).status >= 400 && (error as any).status < 500 ? 422 : 503);
  }
});
