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
function refundSummary(payment: any) {
  const refunds = Array.isArray(payment?.refunds) ? payment.refunds : [];
  const doneCents = refunds.filter((item: any) => item?.status === "DONE")
    .reduce((sum: number, item: any) => sum + Math.round(Number(item.value || 0) * 100), 0);
  return {
    doneCents,
    pending: refunds.some((item: any) => item?.status === "PENDING"),
    cancelled: refunds.some((item: any) => item?.status === "CANCELLED"),
    splitPending: refunds.some((item: any) => item?.status !== "CANCELLED" &&
      Array.isArray(item?.refundedSplits) &&
      item.refundedSplits.some((split: any) => split?.done !== true)),
  };
}
function isFullyRefunded(payment: any) {
  const totalCents = Math.round(Number(payment?.value || 0) * 100);
  const summary = refundSummary(payment);
  return totalCents > 0 && summary.doneCents >= totalCents && !summary.splitPending;
}
function assertOrderReference(payment: any, orderId: string) {
  if (payment?.externalReference !== orderId) {
    throw new Error("A referência do pagamento no Asaas não corresponde ao pedido.");
  }
}
function baseUrl(environment: string) {
  if (environment === "production") return "https://api.asaas.com/v3";
  if (environment === "sandbox") return "https://api-sandbox.asaas.com/v3";
  throw new Error("Ambiente Asaas inválido.");
}
async function asaas(path: string, environment: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(baseUrl(environment) + path, {
    ...init, signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/json", "access_token": apiKey, ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof body?.errors?.[0]?.description === "string"
      ? body.errors[0].description : "O Asaas não concluiu a operação.") as Error & { status?: number };
    error.status = response.status; throw error;
  }
  return body;
}
async function finalize(orderId: string, status: string, reference: string | null, error: string | null = null) {
  const { data, error: rpcError } = await admin.rpc("edge_finalize_asaas_refund", {
    p_order_id: orderId, p_provider_status: status, p_provider_reference: reference, p_error: error,
  });
  if (rpcError) throw new Error("Não foi possível atualizar o status financeiro no PratoPronto.");
  return data;
}
async function gatewayKey(restaurantId: string, environment: string) {
  const { data, error } = await admin.rpc("edge_get_gateway_secret", {
    p_restaurant_id: restaurantId, p_provider: "asaas", p_environment: environment,
  });
  if (error) throw new Error("Não foi possível recuperar a credencial segura do recebedor.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.api_key || row.onboarding_status !== "active") throw new Error("Recebedor Asaas não está ativo.");
  return row.api_key as string;
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
    if (raw.length > 8000) return json({ error: { message: "Solicitação muito grande." } }, 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { return json({ error: { message: "JSON inválido." } }, 400); }
    const orderId = body?.orderId;
    if (typeof orderId !== "string" || !uuid.test(orderId)) return json({ error: { message: "Pedido inválido." } }, 400);

    const { data: prepared, error: prepareError } = await admin.rpc("edge_prepare_asaas_refund", { p_order_id: orderId, p_actor_id: user.id });
    if (prepareError) return json({ error: { message: "A solicitação não está aprovada para cancelamento ou estorno." } }, 409);
    if (prepared?.noPayment || prepared?.alreadyRefunded) return json({ status: prepared.status || "cancelado_sem_cobranca", completed: true });
    if (!prepared?.providerPaymentId || !prepared?.restaurantId || !prepared?.environment) {
      return json({ status: "aguardando_referencia", processing: true }, 202);
    }

    const apiKey = await gatewayKey(prepared.restaurantId, prepared.environment);
    const paymentId = encodeURIComponent(prepared.providerPaymentId);
    // A previous timeout is reconciled by GET. Never repeat a potentially accepted refund request.
    if (prepared.inProgress) {
      const current = await asaas("/payments/" + paymentId, prepared.environment, apiKey);
      assertOrderReference(current, orderId);
      if (isFullyRefunded(current)) return json({ ...await finalize(orderId, "refunded", prepared.providerPaymentId), reconciled: true });
      if (current.status === "CANCELLED" || current.status === "CANCELED") return json({ ...await finalize(orderId, "cancelled", prepared.providerPaymentId), reconciled: true });
      const summary = refundSummary(current);
      if (summary.cancelled && !summary.pending && summary.doneCents === 0) {
        return json({ ...await finalize(orderId, "failed", prepared.providerPaymentId, "O Asaas cancelou ou negou o estorno."), reconciled: true });
      }
      return json({ ...await finalize(orderId, "processing", prepared.providerPaymentId), processing: true }, 202);
    }

    const current = await asaas("/payments/" + paymentId, prepared.environment, apiKey);
    assertOrderReference(current, orderId);
    if (isFullyRefunded(current)) return json({ ...await finalize(orderId, "refunded", prepared.providerPaymentId), reconciled: true });
    if (current.status === "CANCELLED" || current.status === "CANCELED") return json({ ...await finalize(orderId, "cancelled", prepared.providerPaymentId), reconciled: true });
    const existingRefunds = refundSummary(current);
    if (existingRefunds.pending || existingRefunds.doneCents > 0) {
      return json({ ...await finalize(orderId, "processing", prepared.providerPaymentId), processing: true }, 202);
    }
    if (["RECEIVED", "CONFIRMED"].includes(current.status)) {
      try {
        await asaas("/payments/" + paymentId + "/refund", prepared.environment, apiKey, {
          method: "POST",
          body: JSON.stringify({ description: String(prepared.reason || "Estorno aprovado pelo PratoPronto").slice(0, 255) }),
        });
        const refreshed = await asaas("/payments/" + paymentId, prepared.environment, apiKey);
        assertOrderReference(refreshed, orderId);
        if (isFullyRefunded(refreshed)) return json({ ...await finalize(orderId, "refunded", prepared.providerPaymentId), completed: true });
        const summary = refundSummary(refreshed);
        if (summary.cancelled && !summary.pending && summary.doneCents === 0) {
          const result = await finalize(orderId, "failed", prepared.providerPaymentId, "O Asaas negou ou cancelou o estorno.");
          return json({ ...result, error: { message: "O Asaas não confirmou o estorno." } }, 422);
        }
        return json({ ...await finalize(orderId, "processing", prepared.providerPaymentId), processing: true }, 202);
      } catch (error) {
        const status = (error as any)?.status;
        if (status && status >= 400 && status < 500) {
          const result = await finalize(orderId, "failed", prepared.providerPaymentId, String((error as Error).message).slice(0, 500));
          return json({ ...result, error: { message: "O Asaas recusou o estorno. Corrija a pendência e tente novamente." } }, 422);
        }
        return json({ status: "estorno_em_processamento", processing: true }, 202);
      }
    }
    if (["PENDING", "OVERDUE"].includes(current.status)) {
      try {
        await asaas("/payments/" + paymentId, prepared.environment, apiKey, { method: "DELETE" });
        return json({ ...await finalize(orderId, "cancelled", prepared.providerPaymentId), completed: true });
      } catch (error) {
        const status = (error as any)?.status;
        if (status && status >= 400 && status < 500) {
          const result = await finalize(orderId, "failed", prepared.providerPaymentId, String((error as Error).message).slice(0, 500));
          return json({ ...result, error: { message: "O Asaas recusou o cancelamento da cobrança. Tente novamente." } }, 422);
        }
        return json({ status: "cancelamento_em_processamento", processing: true }, 202);
      }
    }
    return json({ ...await finalize(orderId, "processing", prepared.providerPaymentId), processing: true }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível processar o estorno.";
    return json({ error: { message } }, 503);
  }
});
