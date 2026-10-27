// ── El portal del negocio como app instalable (PWA) ─────────────────────────
//
// POR QUÉ. El dueño abre su portal desde un enlace que guardó en WhatsApp, y
// cada vez tiene que buscarlo. Instalado, queda en la pantalla del celular con
// el nombre de su local, se abre sin barra del navegador y no se pierde.
//
// UN MANIFIESTO POR NEGOCIO. El portal vive en `/negocio/<token>`; un
// manifiesto único para todos abriría el de nadie. Cada uno lleva su
// `start_url` y su `scope` dentro de SU enlace.
//
// SIN SERVICE WORKER QUE GUARDE NADA, a propósito: un portal de pedidos
// servido de una copia vieja le mostraría al dueño pedidos que ya no existen
// y precios que ya cambió. Chrome ya no exige service worker para instalar.
//
// Sin React ni Next: lo prueba el backend con sus pruebas (patrón de `moneda.ts`).

/** El color de la barra del sistema: el verde de arriba del ícono. */
export const COLOR_TEMA = '#065f46'

export const ICONOS_PWA = [
  { src: '/pwa/zipa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/pwa/zipa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  // El ícono va a sangre con el logo en la zona segura: sirve recortado.
  { src: '/pwa/zipa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
] as const

/** El que pone iOS en la pantalla de inicio (no lee el manifiesto). */
export const ICONO_APPLE = '/pwa/apple-touch-icon.png'

/**
 * El nombre bajo el ícono. Android y iOS cortan hacia los 12 caracteres: se
 * corta por palabra antes de que el sistema lo corte por la mitad.
 */
export function nombreCorto(nombre: string): string {
  const limpio = nombre.replace(/\s+/g, ' ').trim() || 'Mi negocio'
  if (limpio.length <= 12) return limpio
  let corto = ''
  for (const palabra of limpio.split(' ')) {
    const siguiente = corto ? `${corto} ${palabra}` : palabra
    if (siguiente.length > 12) break
    corto = siguiente
  }
  return corto || limpio.slice(0, 12)
}

/** La dirección del portal de este negocio, sin barra final. */
export function rutaDelPortal(token: string): string {
  return `/negocio/${encodeURIComponent(token)}`
}

export function manifiestoDeNegocio(token: string, nombre: string) {
  const ruta = rutaDelPortal(token)
  const limpio = nombre.replace(/\s+/g, ' ').trim() || 'Mi negocio'
  return {
    // El id fija la identidad de la app instalada: si el dueño cambia el
    // nombre de su local, se actualiza la misma, no aparece una segunda.
    id: ruta,
    name: `${limpio} · ZIPA`,
    short_name: nombreCorto(limpio),
    description: `Pedidos, carta y caja de ${limpio}.`,
    lang: 'es-CO',
    dir: 'ltr',
    start_url: ruta,
    // Sin barra final: el `scope` es un PREFIJO, y con ella `start_url` (que
    // Next sirve sin barra) quedaría fuera del alcance de la propia app.
    scope: ruta,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: COLOR_TEMA,
    icons: ICONOS_PWA.map((i) => ({ ...i })),
  }
}
