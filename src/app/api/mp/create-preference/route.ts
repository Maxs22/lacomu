import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPreference,
  getPreference,
  findPreferenceByExternalReference,
  refreshAccessToken,
  getCanonicalOrigin,
  MpApiError,
} from "@/lib/mercadopago";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * UPDATE atómico: solo un request puede ganar la transición de NULL a
 * "ahora" para una contribution dada. Esto es lo que serializa la llamada
 * externa a createPreference — el unique de idempotency_key ya evitaba
 * duplicar la FILA local, pero no evitaba que dos requests concurrentes
 * que resolvían a la MISMA fila le pegaran a MP los dos.
 */
async function claimPreferenceCreation(admin: AdminClient, contributionId: string) {
  const { data } = await admin
    .from("contributions")
    .update({ mp_preference_claim_started_at: new Date().toISOString() })
    .eq("id", contributionId)
    .is("mp_preference_claim_started_at", null)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

async function waitForInitPoint(admin: AdminClient, contributionId: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(500);
    const { data } = await admin
      .from("contributions")
      .select("mp_init_point")
      .eq("id", contributionId)
      .maybeSingle();
    if (data?.mp_init_point) return data.mp_init_point as string;
  }
  return null;
}

type AdminClient = ReturnType<typeof createAdminClient>;

type Resolution =
  | { type: "response"; response: NextResponse }
  | { type: "contribution"; contribution: { id: string } }
  | { type: "none" };

/**
 * Busca una contribution existente por idempotencyKey y, si la encuentra
 * sin checkout todavía, intenta recuperar su preference en vez de dejar
 * que el caller cree una nueva. Se usa en dos momentos: al principio del
 * request, y de nuevo si el insert más abajo choca contra el unique de
 * idempotency_key (dos requests concurrentes con la misma key).
 */
async function resolveExistingByKey(
  admin: AdminClient,
  key: string,
  accessToken: string,
): Promise<Resolution> {
  const { data: existing } = await admin
    .from("contributions")
    .select("id, mp_preference_id, mp_init_point")
    .eq("idempotency_key", key)
    .maybeSingle();

  if (!existing) return { type: "none" };

  if (existing.mp_init_point) {
    return {
      type: "response",
      response: NextResponse.json({ initPoint: existing.mp_init_point }),
    };
  }

  // Recuperación en dos pasos:
  //  1. Si tenemos mp_preference_id guardado, la traemos directo.
  //  2. Si no, le preguntamos a MP si igual existe una preference con
  //     este external_reference — no dependemos de que nuestro propio
  //     guardado haya funcionado en algún momento.
  let recovered: { id: string; init_point: string } | null = null;

  if (existing.mp_preference_id) {
    try {
      recovered = await getPreference(existing.mp_preference_id, accessToken);
    } catch {
      // sigue al paso 2
    }
  }

  if (!recovered) {
    try {
      // null acá SÍ significa "se preguntó y no hay ninguna" — recién ahí
      // es seguro dejar que el caller cree una nueva.
      recovered = await findPreferenceByExternalReference(existing.id, accessToken);
    } catch (err) {
      // No pudimos confirmar si ya existe una preference o no. Crear una
      // nueva a ciegas acá es exactamente el riesgo de duplicado que esto
      // existe para evitar — mejor frenar que el usuario reintente.
      console.error(
        "MP create-preference: no se pudo verificar duplicados antes de crear",
        err,
      );
      return {
        type: "response",
        response: NextResponse.json(
          { error: "No se pudo verificar el estado del pago. Probá de nuevo en un momento." },
          { status: 503 },
        ),
      };
    }
  }

  if (recovered) {
    await admin
      .from("contributions")
      .update({ mp_preference_id: recovered.id, mp_init_point: recovered.init_point })
      .eq("id", existing.id);
    return {
      type: "response",
      response: NextResponse.json({ initPoint: recovered.init_point }),
    };
  }

  return { type: "contribution", contribution: existing };
}

export async function POST(request: Request) {
  const origin = getCanonicalOrigin(request);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const {
    campaignId,
    amount,
    isAnonymous,
    donorDisplayName,
    donorEmail,
    idempotencyKey,
  } = body;

  if (
    !campaignId ||
    typeof campaignId !== "string" ||
    !amount ||
    Number(amount) <= 0
  ) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, title, owner_id, status")
    .eq("id", campaignId)
    .single();

  if (!campaign || campaign.status !== "published") {
    return NextResponse.json({ error: "Campaña no encontrada." }, { status: 404 });
  }

  const { data: connection } = await admin
    .from("mp_connections")
    .select("access_token, refresh_token")
    .eq("profile_id", campaign.owner_id)
    .single();

  if (!connection) {
    return NextResponse.json(
      { error: "Esta persona todavía no vinculó Mercado Pago." },
      { status: 409 },
    );
  }

  // Un doble click o un retry de red no debería cobrar dos veces. Si el
  // cliente manda la misma idempotencyKey de nuevo, reusamos la
  // contribution/preference existente en vez de crear otra.
  const key = typeof idempotencyKey === "string" ? idempotencyKey : null;
  let contribution: { id: string } | null = null;

  if (key) {
    const resolution = await resolveExistingByKey(admin, key, connection.access_token);
    if (resolution.type === "response") return resolution.response;
    if (resolution.type === "contribution") contribution = resolution.contribution;
  }

  if (!contribution) {
    const { data: inserted, error: insertError } = await admin
      .from("contributions")
      .insert({
        campaign_id: campaignId,
        profile_id: user?.id ?? null,
        donor_email: donorEmail || null,
        donor_display_name: isAnonymous ? null : donorDisplayName || null,
        is_anonymous: Boolean(isAnonymous),
        amount: Number(amount),
        currency: "ARS",
        status: "pending",
        idempotency_key: key,
      })
      .select("id")
      .single();

    if (insertError?.code === "23505" && key) {
      // unique_violation en idempotency_key: otro request con la misma
      // key ganó la carrera entre nuestro SELECT de arriba y este INSERT
      // (dos clicks/retries simultáneos). En vez de devolver un 500 al
      // que perdió, recuperamos lo que insertó el que ganó.
      const resolution = await resolveExistingByKey(admin, key, connection.access_token);
      if (resolution.type === "response") return resolution.response;
      if (resolution.type === "contribution") {
        contribution = resolution.contribution;
      } else {
        // No debería pasar (justo hubo un choque de unique), pero por
        // las dudas no seguimos con contribution en null.
        return NextResponse.json(
          { error: "No se pudo registrar la contribución." },
          { status: 500 },
        );
      }
    } else if (insertError || !inserted) {
      return NextResponse.json(
        { error: "No se pudo registrar la contribución." },
        { status: 500 },
      );
    } else {
      contribution = inserted;
    }
  }

  // A partir de acá, contribution existe pero (que sepamos) todavía no
  // tiene preference. Antes de llamarle a MP, reservamos atómicamente el
  // derecho a crearla — si otro request ya la está creando (o la creó),
  // no llamamos a MP nosotros también.
  const wonClaim = await claimPreferenceCreation(admin, contribution.id);

  if (!wonClaim) {
    const initPoint = await waitForInitPoint(admin, contribution.id);
    if (initPoint) {
      return NextResponse.json({ initPoint });
    }

    // El que ganó el claim puede haber fallado a mitad de camino sin
    // terminar de guardar nada. Antes de rendirnos, le preguntamos a MP
    // directamente si igual existe una preference.
    try {
      const recovered = await findPreferenceByExternalReference(
        contribution.id,
        connection.access_token,
      );
      if (recovered) {
        await admin
          .from("contributions")
          .update({ mp_preference_id: recovered.id, mp_init_point: recovered.init_point })
          .eq("id", contribution.id);
        return NextResponse.json({ initPoint: recovered.init_point });
      }
    } catch {
      // no se pudo verificar tampoco
    }

    return NextResponse.json(
      { error: "Ya se está procesando este pago. Esperá un momento y volvé a intentar." },
      { status: 409 },
    );
  }

  let accessToken = connection.access_token;

  try {
    let preference;
    try {
      preference = await createPreference({
        accessToken,
        title: campaign.title,
        amount: Number(amount),
        externalReference: contribution.id,
        origin,
        campaignId,
      });
    } catch (err) {
      // El access_token del beneficiario puede haber vencido. Si tenemos
      // refresh_token, renovamos una vez y reintentamos — si no, el error
      // se propaga igual que antes.
      if (
        err instanceof MpApiError &&
        err.status === 401 &&
        connection.refresh_token
      ) {
        const refreshed = await refreshAccessToken(connection.refresh_token);
        accessToken = refreshed.access_token;

        await admin
          .from("mp_connections")
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token ?? connection.refresh_token,
            updated_at: new Date().toISOString(),
          })
          .eq("profile_id", campaign.owner_id);

        preference = await createPreference({
          accessToken,
          title: campaign.title,
          amount: Number(amount),
          externalReference: contribution.id,
          origin,
          campaignId,
        });
      } else {
        throw err;
      }
    }

    // MP ya creó la preference en este punto. Reintentamos el guardado
    // local un par de veces para el caso común (blip transitorio). Si los
    // 3 intentos fallan igual, no pasa nada grave: un retry posterior con
    // la misma idempotencyKey la va a recuperar de todos modos vía
    // findPreferenceByExternalReference más arriba, que no depende de que
    // este guardado haya funcionado — ese es el que cierra el hueco de
    // verdad, esto de acá es solo la optimización del caso feliz.
    let saved = false;
    let lastUpdateError: unknown = null;
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      if (attempt > 0) await sleep(300 * attempt);
      const { error: updateError } = await admin
        .from("contributions")
        .update({
          mp_preference_id: preference.id,
          mp_init_point: preference.init_point,
        })
        .eq("id", contribution.id);
      if (!updateError) {
        saved = true;
      } else {
        lastUpdateError = updateError;
      }
    }

    if (!saved) {
      console.error(
        "MP create-preference: no se pudo guardar la preference tras 3 intentos",
        { contributionId: contribution.id, preferenceId: preference.id, lastUpdateError },
      );
      return NextResponse.json(
        { error: "No se pudo guardar la preferencia." },
        { status: 500 },
      );
    }

    return NextResponse.json({ initPoint: preference.init_point });
  } catch {
    await admin
      .from("contributions")
      .update({ status: "failed" })
      .eq("id", contribution.id);
    return NextResponse.json(
      { error: "Mercado Pago rechazó la preferencia." },
      { status: 502 },
    );
  }
}
