import type { Metadata } from "next";
import { Fraunces, Karla } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});

const karla = Karla({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-karla",
});

const TITLE = "lacomu — Ayudar entre desconocidos";
const DESCRIPTION =
  "lacomu conecta a quien necesita una mano con quien puede darla, sin vueltas.";

/**
 * metadataBase hace que las URLs relativas (og.jpg) se resuelvan a
 * absolutas: WhatsApp, Twitter y Facebook descartan las imágenes de
 * Open Graph con path relativo, así que sin esto la preview sale sin
 * imagen. Se toma de la misma variable que usa el resto de la app para
 * no tener el dominio hardcodeado en dos lugares.
 */
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lacomu.ar";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    // Las páginas internas quedan como "Cómo funciona · lacomu"
    template: "%s · lacomu",
  },
  description: DESCRIPTION,
  applicationName: "lacomu",
  openGraph: {
    type: "website",
    siteName: "lacomu",
    locale: "es_AR",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "lacomu — siluetas de personas juntas",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.jpg"],
  },
  icons: {
    // icon.svg lo toma Next por convención de archivo; se declara el PNG
    // como alternativa para los clientes que no renderizan SVG.
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/logo-cuadrado.png", type: "image/png", sizes: "1024x1024" },
    ],
    apple: "/logo-cuadrado.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${karla.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
