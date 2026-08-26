import type { NextConfig } from "next";
import path from "node:path";

/** Dominio canónico. Los demás redirigen acá. */
const CANONICAL_HOST = "lacomu.ar";

/** Registrados de forma defensiva; no sirven contenido propio. */
const ALIAS_DOMAINS = ["lacomu.store", "lacomu.online"];

/**
 * Todo host que no sea el canónico redirige a él: los dominios alias con
 * y sin www, y el www del propio dominio (si no, `www.lacomu.ar` serviría
 * el mismo contenido en otra URL — contenido duplicado).
 */
const REDIRECT_HOSTS = [
  ...ALIAS_DOMAINS,
  ...ALIAS_DOMAINS.map((host) => `www.${host}`),
  `www.${CANONICAL_HOST}`,
];

const nextConfig: NextConfig = {
  // Fija la raíz explícitamente: evita que Turbopack ambigüe con un
  // package-lock.json que vive fuera de este repo (C:\Users\Maxim).
  turbopack: {
    root: path.resolve(__dirname),
  },

  async redirects() {
    // Se hace acá y no en el dashboard de Vercel a propósito: queda
    // versionado, se revisa en el diff y no depende de un estado de
    // configuración que nadie ve desde el repo.
    //
    // 308 (permanente, preserva el método) para que buscadores y clientes
    // consoliden todo en el dominio canónico y no haya contenido
    // duplicado repartido entre tres dominios.
    return REDIRECT_HOSTS.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: `https://${CANONICAL_HOST}/:path*`,
      permanent: true,
    }));
  },
};

export default nextConfig;
