import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCodeForToken, getCanonicalOrigin } from "@/lib/mercadopago";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
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
  const { error } = await admin.from("mp_connections").upsert({
    profile_id: user.id,
    mp_user_id: String(tokenData.user_id),
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token ?? null,
    public_key: tokenData.public_key ?? null,
    updated_at: new Date().toISOString(),
  });

  const response = NextResponse.redirect(
    new URL(error ? "/perfil?mp=error" : "/perfil?mp=success", origin),
  );
  response.cookies.delete("mp_oauth_state");
  return response;
}
