import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function baseUrl(environment: string) {
  if (environment === "production") return "https://api.asaas.com/v3";
  if (environment === "sandbox") return "https://api-sandbox.asaas.com/v3";
  throw new Error("ASAAS_ENVIRONMENT inválido.");
}
async function asaas(path: string, apiKey: string) {
  const response = await fetch(baseUrl(Deno.env.get("ASAAS_ENVIRONMENT") || "") + path, {
    method: "GET",
    signal: AbortSignal.timeout(25000),
    headers: { "access_token": apiKey, "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Não foi possível consultar o pagamento no Asaas.");
  return body;
}
const cents = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Valor recebido do Asaas inválido.");
  return Math.round(n * 100);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "";
  const receivedToken = request.headers.get("asaas-access-token") || "";
  if (expectedToken.length < 32 || expectedToken.length > 255 || !constantTimeEqual(expectedToken, receivedToken)) {
    return json({ error: "Webhook não autenticado." }, 401);
  }

  const environment = Deno.env.get("ASAAS_ENVIRONMENT") || "";
  if (!["sandbox", "production"].includes(environment)) return json({ error: "Ambiente Asaas não configurado." }, 503);

  let event: any;
  try {
    const raw = await request.text();
    if (raw.length > 128000) return json({ error: "Payload muito grande." }, 413);
    event = JSON.parse(raw);
  } catch {
    return json({ error: "Payload JSON inválido." }, 400);
  }

  const eventId = event?.id;
  const eventType = event?.event;
  if (typeof eventId !== "string" || eventId.length < 8 || eventId.length > 180 ||
      typeof eventType !== "string" || eventType.length > 100) {
    return json({ error: "Evento Asaas inválido." }, 400);
  }

  const payloadRedacted = {
    id: eventId,
    event: eventType,
    paymentId: typeof event?.payment?.id === "string" ? event.payment.id : null,
    subscriptionId: typeof event?.payment?.subscription === "string"
      ? event.payment.subscription
      : (typeof event?.subscription?.id === "string" ? event.subscription.id : null),
    dateCreated: event?.dateCreated || null,
  };

  const { data: shouldProcess, error: persistError } = await admin.rpc("edge_record_asaas_webhook", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_environment: environment,
    p_payload: payloadRedacted,
  });
  if (persistError) return json({ error: "Não foi possível persistir o evento." }, 500);
  if (shouldProcess === false) return json({ received: true, duplicate: true }, 200);

  try {
    const paymentId = event?.payment?.id;
    const subscriptionId = event?.payment?.subscription || event?.subscription?.id;

    if (eventType === "SUBSCRIPTION_INACTIVATED" || eventType === "SUBSCRIPTION_DELETED") {
      if (typeof subscriptionId === "string") {
        await admin.from("restaurant_subscriptions")
          .update({ status: "canceled", canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("external_provider", "asaas")
          .eq("external_subscription_id", subscriptionId);
      }
    } else if (eventType === "PAYMENT_SPLIT_DONE" && typeof paymentId === "string") {
      const { error } = await admin.rpc("edge_mark_asaas_split_done", { p_provider_payment_id: paymentId });
      if (error) throw new Error("Não foi possível conciliar a liquidação do Split.");
    } else if ((eventType === "PAYMENT_RECEIVED" || eventType === "PAYMENT_OVERDUE") && typeof paymentId === "string") {
      if (typeof subscriptionId === "string") {
        const { data: subscription, error: subscriptionError } = await admin.from("restaurant_subscriptions")
          .select("id,external_subscription_id,checkout_external_reference")
          .eq("external_provider", "asaas")
          .eq("external_subscription_id", subscriptionId)
          .maybeSingle();
        if (subscriptionError) throw new Error("Não foi possível localizar a assinatura.");
        if (subscription) {
          const rootKey = Deno.env.get("ASAAS_API_KEY") || "";
          if (rootKey.length < 20) throw new Error("Chave principal Asaas não configurada.");
          const authoritative = await asaas(`/payments/${encodeURIComponent(paymentId)}`, rootKey);
          const paymentStatus = String(authoritative.status || "");
          if (authoritative.subscription !== subscriptionId ||
              authoritative.externalReference !== subscription.checkout_external_reference) {
            throw new Error("A cobrança não corresponde à assinatura registrada no PratoPronto.");
          }
          const amountCents = cents(authoritative.value);
          const { error } = await admin.rpc("edge_apply_subscription_payment", {
            p_provider_subscription_id: subscriptionId,
            p_provider_payment_id: paymentId,
            p_amount_cents: amountCents,
            p_payment_status: paymentStatus,
            p_paid_at: authoritative.paymentDate || authoritative.clientPaymentDate || null,
          });
          if (error) throw new Error("Não foi possível atualizar a assinatura após o evento de cobrança.");
        }
      } else {
        const { data: localPayment, error: lookupError } = await admin.rpc("edge_lookup_asaas_payment", {
          p_provider_payment_id: paymentId,
        });
        if (lookupError) throw new Error("Não foi possível localizar o pagamento do pedido.");
        if (localPayment?.purpose === "order" && localPayment.restaurantId) {
          if (localPayment.environment !== environment) throw new Error("Ambiente da cobrança diverge do ambiente configurado.");
          const { data: secretRows, error: secretError } = await admin.rpc("edge_get_gateway_secret", {
            p_restaurant_id: localPayment.restaurantId,
            p_provider: "asaas",
            p_environment: environment,
          });
          if (secretError) throw new Error("Não foi possível recuperar a credencial do recebedor.");
          const secret = Array.isArray(secretRows) ? secretRows[0] : secretRows;
          if (!secret?.api_key) throw new Error("Credencial Asaas do recebedor indisponível.");
          const authoritative = await asaas(`/payments/${encodeURIComponent(paymentId)}`, secret.api_key);
          if (eventType === "PAYMENT_RECEIVED") {
            if (authoritative.status !== "RECEIVED") throw new Error("O Asaas ainda não confirmou o recebimento efetivo.");
            if (authoritative.externalReference !== localPayment.orderId) throw new Error("Referência externa não corresponde ao pedido.");
            const amountCents = cents(authoritative.value);
            const netCents = authoritative.netValue == null ? amountCents : cents(authoritative.netValue);
            const feeCents = Math.max(0, amountCents - netCents);
            const { error } = await admin.rpc("edge_mark_order_paid", {
              p_provider_payment_id: paymentId,
              p_amount_cents: amountCents,
              p_gateway_fee_cents: feeCents,
            });
            if (error) throw new Error("Não foi possível confirmar o pedido no PratoPronto.");
          }
        }
      }
    }

    await admin.rpc("edge_finish_asaas_webhook", {
      p_event_id: eventId, p_environment: environment, p_status: "processed", p_error: null,
    });
    return json({ received: true, processed: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar evento.";
    await admin.rpc("edge_finish_asaas_webhook", {
      p_event_id: eventId, p_environment: environment, p_status: "failed", p_error: message,
    });
    return json({ error: "Evento recebido, mas a conciliação falhou. O Asaas poderá reenviar." }, 500);
  }
});
