import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl, getCanonicalOrigin } from "@/lib/mercadopago";

export async function GET(request: Request) {
  // Navegación interna (usuario no logueado): se queda en el mismo
  // dominio que está navegando, no tiene por qué ser el canónico.
  const requestOrigin = new URL(request.url).origin;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/ingresar", requestOrigin));
  }

  // redirect_uri sí tiene que ser el dominio canónico registrado en la
  // app de Mercado Pago, no el Host del request.
  const state = randomUUID();
  const redirectUri = `${getCanonicalOrigin(request)}/api/mp/callback`;
  const authorizeUrl = buildAuthorizeUrl({ redirectUri, state });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("mp_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });
  return response;
}
