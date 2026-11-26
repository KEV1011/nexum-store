// ── El domicilio lo fija ZIPA, no cada comercio ──────────────────────────────
//
// Antes cada negocio ponía su propio domicilio en el portal (2.500 por
// defecto, y cada uno el que quisiera). Decisión del dueño para retener
// clientela: UN domicilio para todos los pedidos a comercios, hoy 4.000.
//
// Vive en UN sitio porque lo leen la lista de comercios, el detalle, la
// cotización de la pantalla y la caja: si dos de ellos lo decidieran por su
// cuenta, el cliente vería un precio y pagaría otro, que es la peor queja.
//
// Se cambia sin tocar código con `DOMICILIO_FIJO_COP` en Render:
//   - sin poner      → 4.000
//   - un número      → ese domicilio para todos (0 = domicilio gratis)
//   - «comercio»     → vuelve a mandar lo que cada negocio puso en su portal
//
// El domicilio es el pago del repartidor (menos la comisión): bajarlo baja lo
// que gana él por entrega, no lo que cobra el local.

export const DOMICILIO_FIJO_POR_DEFECTO = 4000;

/** Por encima de esto es un cero de más, no una tarifa. */
const DOMICILIO_MAXIMO = 50_000;

/**
 * El domicilio fijo vigente, o null si manda lo que puso cada comercio.
 * Un valor ilegible NO apaga el fijo: cae al de por defecto, porque dejar que
 * cada comercio vuelva a poner el suyo por un error de escritura cambiaría el
 * precio en toda la app sin que nadie lo decidiera.
 */
export function domicilioFijo(valor: string | undefined = process.env.DOMICILIO_FIJO_COP): number | null {
  const v = (valor ?? '').trim().toLowerCase();
  if (v === '') return DOMICILIO_FIJO_POR_DEFECTO;
  if (v === 'comercio' || v === 'por-comercio') return null;
  const limpio = v.replace(/[$.\s]/g, '');
  if (!/^\d+$/.test(limpio)) return DOMICILIO_FIJO_POR_DEFECTO;
  const n = Number(limpio);
  if (n > DOMICILIO_MAXIMO) return DOMICILIO_FIJO_POR_DEFECTO;
  return n;
}

/** El domicilio que se cobra por un pedido a este comercio. */
export function domicilioDeTienda(
  feeDelComercio: number | null | undefined,
  valor: string | undefined = process.env.DOMICILIO_FIJO_COP,
): number {
  const fijo = domicilioFijo(valor);
  if (fijo !== null) return fijo;
  return Math.max(0, Math.round(feeDelComercio ?? 0));
}

/** Para `/health`: qué regla está mandando. */
export function modoDomicilio(valor: string | undefined = process.env.DOMICILIO_FIJO_COP): string {
  const fijo = domicilioFijo(valor);
  return fijo === null ? 'por-comercio' : `fijo-${fijo}`;
}
