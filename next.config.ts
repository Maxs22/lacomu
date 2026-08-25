import type { NextConfig } from "next";
import path from "node:path";

/** Dominio canónico. Los demás redirigen acá. */
const CANONICAL_HOST = "lacomu.ar";

/** Registrados de forma defensiva; no sirven contenido propio. */
const ALIAS_HOSTS = ["lacomu.store", "lacomu.online"];

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
    return ALIAS_HOSTS.flatMap((host) => [
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: host }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: `www.${host}` }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
    ]);
  },
};

export default nextConfig;
