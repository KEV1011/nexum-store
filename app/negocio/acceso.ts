// ── Qué ve cada persona del equipo en el portal ─────────────────────────────
//
// El portal ENSEÑA solo lo que el rol puede usar, para que el mesero no vea
// botones que le van a decir «no tienes permiso». Pero esto es comodidad: quien
// decide es el servidor (`backend/src/lib/permisos-portal.ts`). La prueba
// `backend/src/lib/permisos-portal.test.ts` compara las dos tablas, así que si
// aquí se enseña una pantalla que el servidor no abre, la prueba falla.
//
// Sin React ni Next: lo importa la prueba del backend (patrón de `moneda.ts`).

export type RolPortal = 'DUENO' | 'ENCARGADO' | 'CAJA' | 'MESERO' | 'COCINA'
export type RolPersonal = Exclude<RolPortal, 'DUENO'>

export const ROLES_PERSONAL: readonly RolPersonal[] = ['ENCARGADO', 'CAJA', 'MESERO', 'COCINA']

export const NOMBRE_DEL_ROL: Record<RolPortal, string> = {
  DUENO: 'Dueño',
  ENCARGADO: 'Encargado',
  CAJA: 'Caja',
  MESERO: 'Mesero',
  COCINA: 'Cocina',
}

/** Lo que hace cada rol, dicho al dueño cuando elige. */
export const QUE_HACE: Record<RolPersonal, string> = {
  ENCARGADO: 'Todo el portal menos los giros, tu clave y el equipo.',
  CAJA: 'La caja, cobrar las mesas y los pedidos del día.',
  MESERO: 'Las mesas: tomar pedidos, marcar servido y ver la cuenta.',
  COCINA: 'Solo el tablero de la cocina y marcar los platos listos.',
}

export type Pantalla =
  | 'pedidos'
  | 'pedido'
  | 'cocina'
  | 'cuentas'
  | 'cuenta'
  | 'caja'
  | 'ventas'
  | 'catalogo'
  | 'ajustes'

/**
 * Cada pantalla, su dirección dentro del portal y lo que pide al abrirse.
 * Si el servidor no abre lo que una pantalla pide al cargar, enseñarla sería
 * enseñar un error: la prueba lo comprueba con esta lista.
 */
export const PANTALLAS: Record<Pantalla, { ruta: string; carga: readonly string[] }> = {
  pedidos: { ruta: '', carga: ['GET /orders', 'GET /client-orders'] },
  pedido: { ruta: '/pedido', carga: ['GET /orders/:orderId'] },
  cocina: { ruta: '/cocina', carga: ['GET /cocina'] },
  cuentas: { ruta: '/cuentas', carga: ['GET /cuentas'] },
  cuenta: { ruta: '/cuenta', carga: ['GET /cuentas/:tabId'] },
  caja: { ruta: '/caja', carga: ['GET /caja'] },
  ventas: { ruta: '/ventas', carga: ['GET /ventas'] },
  catalogo: { ruta: '/catalogo', carga: ['GET /products'] },
  ajustes: { ruta: '/ajustes', carga: ['GET /settings'] },
}

const TODAS = Object.keys(PANTALLAS) as Pantalla[]

export const PANTALLAS_DEL_ROL: Record<RolPortal, readonly Pantalla[]> = {
  DUENO: TODAS,
  ENCARGADO: TODAS,
  CAJA: ['pedidos', 'pedido', 'cuentas', 'cuenta', 'caja'],
  MESERO: ['cuentas', 'cuenta'],
  COCINA: ['cocina'],
}

export function puedeVer(rol: RolPortal | null, pantalla: Pantalla): boolean {
  // Mientras se sabe quién es, se enseña lo de siempre: el dueño es quien
  // más usa el portal y no puede ver la pantalla parpadear.
  if (!rol) return true
  return PANTALLAS_DEL_ROL[rol].includes(pantalla)
}

/** A dónde entra cada rol cuando abre su enlace. */
export function pantallaDeInicio(rol: RolPortal): Pantalla {
  return PANTALLAS_DEL_ROL[rol][0] ?? 'pedidos'
}

/**
 * Los botones que dependen del rol DENTRO de una pantalla que sí ve. La
 * prueba exige que coincidan con los roles que el servidor deja.
 */
export const ACCIONES = {
  cerrarCuenta: { peticion: 'POST /cuentas/:tabId/cerrar', roles: ['DUENO', 'ENCARGADO', 'CAJA'] },
  cancelarRonda: { peticion: 'POST /cuentas/ronda/:orderId/cancelar', roles: ['DUENO', 'ENCARGADO', 'CAJA', 'MESERO'] },
  tomarPedido: { peticion: 'GET /mesas', roles: ['DUENO', 'ENCARGADO', 'CAJA', 'MESERO'] },
  aceptarPedido: { peticion: 'POST /client-orders/:orderId/accept', roles: ['DUENO', 'ENCARGADO', 'CAJA'] },
  verEquipo: { peticion: 'GET /equipo', roles: ['DUENO'] },
  verGiros: { peticion: 'GET /giros', roles: ['DUENO'] },
  verClave: { peticion: 'GET /clave', roles: ['DUENO'] },
} as const satisfies Record<string, { peticion: string; roles: readonly RolPortal[] }>

export type Accion = keyof typeof ACCIONES

export function puede(rol: RolPortal | null, accion: Accion): boolean {
  if (!rol) return accion !== 'verEquipo' && accion !== 'verGiros' && accion !== 'verClave'
  return (ACCIONES[accion].roles as readonly RolPortal[]).includes(rol)
}
