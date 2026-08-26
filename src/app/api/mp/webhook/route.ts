import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unwrapOne } from "@/lib/supabase/embed";
import {
  getAppAccessToken,
  getPayment,
  isValidWebhookSignature,
} from "@/lib/mercadopago";

type AdminClient = ReturnType<typeof createAdminClient>;

async function recordWebhookEvent(
  admin: AdminClient,
  {
    paymentId,
    contributionId,
    paymentStatus,
    reconciliationStatus,
  }: {
    paymentId: string;
    contributionId: string;
    paymentStatus: string;
    reconciliationStatus: "settled" | "duplicate" | "mismatch";
  },
) {
  const { error } = await admin.from("mp_webhook_events").upsert(
    {
      payment_id: paymentId,
      contribution_id: contributionId,
      payment_status: paymentStatus,
      reconciliation_status: reconciliationStatus,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "payment_id" },
  );
  return error;
}

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

  // La firma de MP cubre el data.id del QUERY STRING. Si el body trae un
  // id distinto, estaríamos validando una identidad y procesando otra —
  // exigimos que coincidan antes de seguir.
  if (bodyPaymentId && queryId && bodyPaymentId !== queryId) {
    console.error("MP webhook: el id del body no coincide con el firmado en la query", {
      bodyPaymentId,
      queryId,
    });
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
        "id, amount, currency, mp_payment_id, campaigns(owner:profiles!owner_id(mp_connections(mp_user_id)))",
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

  // Fail CLOSED si no encontramos el mp_user_id del beneficiario: antes
  // (`!ownerMpUserId || ...`) la falta de conexión hacía pasar cualquier
  // collector, que es justo lo contrario de lo que este chequeo existe
  // para hacer. Y no puede haber un pago legítimo sin conexión: sin ella
  // create-preference nunca habría podido crear la preference.
  const collectorMatches =
    Boolean(ownerMpUserId) && String(payment.collector_id) === ownerMpUserId;

  // A propósito NO exigimos que la campaña siga 'published': el donante
  // pudo pagar mientras estaba publicada y que el dueño la cierre antes
  // de que llegue esta notificación. Eso no invalida un cobro real — si
  // lo exigiéramos, quedaría plata cobrada y nunca acreditada.
  if (!amountMatches || !currencyMatches || !collectorMatches) {
    const eventError = await recordWebhookEvent(admin, {
      paymentId: String(payment.id),
      contributionId: contribution.id,
      paymentStatus: payment.status,
      reconciliationStatus: "mismatch",
    });
    if (eventError) {
      console.error("MP webhook: fallo guardando mismatch", eventError);
      return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 502 });
    }

    // Es definitivo para este pago, pero queda registrado para poder
    // reconciliarlo en vez de perderlo tras responder 200 a MP.
    console.error("MP webhook: mismatch de reconciliación", {
      paymentId: payment.id,
      contributionId: contribution.id,
      amountMatches,
      currencyMatches,
      collectorMatches,
    });
    return NextResponse.json({ ok: true });
  }

  if (
    contribution.mp_payment_id &&
    contribution.mp_payment_id !== String(payment.id)
  ) {
    const eventError = await recordWebhookEvent(admin, {
      paymentId: String(payment.id),
      contributionId: contribution.id,
      paymentStatus: payment.status,
      reconciliationStatus: "duplicate",
    });
    if (eventError) {
      console.error("MP webhook: fallo guardando pago duplicado", eventError);
      return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 502 });
    }

    // Nunca sobrescribimos el primer pago asociado a una contribution.
    // Este evento queda disponible para resolver el cobro duplicado fuera
    // del webhook (lacomu no puede devolver fondos directamente).
    console.error("MP webhook: pago adicional para la misma contribution", {
      paymentId: payment.id,
      contributionId: contribution.id,
      settledPaymentId: contribution.mp_payment_id,
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

  const eventError = await recordWebhookEvent(admin, {
    paymentId: String(payment.id),
    contributionId: contribution.id,
    paymentStatus: payment.status,
    reconciliationStatus: "settled",
  });
  if (eventError) {
    console.error("MP webhook: fallo guardando evento", eventError);
    return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
