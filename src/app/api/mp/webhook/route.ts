import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAppAccessToken,
  getPayment,
  isValidWebhookSignature,
} from "@/lib/mercadopago";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Mercado Pago pega acá cuando cambia el estado de un pago.
 *
 * Importante: devolver 200 significa "recibido, no reintentes". Eso está
 * bien cuando decidimos A PROPÓSITO no confirmar algo (un mismatch real),
 * pero NUNCA cuando fue un error transitorio nuestro (API de MP caída,
 * Supabase con un hipo) — ahí hay que devolver un status de error para que
 * MP reintente, si no un pago approved puede quedar pending para siempre
 * sin que nadie se entere.
 *
 * Toda la conciliación (reconciliar montos, decidir si un pago nuevo
 * reemplaza al anterior, recalcular los totales de la campaña) vive en la
 * función `settle_mp_payment` de la base, en UNA transacción. Antes estaba
 * acá repartida en varios requests a PostgREST y eso dejaba dos agujeros:
 * los totales podían quedar mal para siempre si el segundo request fallaba,
 * y dos pagos concurrentes de la misma campaña se pisaban los totales.
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

  if (!payment.external_reference || !UUID_RE.test(payment.external_reference)) {
    // Una referencia ajena o malformada no va a convertirse en UUID en la
    // RPC. Es definitivo: pedir retries solo acumularía notificaciones.
    console.error("MP webhook: external_reference inválido", {
      paymentId: payment.id,
      externalReference: payment.external_reference,
    });
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  const { data: outcome, error } = await admin.rpc("settle_mp_payment", {
    p_contribution_id: payment.external_reference,
    p_payment_id: String(payment.id),
    p_payment_status: payment.status,
    p_transaction_amount: payment.transaction_amount,
    p_currency: payment.currency_id,
    p_collector_id:
      payment.collector_id === null || payment.collector_id === undefined
        ? null
        : String(payment.collector_id),
  });

  if (error) {
    // No sabemos si la transacción llegó a commitear. Es justo el caso en
    // que hay que pedirle a MP que reintente: la función es idempotente,
    // así que un segundo intento converge al mismo estado.
    console.error("MP webhook: fallo conciliando el pago", error);
    return NextResponse.json({ error: "No se pudo conciliar el pago." }, { status: 502 });
  }

  // A partir de acá la decisión ya está tomada y persistida. Todos estos
  // resultados son definitivos: reintentar no cambiaría nada, así que 200.
  switch (outcome) {
    case "settled":
      break;

    case "superseded_previous":
      // Reintento de pago sobre la misma preference: el intento anterior
      // no había movido plata y este sí. Se registra porque conviene poder
      // verlo al reconciliar.
      console.warn("MP webhook: un pago nuevo reemplazó al intento anterior", {
        paymentId: payment.id,
        contributionId: payment.external_reference,
      });
      break;

    case "duplicate":
      // Dos pagos aprobados para la misma donación. No se pisa el que ya
      // está asentado; queda en mp_webhook_events para resolverlo fuera
      // del webhook (lacomu no puede devolver fondos).
      console.error("MP webhook: pago adicional para la misma contribution", {
        paymentId: payment.id,
        contributionId: payment.external_reference,
      });
      break;

    case "mismatch":
      console.error("MP webhook: mismatch de reconciliación", {
        paymentId: payment.id,
        contributionId: payment.external_reference,
        status: payment.status,
      });
      break;

    case "unknown_contribution":
      // El external_reference no corresponde a ninguna contribution
      // nuestra. Definitivo: reintentar no cambia nada.
      console.error("MP webhook: external_reference desconocido", {
        paymentId: payment.id,
        externalReference: payment.external_reference,
      });
      break;

    default:
      // Un resultado que no conocemos significa que la función de la base
      // cambió y este código quedó atrás. No lo tratamos como éxito.
      console.error("MP webhook: resultado inesperado de settle_mp_payment", {
        outcome,
        paymentId: payment.id,
      });
      return NextResponse.json(
        { error: "Resultado de conciliación inesperado." },
        { status: 500 },
      );
  }

  return NextResponse.json({ ok: true });
}
