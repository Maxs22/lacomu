/**
 * Reconstruye el query string a partir de los searchParams de una página.
 *
 * Existe porque un redirect que descarta el query rompe el retorno de
 * Mercado Pago: el donante vuelve con ?ayuda=exito y, si el redirect lo
 * pierde, no ve ningún aviso de que su pago se registró. Ya pasó dos veces
 * en rutas distintas (la legacy /campanas/{id} y la de handle renombrado),
 * así que la lógica vive en un solo lugar.
 *
 * Devuelve "" o "?a=1&b=2", listo para concatenar a un path.
 */
export function queryStringFrom(
  params: Record<string, string | string[] | undefined>,
): string {
  const qs = new URLSearchParams();

  for (const [clave, valor] of Object.entries(params)) {
    if (typeof valor === "string") {
      qs.set(clave, valor);
    } else if (Array.isArray(valor)) {
      // Repetido en la URL (?a=1&a=2): se conservan todos.
      for (const v of valor) qs.append(clave, v);
    }
  }

  const s = qs.toString();
  return s ? `?${s}` : "";
}
