/**
 * Si el intermunicipal está abierto al público, o aplazado.
 *
 * POR QUÉ EXISTE. Decisión del usuario: aplazar el intermunicipal y enfocarse
 * en domicilios y movilidad urbana mientras se habilitan las empresas de
 * transporte de la región. Las dos apps ya lo anuncian como «próximamente» y
 * sus botones están apagados.
 *
 * Pero eso NO lo cierra: una app ya instalada sigue teniendo la interfaz vieja
 * con los botones vivos, y quien no actualice puede seguir pidiendo un viaje
 * intermunicipal que nadie va a despachar — se queda esperando y nadie se
 * enteraría de que esa solicitud existe. El cierre de verdad tiene que estar
 * en el servidor, que es el único sitio por el que pasan todas las versiones.
 *
 * ESTÁ CERRADO POR DEFECTO, al revés que los otros interruptores del
 * repositorio (`KYC_ENFORCE`, `RNDC_EXIGIR`, `DOC_KILL_SWITCH_ENFORCE`), que
 * nacen apagados para no cambiar el comportamiento de golpe. Aquí la decisión
 * ya está tomada y el riesgo es el contrario: dejarlo abierto «por si acaso»
 * es justo lo que deja solicitudes colgadas.
 *
 * QUÉ CIERRA Y QUÉ NO. Solo cierra PEDIR algo nuevo. Lo que ya existe se sigue
 * pudiendo consultar, seguir y cancelar: cerrarle el seguimiento a quien tiene
 * una reserva en curso sería quitarle la información de un viaje que sí va a
 * ocurrir. Y tampoco toca el portal de empresas: una flota habilitada
 * publicando sus salidas es otra decisión, y no hay ninguna verificada todavía.
 */

/** Para reabrirlo: `INTERMUNICIPAL_ABIERTO=true` en el entorno. */
export function intermunicipalAbierto(): boolean {
  return process.env['INTERMUNICIPAL_ABIERTO'] === 'true';
}

/**
 * Lo que se le dice a quien lo intenta.
 *
 * Dice POR QUÉ y no solo que no se puede: «no disponible» hace pensar en un
 * fallo de la app y se reintenta tres veces. Y no promete una fecha, que es lo
 * único que no se puede saber todavía.
 */
export const INTERMUNICIPAL_APLAZADO =
  'El servicio intermunicipal abre pronto: estamos habilitando las empresas de '
  + 'transporte de la región. Por ahora puedes pedir viajes y envíos dentro de '
  + 'tu ciudad.';

/** `null` si se puede seguir, o el motivo para rechazarlo. */
export function motivoParaNoPedirIntermunicipal(): string | null {
  return intermunicipalAbierto() ? null : INTERMUNICIPAL_APLAZADO;
}
