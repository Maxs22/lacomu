import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lacomu.ar";

/**
 * Sin esto el sitio devolvía 404 en /robots.txt. No impide que Google
 * rastree —ante un 404 asume que puede entrar a todo— pero sí es donde se
 * declara el sitemap, que es la forma de que descubra las campañas sin
 * depender de que alguien las enlace desde afuera.
 *
 * Las páginas privadas NO se bloquean acá a propósito. Un `disallow` impide
 * el rastreo, y si Google no puede entrar tampoco puede leer el `noindex`
 * que declaran esas páginas: el resultado es que puede llegar a indexar la
 * URL igual, sin contenido, solo porque alguien la enlazó. Dejarlas
 * rastreables y marcadas con noindex es lo que las saca de verdad.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Los endpoints no tienen nada que indexar y algunos disparan efectos.
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
