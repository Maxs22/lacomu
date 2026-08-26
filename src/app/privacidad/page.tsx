import Link from "next/link";
import type { Metadata } from "next";
import { DocPage, DocSection } from "@/components/doc-page";

export const metadata: Metadata = {
  title: "Privacidad",
  description:
    "Qué datos guarda lacomu, para qué los usa, quién los ve y cómo pedir que se borren.",
};

export default function PrivacidadPage() {
  return (
    <DocPage title="Privacidad" updatedAt="26 de agosto de 2026">
      <p className="text-lg leading-relaxed text-foreground">
        Guardamos lo mínimo para que la plataforma funcione. Acá está el
        detalle de qué es cada cosa y quién puede verla.
      </p>

      <DocSection title="Si pedís ayuda">
        <p>Guardamos:</p>
        <ul className="ml-5 flex list-disc flex-col gap-2">
          <li>Tu email, para que puedas ingresar.</li>
          <li>
            El nombre y la foto de perfil que cargues, que son{" "}
            <strong className="text-foreground">públicos</strong> — aparecen
            en tu campaña.
          </li>
          <li>
            El texto y la foto de tu pedido, que también son públicos.
          </li>
          <li>
            Las credenciales que devuelve Mercado Pago al vincular tu cuenta.
            Son privadas: no las ve ningún otro usuario, solo se usan para
            generar los checkouts de tus donaciones.
          </li>
        </ul>
      </DocSection>

      <DocSection title="Si donás">
        <p>Guardamos:</p>
        <ul className="ml-5 flex list-disc flex-col gap-2">
          <li>
            El monto, la fecha y el estado del pago. Si donaste sin marcar
            &ldquo;anónimo&rdquo;, también el nombre que pusiste — eso es
            público.
          </li>
          <li>
            Tu email, si lo dejaste.{" "}
            <strong className="text-foreground">
              No se lo mostramos a nadie
            </strong>
            , ni a la persona que recibe la ayuda.
          </li>
          <li>
            Tu dirección IP, únicamente para limitar abuso automatizado. Vive
            en una tabla separada que ningún usuario puede leer.
          </li>
        </ul>
        <p>
          Si marcás &ldquo;donar de forma anónima&rdquo;, tu nombre no se
          muestra en ningún lado público.
        </p>
      </DocSection>

      <DocSection title="Con quién se comparte">
        <p>
          Con nadie, más allá de los servicios que necesitamos para operar:
          Mercado Pago (procesar los pagos), Supabase (base de datos y envío
          del código de ingreso) y Vercel (hosting). No vendemos datos ni
          hacemos publicidad con ellos.
        </p>
      </DocSection>

      <DocSection title="Cookies">
        <p>
          Solo las necesarias para mantener tu sesión abierta si ingresaste.
          No usamos cookies de publicidad ni de seguimiento de terceros.
        </p>
      </DocSection>

      <DocSection title="Borrar tus datos">
        <p>
          Escribinos a{" "}
          <a
            href="mailto:hola@lacomu.ar"
            className="underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            hola@lacomu.ar
          </a>{" "}
          desde el email de tu cuenta y borramos tu perfil y tus campañas.
        </p>
        <p>
          Una aclaración honesta: los registros de donaciones ya concretadas
          los conservamos sin tus datos personales, porque son el respaldo
          contable de plata que efectivamente se movió entre terceros.
        </p>
      </DocSection>

      <DocSection title="Más">
        <p>
          <Link
            href="/terminos"
            className="underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            Términos y condiciones
          </Link>{" "}
          ·{" "}
          <Link
            href="/como-funciona"
            className="underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            Cómo funciona
          </Link>
        </p>
      </DocSection>
    </DocPage>
  );
}
