import Link from "next/link";
import type { Metadata } from "next";
import { DocPage, DocSection } from "@/components/doc-page";
import { PLATFORM_FEE_LABEL } from "@/lib/fees";

export const metadata: Metadata = {
  title: "Cómo funciona — lacomu",
  description:
    "Cómo se pide ayuda, cómo se dona y qué hace (y qué no hace) lacomu con la plata.",
};

export default function ComoFuncionaPage() {
  return (
    <DocPage title="Cómo funciona" updatedAt="26 de agosto de 2026">
      <p className="text-lg leading-relaxed text-foreground">
        lacomu conecta a quien necesita una mano con quien puede darla. Nada
        más. No decidimos quién merece ayuda: eso lo elige cada persona que
        dona.
      </p>

      <DocSection title="Si necesitás ayuda">
        <p>
          Entrás con tu email (te llega un código, no hace falta contraseña),
          contás tu situación con tus palabras, ponés cuánto necesitás y, si
          querés, una foto. Tu pedido se publica al instante.
        </p>
        <p>
          No hay revisión previa ni tenés que justificar el motivo. Puede ser
          una herramienta para trabajar, haber perdido el laburo, sostener un
          proyecto propio o apoyar a una organización.
        </p>
        <p>
          Para poder recibir la plata tenés que vincular tu propia cuenta de
          Mercado Pago desde tu perfil. Hasta que lo hagas, tu pedido se ve
          pero nadie puede donarte.
        </p>
      </DocSection>

      <DocSection title="Si querés ayudar">
        <p>
          No necesitás cuenta ni registrarte. Elegís una campaña, ponés el
          monto y pagás por Mercado Pago. Podés aparecer con tu nombre o de
          forma anónima.
        </p>
        <p>
          Tu email, si lo dejás, no se lo mostramos a nadie — ni a la persona
          que recibe la ayuda.
        </p>
      </DocSection>

      <DocSection title="Qué pasa con la plata">
        <p>
          <strong className="text-foreground">
            La plata no pasa por lacomu.
          </strong>{" "}
          Va directo de tu medio de pago a la cuenta de Mercado Pago de la
          persona que pidió ayuda. Nosotros no la recibimos, no la
          administramos y no la podemos retener.
        </p>
        <p>De cada donación se descuentan dos cosas:</p>
        <ol className="ml-5 flex list-decimal flex-col gap-2">
          <li>
            La comisión de <strong className="text-foreground">Mercado Pago</strong>,
            que la fija Mercado Pago y no depende de nosotros.
          </li>
          <li>
            El <strong className="text-foreground">{PLATFORM_FEE_LABEL}</strong> del
            monto que donás, que se queda lacomu para pagar la infraestructura
            y el desarrollo.
          </li>
        </ol>
        <p>
          El resto llega a la persona. Esto quiere decir que el monto que
          recibe es menor al que vos pusiste — lo aclaramos antes de que
          pagues, no después.
        </p>
      </DocSection>

      <DocSection title="Qué NO hacemos">
        <p>
          Queremos ser explícitos con esto porque afecta tu decisión de donar:
        </p>
        <ul className="ml-5 flex list-disc flex-col gap-2">
          <li>
            <strong className="text-foreground">
              No verificamos que lo que cuenta cada persona sea verdad.
            </strong>{" "}
            No pedimos comprobantes ni hacemos investigaciones. Leé el pedido
            y decidí vos.
          </li>
          <li>
            No revisamos las campañas antes de que se publiquen.
          </li>
          <li>
            No garantizamos que la plata se use para lo que se dijo.
          </li>
          <li>
            No podemos devolverte una donación: la plata nunca estuvo en
            nuestras manos. Un reclamo va por Mercado Pago.
          </li>
        </ul>
        <p>
          Si ves un pedido que parece falso o abusivo, escribinos y lo damos
          de baja.
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
            href="/privacidad"
            className="underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            Privacidad
          </Link>
        </p>
      </DocSection>
    </DocPage>
  );
}
