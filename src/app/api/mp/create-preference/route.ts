import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unwrapOne } from "@/lib/supabase/embed";
import {
  createPreference,
  getPreference,
  findPreferenceByExternalReference,
  refreshAccessToken,
  getCanonicalOrigin,
  MpApiError,
} from "@/lib/mercadopago";
import { checkDonationRateLimit, getClientIp } from "@/lib/rate-limit";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDonationAmount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  // Normalizar a centavos evita que precision de punto flotante o más de
  // dos decimales lleguen a la base y a Mercado Pago como montos distintos.
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > 1e-8) {
    return null;
  }

  return cents / 100;
}

/**
 * Un claim se considera vencido pasado este tiempo: si el request que lo
 * tomó se murió a mitad de camino (timeout de la función, deploy, error
 * no manejado), otro puede retomarlo. Sin esto, un claim colgado dejaba
 * la donación trabada en 409 para siempre.
 */
const CLAIM_TTL_SECONDS = 2 * 60;

/**
 * Toma el derecho exclusivo a crear la preference de esta contribución.
 *
 * Vive en la base (`claim_preference_creation`) y no acá porque el contador
 * de retomas hay que leerlo y escribirlo en el mismo paso, y PostgREST no
 * sabe hacer `col = col + 1`. El `for update` de la función es lo que
 * serializa dos requests concurrentes.
 */
async function claimPreferenceCreation(admin: AdminClient, contributionId: string) {
  const { data, error } = await admin.rpc("claim_preference_creation", {
    p_contribution_id: contributionId,
    p_ttl_seconds: CLAIM_TTL_SECONDS,
  });

  if (error) {
    console.error("MP create-preference: fallo tomando el claim", error);
    return { won: false as const };
  }

  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila?.won) return { won: false as const };

  return {
    won: true as const,
    token: fila.claim_token as string,
    // Si había un claim previo, se lo quitamos a alguien que puede no
    // haber muerto — el TTL no lo prueba.
    tookOverStale: Boolean(fila.took_over),
  };
}

/**
 * Libera el claim para que un reintento inmediato no tenga que esperar el
 * TTL. Filtra por token a propósito: si nuestro claim ya venció y otro
 * request lo retomó, liberar sin fencing borraría el claim DE ÉL y
 * habilitaría a un tercero a llamar a MP en paralelo.
 */
async function releasePreferenceClaim(
  admin: AdminClient,
  contributionId: string,
  token: string,
) {
  const { data } = await admin
    .from("contributions")
    .update({
      mp_preference_claim_started_at: null,
      mp_preference_claim_token: null,
      // Se libera limpio: un rechazo definitivo cierra el episodio, y un
      // intento posterior no tiene que heredar retomas ajenas.
      mp_preference_claim_takeovers: 0,
    })
    .eq("id", contributionId)
    .eq("mp_preference_claim_token", token)
    .select("id");
  return Boolean(data && data.length > 0);
}

async function releaseConnectionCheckoutLock(
  admin: AdminClient,
  profileId: string,
  token: string,
) {
  await admin.rpc("release_mp_connection_checkout_lock", {
    p_profile_id: profileId,
    p_claim_token: token,
  });
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
  const donationAmount = parseDonationAmount(amount);

  if (!campaignId || typeof campaignId !== "string") {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }

  if (donationAmount === null) {
    return NextResponse.json({ error: "Monto inválido." }, { status: 400 });
  }

  // Obligatoria, no opcional: sin ella no hay forma de deduplicar y un
  // caller que la omita (o un retry) genera una contribution y un checkout
  // nuevo cada vez. El form del sitio siempre la manda.
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
    return NextResponse.json(
      { error: "Falta idempotencyKey." },
      { status: 400 },
    );
  }

  const clientIp = getClientIp(request);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, slug, title, owner_id, status, owner:profiles!owner_id(handle, deletion_started_at)")
    .eq("id", campaignId)
    .single();

  if (!campaign || campaign.status !== "published") {
    return NextResponse.json({ error: "Campaña no encontrada." }, { status: 404 });
  }

  // Las back_urls de MP apuntan a la URL canónica /{handle}/{slug}, no a
  // /campanas/{id}: esa es legacy y su redirect perdía el ?ayuda=..., así
  // que el donante volvía de pagar sin ver ningún aviso.
  const owner = unwrapOne(campaign.owner);
  const ownerHandle = owner?.handle;
  if (owner?.deletion_started_at) {
    return NextResponse.json({ error: "Esta campaña ya no acepta donaciones." }, { status: 410 });
  }
  if (!ownerHandle || !campaign.slug) {
    console.error("MP create-preference: campaña sin handle o slug", {
      campaignId,
      ownerHandle,
      slug: campaign.slug,
    });
    return NextResponse.json(
      { error: "No se pudo armar el link de retorno." },
      { status: 500 },
    );
  }
  const campaignPath = `/${ownerHandle}/${campaign.slug}`;

  const { data: initialConnection } = await admin
    .from("mp_connections")
    .select("access_token, refresh_token, mp_user_id")
    .eq("profile_id", campaign.owner_id)
    .single();

  if (!initialConnection?.mp_user_id) {
    return NextResponse.json(
      { error: "Esta persona todavía no vinculó Mercado Pago." },
      { status: 409 },
    );
  }
  let connection: NonNullable<typeof initialConnection> = initialConnection;

  // Un doble click o un retry de red no debería cobrar dos veces. Si el
  // cliente manda la misma idempotencyKey de nuevo, reusamos la
  // contribution/preference existente en vez de crear otra.
  // Ya validada arriba como string; el narrowing es para TypeScript.
  const key: string = idempotencyKey;
  let contribution: { id: string } | null = null;

  {
    const resolution = await resolveExistingByKey(admin, key, connection.access_token);
    if (resolution.type === "response") return resolution.response;
    if (resolution.type === "contribution") contribution = resolution.contribution;
  }

  // El rate limit va DESPUÉS de resolver la key: recuperar un checkout ya
  // creado no es un intento nuevo de pagar, así que no debería consumir
  // cuota ni quedar bloqueado por ella. Solo limitamos la creación real.
  if (!contribution) {
    const rateLimit = await checkDonationRateLimit(clientIp);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Esperá un rato y volvé a probar." },
        { status: 429 },
      );
    }
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
        amount: donationAmount,
        currency: "ARS",
        status: "pending",
        idempotency_key: key,
        // Se congela el collector con el que se arma este checkout. El
        // webhook compara contra ESTE, no contra la conexión vigente al
        // momento de la notificación: si el beneficiario reconecta Mercado
        // Pago con otra cuenta, los pagos en vuelo hacia la cuenta anterior
        // seguían siendo legítimos y se leían como mismatch.
        mp_collector_id: connection.mp_user_id,
      })
      .select("id")
      .single();

    // La IP va a una tabla aparte que solo el service role puede leer —
    // el dueño de la campaña puede leer sus contributions enteras por
    // RLS y no necesita el dato personal del donante para nada.
    if (inserted && clientIp) {
      await admin
        .from("contribution_client_ips")
        .insert({ contribution_id: inserted.id, client_ip: clientIp });
    }

    if (insertError?.code === "23505") {
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
  const claim = await claimPreferenceCreation(admin, contribution.id);

  if (!claim.won) {
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

  // Si le quitamos el claim a alguien por TTL vencido, ese alguien puede
  // seguir vivo y haber creado (o estar creando) una preference. Antes de
  // crear otra, le preguntamos a MP.
  //
  // Esto es lo que hace que la protección NO dependa del X-Idempotency-Key
  // (que MP documenta para Payments/Orders, pero no explícitamente para
  // Preferences — sin sandbox no podemos confirmar que lo respete acá).
  // El header queda como capa extra, no como la garantía principal.
  if (claim.tookOverStale) {
    // Si MP contestó (aunque sea "no hay ninguna"), lo sabemos. No es lo
    // mismo que no haber podido preguntar.
    let mpRespondio = false;

    try {
      const recovered = await findPreferenceByExternalReference(
        contribution.id,
        connection.access_token,
      );
      if (recovered) {
        await admin
          .from("contributions")
          .update({ mp_preference_id: recovered.id, mp_init_point: recovered.init_point })
          .eq("id", contribution.id)
          .eq("mp_preference_claim_token", claim.token);
        return NextResponse.json({ initPoint: recovered.init_point });
      }
      mpRespondio = true;
    } catch (err) {
      console.error(
        "MP create-preference: claim retomado pero no se pudo verificar duplicados",
        err,
      );
    }

    if (!mpRespondio) {
      return NextResponse.json(
        { error: "El pago anterior todavía se está verificando. Probá de nuevo en unos minutos." },
        { status: 409 },
      );
    }

    const { data: attempt, error: attemptError } = await admin
      .from("contributions")
      .select("mp_preference_attempted_at")
      .eq("id", contribution.id)
      .maybeSingle();
    if (attemptError || attempt?.mp_preference_attempted_at) {
      // El request anterior ya alcanzó MP. Aunque todavía no aparezca una
      // preference, crear otra habilitaría un doble cobro si llega tarde.
      return NextResponse.json(
        { error: "Estamos verificando un intento anterior. Probá de nuevo más tarde." },
        { status: 409 },
      );
    }
  }

  // El lease persistente serializa la foto de credenciales con OAuth: si la
  // reconexión llegó primero, devuelve la conexión nueva; si llega después,
  // su upsert se rechaza hasta que liberemos este checkout.
  const { data: lockedConnection } = await admin.rpc("lock_mp_connection_for_checkout", {
    p_profile_id: campaign.owner_id,
    p_contribution_id: contribution.id,
    p_claim_token: claim.token,
  });
  const freshConnection = Array.isArray(lockedConnection)
    ? lockedConnection[0]
    : lockedConnection;
  if (!freshConnection?.mp_user_id) {
    await releasePreferenceClaim(admin, contribution.id, claim.token);
    return NextResponse.json(
      { error: "La cuenta de Mercado Pago del beneficiario cambió. Probá de nuevo." },
      { status: 503 },
    );
  }
  connection = freshConnection;

  // Escribimos antes del side effect externo. Un claim vencido sin esta
  // marca puede retomarse; con ella solo se recupera/reconcilia, nunca se
  // emite automáticamente un segundo checkout para la misma contribution.
  const { data: markedAttempt } = await admin
    .from("contributions")
    .update({ mp_preference_attempted_at: new Date().toISOString() })
    .eq("id", contribution.id)
    .eq("mp_preference_claim_token", claim.token)
    .is("mp_preference_attempted_at", null)
    .select("id");
  if (!markedAttempt || markedAttempt.length === 0) {
    await releaseConnectionCheckoutLock(admin, campaign.owner_id, claim.token);
    return NextResponse.json(
      { error: "Estamos verificando un intento anterior. Probá de nuevo más tarde." },
      { status: 409 },
    );
  }

  let accessToken = connection.access_token;

  // Derivado de la contribution (no del claim, que cambia en cada
  // retoma): capa extra por si Preferences respeta el header — ver
  // comentario de arriba sobre por qué no confiamos solo en esto.
  const mpIdempotencyKey = `lacomu-${contribution.id}`;

  try {
    let preference;
    try {
      preference = await createPreference({
        accessToken,
        title: campaign.title,
        amount: donationAmount,
        externalReference: contribution.id,
        origin,
        campaignPath,
        idempotencyKey: mpIdempotencyKey,
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

        // FENCING de la conexión: el beneficiario pudo reconectar Mercado
        // Pago —posiblemente con OTRA cuenta— entre la lectura de arriba y
        // este refresh, y el callback hace upsert por profile_id. Sin filtrar
        // por la identidad que leímos, este update pisaba las credenciales
        // nuevas con las de la cuenta anterior y dejaba la fila incoherente:
        // mp_user_id de la cuenta nueva con access_token de la vieja. Desde
        // ahí, todo checkout se creaba en la cuenta equivocada.
        const { data: fenced } = await admin
          .from("mp_connections")
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token ?? connection.refresh_token,
            updated_at: new Date().toISOString(),
          })
          .eq("profile_id", campaign.owner_id)
          .eq("mp_user_id", connection.mp_user_id)
          .eq("refresh_token", connection.refresh_token)
          .select("profile_id");

        if (!fenced || fenced.length === 0) {
          // El 401 prueba que MP no creó nada en este intento, así que
          // soltar el claim es seguro y el retry arranca limpio leyendo la
          // conexión nueva.
          await releasePreferenceClaim(admin, contribution.id, claim.token);
          await releaseConnectionCheckoutLock(admin, campaign.owner_id, claim.token);
          console.warn("MP create-preference: la conexión de MP cambió durante el refresh", {
            contributionId: contribution.id,
            ownerId: campaign.owner_id,
          });
          return NextResponse.json(
            { error: "La cuenta de Mercado Pago del beneficiario cambió. Probá de nuevo." },
            { status: 503 },
          );
        }

        preference = await createPreference({
          accessToken,
          title: campaign.title,
          amount: donationAmount,
          externalReference: contribution.id,
          origin,
          campaignPath,
          idempotencyKey: mpIdempotencyKey,
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
    // FENCING: el update solo aplica si seguimos siendo dueños del claim.
    // Si tardamos más que el TTL y otro nos lo quitó, `rows` viene vacío
    // y no pisamos lo que haya escrito el nuevo dueño.
    let saved = false;
    let lostClaim = false;
    let lastUpdateError: unknown = null;
    for (let attempt = 0; attempt < 3 && !saved && !lostClaim; attempt++) {
      if (attempt > 0) await sleep(300 * attempt);
      const { data: rows, error: updateError } = await admin
        .from("contributions")
        .update({
          mp_preference_id: preference.id,
          mp_init_point: preference.init_point,
          // Se reafirma el collector con la conexión que efectivamente se
          // usó para crear ESTE checkout. En el insert queda un valor
          // inicial, pero si la contribución se reusó de un intento
          // anterior (misma idempotencyKey) podría haber quedado apuntando
          // a una conexión que ya no es la que cobra.
          mp_collector_id: connection.mp_user_id,
        })
        .eq("id", contribution.id)
        .eq("mp_preference_claim_token", claim.token)
        .select("id");

      if (updateError) {
        lastUpdateError = updateError;
      } else if (rows && rows.length > 0) {
        saved = true;
      } else {
        lostClaim = true;
      }
    }

    if (lostClaim) {
      // Otro request retomó el claim mientras nosotros seguíamos con MP.
      // Gracias al X-Idempotency-Key ambos deberían haber obtenido la
      // MISMA preference, así que devolvemos la nuestra sin pisar la
      // suya — el estado converge igual.
      console.warn("MP create-preference: se perdió el claim durante la creación", {
        contributionId: contribution.id,
        preferenceId: preference.id,
      });
      await releaseConnectionCheckoutLock(admin, campaign.owner_id, claim.token);
      return NextResponse.json({ initPoint: preference.init_point });
    }

    if (!saved) {
      console.error(
        "MP create-preference: no se pudo guardar la preference tras 3 intentos",
        { contributionId: contribution.id, preferenceId: preference.id, lastUpdateError },
      );
      await releaseConnectionCheckoutLock(admin, campaign.owner_id, claim.token);
      // No liberamos el claim acá a propósito: la preference SÍ existe en
      // MP, y un reintento inmediato la va a recuperar por
      // external_reference. Liberar invitaría a crear otra.
      return NextResponse.json(
        { error: "No se pudo guardar la preferencia." },
        { status: 500 },
      );
    }

    await releaseConnectionCheckoutLock(admin, campaign.owner_id, claim.token);
    return NextResponse.json({ initPoint: preference.init_point });
  } catch (err) {
    await releaseConnectionCheckoutLock(admin, campaign.owner_id, claim.token);
    // Un timeout, 5xx o rate limit no prueba que MP no haya creado la
    // preference. Conservamos el claim para que el retry la busque por
    // external_reference antes de permitir otra creación.
    const definitelyRejected =
      err instanceof MpApiError && [400, 401, 403, 404, 422].includes(err.status);

    if (!definitelyRejected) {
      console.error("MP create-preference: resultado incierto", err);
      return NextResponse.json(
        { error: "No se pudo verificar el estado del pago. Probá de nuevo en un momento." },
        { status: 503 },
      );
    }

    // Estos códigos de cliente son rechazos definitivos: MP no creó la
    // preference, así que liberamos el claim y marcamos el intento fallido.
    // Todo fenceado por token para no tocar un claim que otro request retomó.
    const stillOurs = await releasePreferenceClaim(admin, contribution.id, claim.token);

    if (stillOurs) {
      await admin
        .from("contributions")
        .update({ status: "failed", mp_preference_attempted_at: null })
        .eq("id", contribution.id)
        .eq("status", "pending");
    }

    return NextResponse.json(
      { error: "Mercado Pago rechazó la preferencia." },
      { status: 502 },
    );
  }
}
