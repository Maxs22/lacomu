import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCodeForToken, getCanonicalOrigin } from "@/lib/mercadopago";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getCanonicalOrigin(request);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("mp_oauth_state")?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/perfil?mp=error", origin));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/ingresar", origin));
  }

  // El state lleva el id del usuario que arrancó la vinculación (ver
  // /connect). Si la sesión cambió en el medio, abortamos: si no,
  // guardaríamos las credenciales de MP de una persona en el perfil de
  // otra — quien reciba las donaciones sería el equivocado.
  const [stateUserId] = state.split(".");
  if (stateUserId !== user.id) {
    console.error("MP callback: la sesión cambió durante la vinculación", {
      stateUserId,
      currentUserId: user.id,
    });
    return NextResponse.redirect(new URL("/perfil?mp=error", origin));
  }

  let tokenData;
  try {
    // Tiene que ser EXACTAMENTE el mismo redirect_uri que se mandó en el
    // paso de /connect, o MP rechaza el intercambio del code.
    tokenData = await exchangeCodeForToken({
      code,
      redirectUri: `${getCanonicalOrigin(request)}/api/mp/callback`,
    });
  } catch {
    return NextResponse.redirect(new URL("/perfil?mp=error", origin));
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin.rpc("upsert_mp_connection_if_idle", {
    p_profile_id: user.id,
    p_mp_user_id: String(tokenData.user_id),
    p_access_token: tokenData.access_token,
    p_refresh_token: tokenData.refresh_token ?? null,
    p_public_key: tokenData.public_key ?? null,
  });

  const response = NextResponse.redirect(
    new URL(error || !updated ? "/perfil?mp=error" : "/perfil?mp=success", origin),
  );
  response.cookies.delete("mp_oauth_state");
  return response;
}
