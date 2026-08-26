/**
 * Comisión de la plataforma, para sostener infraestructura y desarrollo.
 *
 * Vive en su propio módulo (y no en lib/mercadopago.ts) para que el
 * cliente pueda importarla sin arrastrar el código que lee las
 * credenciales de MP del entorno.
 *
 * Se cobra vía `marketplace_fee` del modelo Marketplace de MP: **Mercado
 * Pago hace el split solo**, la plata no pasa por ninguna cuenta nuestra
 * — por eso sigue siendo cierto que lacomu no custodia fondos.
 *
 * Orden de descuentos según la doc de MP: primero la comisión de Mercado
 * Pago, y del resto se descuenta esta. El beneficiario recibe entonces:
 * monto − comisión MP − comisión lacomu.
 *
 * Debe estar declarada en la UI y en los términos: el donante tiene
 * derecho a saber que no llega el 100% de lo que puso.
 */
export const PLATFORM_FEE_RATE = 0.01;

/** Porcentaje listo para mostrar, ej. "1%". */
export const PLATFORM_FEE_LABEL = `${PLATFORM_FEE_RATE * 100}%`;

/** Comisión de lacomu para un monto dado, redondeada a centavos. */
export function platformFeeFor(amount: number) {
  return Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
}
