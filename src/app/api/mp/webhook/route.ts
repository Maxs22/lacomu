import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unwrapOne } from "@/lib/supabase/embed";
import {
  getAppAccessToken,
  getPayment,
  isValidWebhookSignature,
} from "@/lib/mercadopago";

/**
 * Mercado Pago pega acá cuando cambia el estado de un pago.
 *
 * Import: devolver 200 significa "recibido, no reintentes". Eso está bien
 * cuando decidimos A PROPÓSITO no confirmar algo (mismatch real), pero
 * NUNCA cuando fue un error transitorio nuestro (API de MP caída,
 * Supabase con un hipo) — ahí hay que devolver un status de error para
 * que MP reintente, si no un pago approved puede quedar pending para
 * siempre sin que nadie se entere.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const queryId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const queryType = url.searchParams.get("type") ?? url.searchParams.get("topic");

  let bodyPaymentId: string | null = null;
  try {
    const body = await request.json();
    if (body?.data?.id) bodyPaymentId = String(body.data.id);
  } catch {
    // sin body JSON, seguimos con lo que haya en la query
  }

  const paymentId = bodyPaymentId ?? queryId;
  const isPaymentEvent = queryType === "payment" || Boolean(bodyPaymentId);

  if (!isPaymentEvent || !paymentId) {
    // otros tipos de notificación (merchant_order, etc.) no nos interesan
    return NextResponse.json({ ok: true });
  }

  const validSignature = isValidWebhookSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    // el manifest de la firma se calcula sobre el data.id de la query,
    // no sobre el del body — hay que usar exactamente ese, no paymentId.
    dataId: queryId,
  });

  if (!validSignature) {
    // Esto es determinístico, no transitorio: si falla ahora, va a
    // seguir fallando en un retry. 200 está bien acá.
    return NextResponse.json({ ok: true });
  }

  let payment;
  try {
    const appToken = await getAppAccessToken();
    payment = await getPayment(paymentId, appToken);
  } catch (err) {
    console.error("MP webhook: fallo transitorio consultando el pago", err);
    return NextResponse.json({ error: "No se pudo consultar el pago." }, { status: 502 });
  }

  if (!payment.external_reference) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  let contribution;
  try {
    const { data, error } = await admin
      .from("contributions")
      .select(
        "id, amount, currency, campaign_id, campaigns(owner:profiles!owner_id(mp_connections(mp_user_id)))",
      )
      .eq("id", payment.external_reference)
      .single();
    if (error) throw error;
    contribution = data;
  } catch (err) {
    console.error("MP webhook: fallo transitorio leyendo la contribution", err);
    return NextResponse.json({ error: "No se pudo leer la contribución." }, { status: 502 });
  }

  if (!contribution) {
    // El external_reference no corresponde a ninguna contribution nuestra
    // — esto sí es definitivo, reintentar no cambia nada.
    return NextResponse.json({ ok: true });
  }

  // Todos estos embeds vienen como objeto en runtime (to-one real, ya sea
  // porque la FK vive acá o porque el otro lado tiene una unique/PK) —
  // ver src/lib/supabase/embed.ts, verificado contra la base real.
  const campaign = unwrapOne(contribution.campaigns);
  const owner = unwrapOne(campaign?.owner);
  const ownerMpUserId = unwrapOne(owner?.mp_connections)?.mp_user_id;

  const amountMatches =
    Math.abs(Number(payment.transaction_amount) - Number(contribution.amount)) < 0.01;
  const currencyMatches = payment.currency_id === contribution.currency;
  const collectorMatches =
    !ownerMpUserId || String(payment.collector_id) === ownerMpUserId;

  // A propósito NO exigimos que la campaña siga 'published': el donante
  // pudo pagar mientras estaba publicada y que el dueño la cierre antes
  // de que llegue esta notificación. Eso no invalida un cobro real — si
  // lo exigiéramos, quedaría plata cobrada y nunca acreditada.
  if (!amountMatches || !currencyMatches || !collectorMatches) {
    // Esto sí es un mismatch real contra lo que esperábamos, no un error
    // transitorio — no tiene sentido que MP reintente lo mismo. Queda en
    // el estado que tenía (normalmente 'pending') para reconciliar a
    // mano. No hay infra de alertas todavía, al menos queda en los logs.
    console.error("MP webhook: mismatch de reconciliación", {
      paymentId: payment.id,
      contributionId: contribution.id,
      amountMatches,
      currencyMatches,
      collectorMatches,
    });
    return NextResponse.json({ ok: true });
  }

  const status =
    payment.status === "approved"
      ? "confirmed"
      : payment.status === "rejected" || payment.status === "cancelled"
        ? "failed"
        : "pending";

  const { error: updateError } = await admin
    .from("contributions")
    .update({
      status,
      mp_payment_id: String(payment.id),
      confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
    })
    .eq("id", contribution.id);

  if (updateError) {
    console.error("MP webhook: fallo transitorio guardando el estado", updateError);
    return NextResponse.json({ error: "No se pudo guardar el estado." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
