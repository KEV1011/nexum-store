// ── La voz que suena con cada notificación ───────────────────────────────────
//
// Los audios se generan UNA vez (workflow «Generar voces», tools/voces) y van
// dentro de las apps como sonido de la notificación: así suenan con la app
// cerrada y cada aviso cuesta cero. El servidor solo dice CUÁL suena.
//
// Si la app instalada todavía no trae esa voz, no se rompe nada: Android usa
// el canal por defecto y iOS el sonido normal, porque los dos ignoran un
// sonido que no tienen.

export const VOCES_AVISO = [
  'conductor_en_camino',
  'conductor_llego',
  'repartidor_llego',
  'pedido_en_camino',
  'mandado_en_camino',
  'mensaje_nuevo',
  'viaje_cancelado',
] as const;

export type VozAviso = (typeof VOCES_AVISO)[number];

/** Canal de Android de la voz: en Android 8+ el sonido es del CANAL. */
export function canalDeVoz(voz: VozAviso): string {
  return `zipa_voz_${voz}`;
}

/** Archivo de sonido en el paquete de iOS. */
export function sonidoIosDeVoz(voz: VozAviso): string {
  return `zipa_voz_${voz}.wav`;
}
