/**
 * Helpers de Mercado Pago Marketplace/OAuth.
 *
 * Modelo: cada beneficiario vincula su propia cuenta de MP. La preference
 * se crea con SU access_token, así que la plata va directo a su cuenta —
 * lacomu nunca la custodia (ver AGENTS.md).
 *
 * MP_CLIENT_ID / MP_CLIENT_SECRET son de la aplicación de Mercado Pago
 * Developers (Marketplace), no de una cuenta de vendedor individual.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { platformFeeFor } from "@/lib/fees";

const MP_API = "https://api.mercadopago.com";

/**
 * El Host de un request no es de fiar para construir back_urls,
 * notification_url o redirect_uri — son URLs que determinan a dónde
 * vuelve el donante y a dónde le pega MP con la confirmación del pago.
 * Un Host manipulado podría derivar al donante a un dominio ajeno y
 * cortar el webhook.
 *
 * En producción esto FALLA CERRADO si no está NEXT_PUBLIC_APP_URL: es
 * preferible un error visible a mandar plata a URLs derivadas de un
 * header que controla quien hace el request. El fallback al origin del
 * request queda solo para desarrollo local.
 */
export function getCanonicalOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Falta NEXT_PUBLIC_APP_URL: no se puede derivar el origen de las URLs de Mercado Pago del Host del request en producción.",
    );
  }

  return new URL(request.url).origin;
}

export class MpApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Valida el header x-signature del webhook de MP.
 *
 * Formato documentado: `x-signature: ts=<timestamp>,v1=<hmac hex>`. El
 * manifest que se firma es `id:{dataId};request-id:{xRequestId};ts:{ts};`
 * (dataId en minúscula si tiene letras). El secreto es el "Secret Key" que
 * configura la app en Mercado Pago Developers → Webhooks — NO es
 * MP_CLIENT_SECRET.
 *
 * Sin MP_WEBHOOK_SECRET configurado, esto siempre devuelve false (fail
 * closed) — no tiene sentido procesar notificaciones sin poder validar de
 * dónde vienen.
 *
 * ADVERTENCIA: como el resto de la integración de MP, esto sigue el
 * formato documentado pero no se probó contra un webhook real — falta
 * verificar con el simulador de Mercado Pago Developers.
 */
export function isValidWebhookSignature({
  xSignature,
  xRequestId,
  dataId,
}: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret || !xSignature || !xRequestId || !dataId) return false;

  const parts = Object.fromEntries(
    xSignature
      .split(",")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length === 2),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1, "hex"));
  } catch {
    return false;
  }
}

export function requireMpEnv() {
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Faltan MP_CLIENT_ID / MP_CLIENT_SECRET en las variables de entorno.",
    );
  }
  return { clientId, clientSecret };
}

export function buildAuthorizeUrl({
  redirectUri,
  state,
}: {
  redirectUri: string;
  state: string;
}) {
  const { clientId } = requireMpEnv();
  const url = new URL("https://auth.mercadopago.com.ar/authorization");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeCodeForToken({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) {
  const { clientId, clientSecret } = requireMpEnv();

  const response = await fetch(`${MP_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`MP oauth/token respondió ${response.status}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    user_id: number;
    public_key?: string;
  }>;
}

/**
 * Renueva el access_token de un beneficiario con su refresh_token. Se usa
 * cuando el access_token guardado ya venció (ver create-preference, que
 * reintenta una vez con esto si MP responde 401).
 */
export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = requireMpEnv();

  const response = await fetch(`${MP_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new MpApiError(`MP refresh_token respondió ${response.status}`, response.status);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
  }>;
}

/**
 * Token de la APLICACIÓN (no de un vendedor puntual). Segun la
 * documentación de Marketplace de MP, se usa para consultar pagos hechos
 * a través de cualquier cuenta conectada por OAuth a esta app — es lo que
 * permite que el webhook sepa qué pasó sin adivinar de qué beneficiario
 * era el pago.
 *
 * ADVERTENCIA: esto sigue el patrón documentado de Marketplace, pero no
 * se probó contra una cuenta real de Mercado Pago (no tenemos
 * credenciales). Verificar contra el sandbox antes de confiar en
 * producción.
 */
export async function getAppAccessToken() {
  const { clientId, clientSecret } = requireMpEnv();

  const response = await fetch(`${MP_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    throw new Error(`MP client_credentials respondió ${response.status}`);
  }

  const data = await response.json();
  return data.access_token as string;
}

export async function createPreference({
  accessToken,
  title,
  amount,
  externalReference,
  origin,
  campaignId,
  idempotencyKey,
}: {
  accessToken: string;
  title: string;
  amount: number;
  externalReference: string;
  origin: string;
  campaignId: string;
  /**
   * X-Idempotency-Key: MP dedupe del lado de ellos. Es la defensa más
   * fuerte contra crear dos preferences para la misma intención, porque
   * no depende de ningún lock nuestro — si dos procesos llegan a llamar
   * igual, MP devuelve la misma preference.
   *
   * MP lo documenta como obligatorio para Payments/Refunds; acá se manda
   * también en preferences como defensa en profundidad. No está
   * verificado contra una cuenta real que preferences lo respete, por eso
   * NO es el único mecanismo — el claim con fencing y la búsqueda por
   * external_reference siguen estando.
   */
  idempotencyKey?: string;
}) {
  const response = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      items: [
        {
          title: `Ayuda para: ${title}`,
          quantity: 1,
          unit_price: amount,
          currency_id: "ARS",
        },
      ],
      external_reference: externalReference,
      // Comisión de la plataforma. Es un MONTO absoluto, no un
      // porcentaje: MP espera el valor ya calculado.
      marketplace_fee: platformFeeFor(amount),
      back_urls: {
        success: `${origin}/campanas/${campaignId}?ayuda=exito`,
        pending: `${origin}/campanas/${campaignId}?ayuda=pendiente`,
        failure: `${origin}/campanas/${campaignId}?ayuda=error`,
      },
      auto_return: "approved",
      notification_url: `${origin}/api/mp/webhook`,
    }),
  });

  if (!response.ok) {
    throw new MpApiError(`MP checkout/preferences respondió ${response.status}`, response.status);
  }

  return response.json() as Promise<{ id: string; init_point: string }>;
}

/**
 * Recupera una preference ya creada. Se usa cuando MP la creó bien pero
 * no llegamos a guardar el init_point localmente (ver create-preference) —
 * evita crear una preference nueva para la misma contribution en un
 * retry con la misma idempotencyKey.
 */
export async function getPreference(preferenceId: string, accessToken: string) {
  const response = await fetch(`${MP_API}/checkout/preferences/${preferenceId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new MpApiError(`MP checkout/preferences/{id} respondió ${response.status}`, response.status);
  }

  return response.json() as Promise<{ id: string; init_point: string }>;
}

/**
 * Busca en MP (no en nuestra base) si ya existe una preference para este
 * external_reference. Esto es lo que cierra de verdad el hueco de
 * getPreference(): si guardar mp_preference_id localmente falla las 3
 * veces (ver create-preference), igual podemos recuperar la preference
 * preguntándole a MP en vez de depender de que nuestro propio guardado
 * haya funcionado en algún momento.
 *
 * El endpoint GET /checkout/preferences/search con filtro external_reference
 * está documentado oficialmente por MP (referencia "Search preferences") y
 * pegarle sin auth devuelve 403, no 404 — consistente con que existe. Lo
 * que NO está verificado contra una cuenta real es el shape exacto de la
 * respuesta (acá se asume `{ results: [...] }`, como el resto de los
 * endpoints de búsqueda de MP).
 *
 * A PROPÓSITO tira MpApiError si la request falla (401/5xx/lo que sea) en
 * vez de devolver null — null acá tiene que significar EXCLUSIVAMENTE
 * "se preguntó y no hay ninguna", nunca "no se pudo preguntar". Si el
 * caller tratara ambos casos igual, un 401/5xx transitorio haría que se
 * cree una preference nueva creyendo que no había ninguna — exactamente
 * el duplicado que esto existe para evitar.
 */
export async function findPreferenceByExternalReference(
  externalReference: string,
  accessToken: string,
) {
  const url = new URL(`${MP_API}/checkout/preferences/search`);
  url.searchParams.set("external_reference", externalReference);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new MpApiError(
      `MP checkout/preferences/search respondió ${response.status}`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    results?: { id: string; init_point: string }[];
  };

  return data.results?.[0] ?? null;
}

export async function getPayment(paymentId: string, accessToken: string) {
  const response = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`MP v1/payments respondió ${response.status}`);
  }

  return response.json() as Promise<{
    id: number;
    status: string;
    external_reference: string | null;
    transaction_amount: number;
    currency_id: string;
    collector_id: number;
  }>;
}
