/**
 * Pesos colombianos, en UN solo sitio para los dos portales.
 *
 * Estaba copiado en doce archivos entre `/empresa` y `/negocio`, y las copias
 * ya habían divergido: once usaban `Intl.NumberFormat('es-CO', {style:
 * 'currency'})`, que devuelve «$ 5.200» —con espacio, porque ese es el patrón
 * de moneda del locale— y una lo escribía a mano como «$5.200». O sea que el
 * mismo panel enseñaba el precio de dos maneras según la pestaña.
 *
 * Es el mismo defecto que las apps tenían en Dart, donde el locale colocaba el
 * símbolo DETRÁS («5.200 $»). La forma en que se escribe un precio en Colombia
 * no la decide el ICU: la decide la costumbre, y es el peso pegado al número.
 */

/**
 * 15750 → «$15.750». Redondea: en un precio no hay centavos.
 *
 * Acepta un importe ausente porque dos pantallas lo llaman con campos
 * opcionales (el valor de un flete que aún no se ha puesto). «$0» dice la
 * verdad —no hay importe— y no tumba la página, que es lo que haría el
 * `toLocaleString` de un undefined.
 */
export function formatCOP(valor: number | null | undefined): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '$0';
  return `$${Math.round(valor).toLocaleString('es-CO')}`;
}

/**
 * Un número sin el peso, con el punto de miles: 18000 → «18.000».
 *
 * Para kilos, bultos, rollos y metros, donde poner «$» sería decir que es
 * dinero. Admite decimales porque las medidas sí los tienen (124,5 m).
 */
export function formatNumero(
  valor: number | null | undefined,
  decimales = 1,
): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '0';
  return valor.toLocaleString('es-CO', { maximumFractionDigits: decimales });
}
