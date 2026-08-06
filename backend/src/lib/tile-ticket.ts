// ── Pase de corta duración para los tiles del mapa ───────────────────────────
//
// Una capa de tiles no puede poner cabeceras: flutter_map y Leaflet construyen
// `<img src="…">`, así que el permiso tiene que viajar en la URL. Hasta ahora
// lo que viajaba era el JWT de sesión, de 30 días, en el query string de CADA
// imagen — y una sola panorámica del mapa son decenas. Ese token acaba en los
// logs de acceso de Render, en cualquier CDN o proxy intermedio y en el
// historial del navegador. Quien lo lea tiene la sesión completa: viajes,
// perfil, pagos.
//
// El pase de aquí no sirve para nada más que pedir imágenes de mapa, dura dos
// horas y no contiene datos de nadie: solo su propia caducidad y una firma. Si
// se filtra, lo peor que se puede hacer con él es mirar mapas hasta que venza.

import { createHmac, timingSafeEqual } from 'crypto';

/** Duración del pase. Corta, pero de sobra para una sesión de navegación. */
export const TILE_TICKET_TTL_S = Number(process.env['TILE_TICKET_TTL_S'] ?? 2 * 60 * 60);

/**
 * Firma con un secreto DERIVADO del de la aplicación: así un pase nunca puede
 * confundirse con un JWT ni reutilizarse contra otra ruta, aunque alguien
 * lograra que se validara en el sitio equivocado.
 */
function _clave(secreto: string): string {
  return createHmac('sha256', secreto).update('nexum:tile-ticket:v1').digest('hex');
}

function _firma(secreto: string, exp: number): string {
  return createHmac('sha256', _clave(secreto)).update(String(exp)).digest('hex').slice(0, 32);
}

/** Emite un pase válido durante TILE_TICKET_TTL_S segundos. */
export function emitirTilePase(secreto: string, ahoraMs: number = Date.now()): string {
  const exp = Math.floor(ahoraMs / 1000) + TILE_TICKET_TTL_S;
  return `${exp}.${_firma(secreto, exp)}`;
}

/** Comprueba el pase: formato, firma y vigencia. */
export function verificarTilePase(
  secreto: string,
  pase: string | undefined,
  ahoraMs: number = Date.now(),
): boolean {
  if (!pase) return false;
  const punto = pase.indexOf('.');
  if (punto <= 0) return false;

  const exp = Number(pase.slice(0, punto));
  if (!Number.isInteger(exp) || exp * 1000 <= ahoraMs) return false;

  const dada = Buffer.from(pase.slice(punto + 1));
  const esperada = Buffer.from(_firma(secreto, exp));
  // Comparación de tiempo constante: la caducidad va en claro y es del atacante,
  // así que lo único que protege el pase es que no pueda tantear la firma.
  return dada.length === esperada.length && timingSafeEqual(dada, esperada);
}
