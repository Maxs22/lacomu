import Link from "next/link";
import type { Metadata } from "next";
import { DocPage, DocSection } from "@/components/doc-page";
import { PLATFORM_FEE_LABEL } from "@/lib/fees";

export const metadata: Metadata = {
  title: "Términos y condiciones — lacomu",
  description:
    "Reglas de uso de lacomu: qué podés publicar, cómo se maneja la plata y qué responsabilidad asume cada parte.",
};

export default function TerminosPage() {
  return (
    <DocPage title="Términos y condiciones" updatedAt="26 de agosto de 2026">
      <p className="text-lg leading-relaxed text-foreground">
        Al usar lacomu aceptás lo que sigue. Está escrito para que se
        entienda, no para esconder nada en letra chica.
      </p>

      <DocSection title="1. Qué es lacomu">
        <p>
          lacomu es una plataforma que conecta personas u organizaciones que
          piden ayuda económica con personas que quieren darla. No somos una
          entidad financiera, no somos una ONG y no intermediamos fondos.
        </p>
      </DocSection>

      <DocSection title="2. La plata no pasa por lacomu">
        <p>
          Los pagos se procesan íntegramente a través de Mercado Pago, con la
          cuenta de Mercado Pago de la persona que recibe la ayuda. lacomu no
          recibe, no retiene y no administra el dinero de las donaciones.
        </p>
        <p>
          De cada donación se descuenta primero la comisión de Mercado Pago y
          después una comisión de{" "}
          <strong className="text-foreground">{PLATFORM_FEE_LABEL}</strong>{" "}
          que corresponde a lacomu para sostener infraestructura y
          desarrollo. El remanente lo recibe directamente el beneficiario.
        </p>
        <p>
          Como consecuencia de lo anterior, lacomu no puede emitir
          devoluciones. Cualquier reclamo sobre un pago se gestiona con
          Mercado Pago.
        </p>
      </DocSection>

      <DocSection title="3. No verificamos los pedidos">
        <p>
          Las campañas se publican automáticamente, sin revisión previa. No
          verificamos la veracidad de lo que cada persona relata, ni pedimos
          documentación respaldatoria, ni controlamos el destino final de los
          fondos.
        </p>
        <p>
          Quien dona lo hace por decisión propia, evaluando la información que
          la otra persona publicó. lacomu no garantiza ningún resultado ni
          responde por el uso que se le dé al dinero.
        </p>
      </DocSection>

      <DocSection title="4. Qué no se puede publicar">
        <p>
          No podés usar lacomu para pedir dinero mediante datos falsos,
          suplantando la identidad de otra persona u organización, ni para
          fines ilícitos. Tampoco para publicar contenido que hostigue o
          exponga a terceros.
        </p>
        <p>
          Podemos dar de baja una campaña que incumpla esto, o que nos sea
          reportada con indicios razonables de fraude, sin aviso previo.
        </p>
      </DocSection>

      <DocSection title="5. Tu cuenta">
        <p>
          El acceso es con tu email mediante un código de un solo uso. Sos
          responsable de mantener el acceso a ese email. Para recibir
          donaciones tenés que vincular tu propia cuenta de Mercado Pago; esa
          vinculación la podés revocar desde Mercado Pago.
        </p>
      </DocSection>

      <DocSection title="6. Límites de responsabilidad">
        <p>
          lacomu se ofrece tal como está. No garantizamos disponibilidad
          continua ni ausencia de errores. En la medida que lo permita la ley
          aplicable, no respondemos por daños derivados del uso de la
          plataforma, de la conducta de otros usuarios, ni de fallas de
          Mercado Pago o de otros servicios de terceros.
        </p>
      </DocSection>

      <DocSection title="7. Cambios">
        <p>
          Podemos actualizar estos términos. Si el cambio es relevante lo
          vamos a avisar en el sitio. La fecha de arriba indica la última
          modificación.
        </p>
      </DocSection>

      <DocSection title="8. Contacto">
        <p>
          Por dudas, reportes de campañas o reclamos, escribinos a{" "}
          <a
            href="mailto:hola@lacomu.ar"
            className="underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            hola@lacomu.ar
          </a>
          .
        </p>
        <p>
          Ver también{" "}
          <Link
            href="/como-funciona"
            className="underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            cómo funciona
          </Link>{" "}
          y{" "}
          <Link
            href="/privacidad"
            className="underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            privacidad
          </Link>
          .
        </p>
      </DocSection>
    </DocPage>
  );
}
