/**
 * «Esta base es de pruebas, ¿verdad?»
 *
 * POR QUÉ EXISTE. Tres de estos scripts hacen `deleteMany({})` SIN filtro
 * sobre `trips` y `users` —a propósito: miden cifras globales y cualquier fila
 * previa las contaminaría—. Lo que no existía era nada que comprobara contra
 * QUÉ base se está corriendo: se invocan con `DATABASE_URL=... npx tsx ...`,
 * y un copiar y pegar con la cadena de Render borraba todos los viajes y
 * todos los usuarios de producción. No hace falta mala intención, basta una
 * terminal con la variable todavía exportada de antes.
 *
 * FALLA CERRADO. Sin `DATABASE_URL`, con una que no se entiende o con un host
 * que no es de esta máquina, aborta. Preferir «no corre la prueba» a «corre
 * contra lo que sea» es barato: lo peor que pasa es que alguien añada su host
 * a la lista.
 *
 * Lo que NO promete: que la base sea «de pruebas». Promete que está en esta
 * máquina. Una base local con datos que alguien quiere conservar se pierde
 * igual — por eso el mensaje dice qué se va a borrar.
 */

/** Hosts que se consideran «esta máquina». */
const LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', 'db', 'postgres']);

export interface Veredicto {
  local: boolean;
  /** Por qué no, en palabras, para poder imprimirlo. */
  motivo: string;
  host: string;
}

/**
 * Decide si una cadena de conexión apunta a esta máquina. Pura y exportada
 * para poder probarla sin tocar `process.env`.
 */
export function esBaseLocal(url: string | undefined): Veredicto {
  if (!url || !url.trim()) {
    return { local: false, motivo: 'no hay DATABASE_URL', host: '' };
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { local: false, motivo: 'DATABASE_URL no se entiende', host: '' };
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) {
    return { local: false, motivo: `no es una base PostgreSQL (${u.protocol})`, host: u.hostname };
  }

  // Conexión por SOCKET: `?host=/tmp` o `?host=/var/run/postgresql`. Un socket
  // de dominio UNIX no sale de la máquina, así que es local por definición —
  // y es como corren los E2E aquí, con el host de la URL puesto solo para que
  // la cadena sea válida.
  const socket = u.searchParams.get('host');
  if (socket && socket.startsWith('/')) {
    return { local: true, motivo: '', host: socket };
  }

  const host = u.hostname.toLowerCase();
  if (LOCALES.has(host)) return { local: true, motivo: '', host };
  return { local: false, motivo: `el host «${host}» no es de esta máquina`, host };
}

/**
 * Aborta el proceso si la base no es local. Se llama ANTES del primer borrado
 * global, no al final: la gracia es no llegar a tocar nada.
 */
export function exigirBaseLocal(queSeBorra: string): void {
  const v = esBaseLocal(process.env['DATABASE_URL']);
  if (v.local) return;
  console.error(
    [
      '',
      '  ABORTADO: esta prueba BORRA datos y la base no es local.',
      `  Motivo: ${v.motivo}.`,
      `  Lo que iba a borrar: ${queSeBorra}.`,
      '',
      '  Córrela contra una base de pruebas de esta máquina, por ejemplo:',
      '    DATABASE_URL="postgresql://postgres@localhost:5438/zipa?host=/tmp" npx tsx e2e/<script>.ts',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dejar la base sin viajes, usuarios ni conductores.
//
// Dos pruebas miden CIFRAS GLOBALES (las del piloto y las de plaza), así que
// tienen que partir de cero o cuentan también lo que dejó la prueba anterior:
// «1 conductor en Pamplona» salía 3 por dos fantasmas de otras corridas.
//
// Borrar `users` a secas no funciona en una base que ya se usó: un mandado,
// una reserva de silla o un enlace mágico de otro script apuntan a un usuario
// con clave foránea OBLIGATORIA, y PostgreSQL rechaza el borrado entero. Eso
// es justo lo que hacía fallar estas dos pruebas al correrlas en tanda, y el
// error que salía (`errands_userId_fkey`) no se parece en nada a su causa.
//
// El orden es el de las dependencias, de la hoja a la raíz. Las relaciones
// OPCIONALES (pedido, evento de emergencia, quién refirió a quién) no hace
// falta tocarlas: Prisma las deja en nulo sola.
export async function limpiarParaCifrasGlobales(prisma: {
  [k: string]: { deleteMany: (a?: unknown) => Promise<unknown> };
}): Promise<void> {
  const enOrden = [
    'seatAssignment',   // cuelga de SeatBooking
    'seatBooking',
    'promoRedemption',
    'address',
    'errand',
    'intercityBooking',
    'magicLink',
    'trip',
    'user',
    // Y lo que cuelga del conductor, por el mismo motivo: su ficha es una de
    // las cifras globales que estas pruebas cuentan.
    'driverDocument',
    'driverEarning',
    'fleetAssignment',
    'vehicle',
    'driver',
  ];
  for (const tabla of enOrden) {
    const modelo = prisma[tabla];
    if (modelo) await modelo.deleteMany({});
  }
}
