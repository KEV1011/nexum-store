// ── Quién del equipo puede hacer qué en el portal del negocio ────────────────
//
// POR QUÉ. Antes había UN enlace por negocio, el del dueño, y quien lo tenía
// podía todo: el mesero que abría el portal para ver las mesas veía también
// las ventas, los giros y la clave. Ahora cada persona tiene su enlace con un
// ROL, y el servidor decide aquí qué rutas abre ese rol.
//
// FALLA CERRADA. Lo que NO está en esta tabla solo lo puede el dueño. Es la
// lección del panel de administración: allí las rutas se protegían
// apuntándolas en una lista, y cada ruta nueva nacía abierta hasta que alguien
// se acordaba. Aquí es al revés: una ruta nueva nace solo del dueño, y abrirla
// al equipo es una decisión que se escribe. `permisos-portal.test.ts` falla si
// una ruta del portal no está clasificada en ninguna de las dos listas.
//
// El portal OCULTA lo que el rol no puede hacer (`app/negocio/acceso.ts`),
// pero eso es comodidad: quien manda es esta tabla.
//
// Sin dependencias: lo importan las rutas, el WebSocket y las pruebas.

export const ROLES_PERSONAL = ['ENCARGADO', 'CAJA', 'MESERO', 'COCINA'] as const;
export type RolPersonal = (typeof ROLES_PERSONAL)[number];
/** El dueño no es un rol de la tabla: es quien tiene el enlace del negocio. */
export type RolPortal = 'DUENO' | RolPersonal;

export const NOMBRE_DEL_ROL: Record<RolPortal, string> = {
  DUENO: 'Dueño',
  ENCARGADO: 'Encargado',
  CAJA: 'Caja',
  MESERO: 'Mesero',
  COCINA: 'Cocina',
};

export function esRolPersonal(v: unknown): v is RolPersonal {
  return typeof v === 'string' && (ROLES_PERSONAL as readonly string[]).includes(v);
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Regla {
  metodo: Metodo;
  /** La ruta tal como está declarada, sin el `/:token` del principio. */
  ruta: string;
  roles: readonly RolPersonal[];
}

const TODOS: readonly RolPersonal[] = ROLES_PERSONAL;
const SALA: readonly RolPersonal[] = ['ENCARGADO', 'CAJA', 'MESERO'];
const MOSTRADOR: readonly RolPersonal[] = ['ENCARGADO', 'CAJA'];
const ENCARGADO: readonly RolPersonal[] = ['ENCARGADO'];

/**
 * Lo que el equipo puede abrir, por rol.
 *
 * - COCINA: el tablero de cocina y marcar (o desmarcar) un plato listo.
 * - MESERO: mesas y cuentas, tomar pedido en la mesa (eso va por la carta
 *   pública, ver `mesa.service`), marcar servido y cancelar una ronda.
 * - CAJA: la caja, cerrar y reabrir cuentas, y los pedidos del día —incluido
 *   aceptarlos y rechazarlos: es quien está en el mostrador—.
 * - ENCARGADO: lo de todos más el catálogo, los ajustes, las ventas y las
 *   reseñas. NO los giros (la plata que ZIPA le debe al dueño), la clave
 *   personal ni el equipo: esas no están en la tabla, así que son del dueño.
 */
export const PERMISOS_PERSONAL: readonly Regla[] = [
  // Todos: saber quién es y de qué negocio.
  { metodo: 'GET', ruta: '/info', roles: TODOS },
  { metodo: 'GET', ruta: '/acceso', roles: TODOS },

  // Cocina.
  { metodo: 'GET', ruta: '/cocina', roles: ['ENCARGADO', 'COCINA'] },
  { metodo: 'DELETE', ruta: '/cocina/:orderId/listo', roles: ['ENCARGADO', 'COCINA'] },
  { metodo: 'POST', ruta: '/client-orders/:orderId/ready', roles: ['ENCARGADO', 'CAJA', 'COCINA'] },

  // Sala.
  { metodo: 'GET', ruta: '/mesas', roles: SALA },
  { metodo: 'GET', ruta: '/cuentas', roles: SALA },
  { metodo: 'GET', ruta: '/cuentas/:tabId', roles: SALA },
  { metodo: 'POST', ruta: '/client-orders/:orderId/servido', roles: SALA },
  { metodo: 'POST', ruta: '/cuentas/ronda/:orderId/cancelar', roles: SALA },

  // Mostrador: la caja y los pedidos del día.
  { metodo: 'POST', ruta: '/cuentas/:tabId/cerrar', roles: MOSTRADOR },
  { metodo: 'POST', ruta: '/cuentas/:tabId/reabrir', roles: MOSTRADOR },
  { metodo: 'GET', ruta: '/cuentas-reabiertas', roles: MOSTRADOR },
  { metodo: 'GET', ruta: '/caja', roles: MOSTRADOR },
  { metodo: 'POST', ruta: '/caja/abrir', roles: MOSTRADOR },
  { metodo: 'POST', ruta: '/caja/cerrar', roles: MOSTRADOR },
  { metodo: 'GET', ruta: '/orders', roles: MOSTRADOR },
  { metodo: 'GET', ruta: '/orders/:orderId', roles: MOSTRADOR },
  { metodo: 'GET', ruta: '/stats', roles: MOSTRADOR },
  { metodo: 'GET', ruta: '/client-orders', roles: MOSTRADOR },
  { metodo: 'POST', ruta: '/client-orders/:orderId/accept', roles: MOSTRADOR },
  { metodo: 'POST', ruta: '/client-orders/:orderId/reject', roles: MOSTRADOR },

  // Encargado: ajustes del local.
  { metodo: 'GET', ruta: '/settings', roles: ENCARGADO },
  { metodo: 'PUT', ruta: '/settings', roles: ENCARGADO },
  { metodo: 'PUT', ruta: '/location', roles: ENCARGADO },
  { metodo: 'PUT', ruta: '/shipping', roles: ENCARGADO },
  { metodo: 'PUT', ruta: '/mesas', roles: ENCARGADO },
  { metodo: 'GET', ruta: '/reviews', roles: ENCARGADO },
  { metodo: 'GET', ruta: '/ventas', roles: ENCARGADO },
  { metodo: 'GET', ruta: '/ventas.csv', roles: ENCARGADO },

  // Encargado: catálogo, carta y marca.
  { metodo: 'GET', ruta: '/products', roles: ENCARGADO },
  { metodo: 'GET', ruta: '/products/csv-template', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products/csv-preview', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products/csv-import', roles: ENCARGADO },
  { metodo: 'GET', ruta: '/products/barcode/:code', roles: ENCARGADO },
  { metodo: 'PUT', ruta: '/products/order', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products', roles: ENCARGADO },
  { metodo: 'PATCH', ruta: '/products/:productId', roles: ENCARGADO },
  { metodo: 'DELETE', ruta: '/products/:productId', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products/:productId/photo', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products/carta-foto', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products/carta-reporte', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products/carta-revisar', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products/carta-corregir', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products/carta-importar', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products/revisar-catalogo', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products/revisar-catalogo/aplicar', roles: ENCARGADO },
  { metodo: 'GET', ruta: '/option-groups', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/option-groups/:groupId?', roles: ENCARGADO },
  { metodo: 'DELETE', ruta: '/option-groups/:groupId', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/option-groups/:groupId/aplicar', roles: ENCARGADO },
  { metodo: 'PUT', ruta: '/products/:productId/options', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/products/:productId/gallery', roles: ENCARGADO },
  { metodo: 'DELETE', ruta: '/products/:productId/gallery/:photoId', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/logo', roles: ENCARGADO },
  { metodo: 'DELETE', ruta: '/logo', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/fotos', roles: ENCARGADO },
  { metodo: 'DELETE', ruta: '/fotos', roles: ENCARGADO },
  { metodo: 'PUT', ruta: '/marca', roles: ENCARGADO },
  { metodo: 'POST', ruta: '/cover', roles: ENCARGADO },
];

/**
 * Las rutas que SOLO son del dueño, escritas a propósito.
 *
 * No hacen falta para que funcione (lo no listado ya es del dueño); están
 * para que la prueba pueda exigir que TODA ruta del portal esté en una lista
 * u otra: así abrir o cerrar una ruta al equipo siempre es una decisión.
 */
export const SOLO_DEL_DUENO: readonly { metodo: Metodo; ruta: string }[] = [
  { metodo: 'GET', ruta: '/clave' },
  { metodo: 'PUT', ruta: '/clave' },
  { metodo: 'GET', ruta: '/giros' },
  { metodo: 'GET', ruta: '/equipo' },
  { metodo: 'POST', ruta: '/equipo' },
  { metodo: 'DELETE', ruta: '/equipo/:staffId' },
];

/** Los segmentos de una ruta, sin barras vacías. */
function segmentos(ruta: string): string[] {
  return ruta.split('/').filter(Boolean);
}

/**
 * ¿La ruta declarada (`/cuentas/:tabId`) casa con la petición
 * (`/cuentas/abc123`)? Un `:x` casa un segmento; `:x?` puede faltar.
 */
export function casaRuta(patron: string, ruta: string): boolean {
  const p = segmentos(patron);
  const r = segmentos(ruta);
  let i = 0;
  for (; i < p.length; i++) {
    const seg = p[i]!;
    if (seg.startsWith(':') && seg.endsWith('?')) {
      // Opcional: solo puede ir al final (así lo declara Express aquí).
      return r.length === i || (r.length === i + 1 && i === p.length - 1);
    }
    if (i >= r.length) return false;
    if (seg.startsWith(':')) continue;
    if (seg !== r[i]) return false;
  }
  return r.length === p.length;
}

/** Cuántos segmentos fijos tiene: entre dos que casan, gana el más concreto. */
function concrecion(patron: string): number {
  return segmentos(patron).filter((s) => !s.startsWith(':')).length;
}

/** La regla que gobierna esta petición, o null si no hay (= solo el dueño). */
export function reglaDe(metodo: string, ruta: string): Regla | null {
  const m = metodo.toUpperCase();
  let mejor: Regla | null = null;
  for (const r of PERMISOS_PERSONAL) {
    if (r.metodo !== m || !casaRuta(r.ruta, ruta)) continue;
    if (!mejor || concrecion(r.ruta) > concrecion(mejor.ruta)) mejor = r;
  }
  return mejor;
}

/** ¿Puede este rol hacer esta petición? El dueño, siempre. */
export function rutaPermitida(rol: RolPortal, metodo: string, ruta: string): boolean {
  if (rol === 'DUENO') return true;
  // HEAD es un GET sin cuerpo: lo mismo que el GET.
  const m = metodo.toUpperCase() === 'HEAD' ? 'GET' : metodo;
  const regla = reglaDe(m, ruta);
  return regla !== null && regla.roles.includes(rol);
}

/** Lo que se le dice a quien no puede, en sus palabras. */
export function mensajeSinPermiso(rol: RolPortal): string {
  return `Tu acceso de ${NOMBRE_DEL_ROL[rol].toLowerCase()} no permite esto. Si lo necesitas, pídeselo al dueño.`;
}

/**
 * Qué avisos en vivo le llegan a cada rol. Los pedidos y sus cambios, a todo
 * el equipo; «no encontramos repartidor» a quien puede decidir (la cocina no);
 * los giros solo al dueño, que es de quien es la plata.
 */
export function recibeAviso(rol: RolPortal, tipo: 'pedido' | 'sin_repartidor' | 'giro'): boolean {
  if (rol === 'DUENO') return true;
  if (tipo === 'giro') return false;
  if (tipo === 'sin_repartidor') return rol !== 'COCINA';
  return true;
}
