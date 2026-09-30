// La línea de tiempo del pedido: qué pasó, cuándo, y qué falta.
//
// POR QUÉ ESTO NO PUEDE VIVIR EN LA APP. Hasta ahora la app pintaba CINCO
// etiquetas fijas —«Pedido confirmado», «En preparación», «Conductor
// recogiendo», «En camino hacia ti», «Entregado»— sin una sola hora y sin
// mirar qué clase de pedido era. Para una encomienda que viaja en bus a otra
// ciudad eso decía «Conductor recogiendo» durante seis horas, y para un
// pedido en mesa prometía un repartidor que no existe.
//
// Los pasos dependen de la FORMA del pedido, y la forma la sabe el servidor
// (`mode`, `isIntercity`, `lastMile`). Si los derivara la app, cada versión
// instalada contaría una historia distinta del mismo pedido — y además habría
// que publicar una versión nueva para cada estado que se añada.
//
// LAS TRES REGLAS QUE IMPIDEN QUE ESTO MIENTA
// -------------------------------------------
// 1. **Nunca se inventa una hora.** Un paso sin registro va con `at: null` y
//    la app no escribe nada al lado. Poner la de otro paso, o la de creación
//    del pedido, sería peor que el hueco: el cliente cuenta desde ahí.
// 2. **Un paso sin registro pero con uno POSTERIOR registrado está CUMPLIDO.**
//    Los pedidos anteriores a la bitácora no tienen eventos, y los estados
//    intermedios se saltan a menudo (nadie marca `AT_PICKUP` si el repartidor
//    recogió y arrancó en el mismo minuto). Sin esta regla la línea quedaría
//    con agujeros en medio de un pedido ya entregado.
// 3. **Cancelado no borra lo que sí pasó.** Se conservan los pasos alcanzados
//    y se añade el final; una línea que se vacía al cancelar deja al cliente
//    sin poder ver que su pedido sí se preparó.

/** Los estados tal como los guarda la base. */
export type EstadoPedidoBD =
  | 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'DRIVER_TO_PICKUP' | 'AT_PICKUP'
  | 'IN_INTERCITY_TRANSIT' | 'AT_DESTINATION_HUB' | 'IN_TRANSIT'
  | 'DELIVERED' | 'CANCELLED';

export interface EventoPedido {
  status: EstadoPedidoBD;
  at: Date;
  actor?: string | null;
  note?: string | null;
}

/** Lo que hace falta saber del pedido para decidir qué pasos tiene. */
export interface FormaDelPedido {
  status: EstadoPedidoBD;
  dineIn: boolean;
  intercity: boolean;
  lastMile: boolean;
  /** Nombre legible de la ciudad de destino, para nombrar los pasos. */
  ciudadDestino?: string | null;
  /** Cuándo se creó: es la hora del primer paso cuando no hay bitácora. */
  createdAt: Date;
}

export type EstadoPaso = 'cumplido' | 'actual' | 'pendiente' | 'cancelado';

export interface PasoPedido {
  /** Identificador estable; la app decide el icono con él. */
  clave: string;
  titulo: string;
  /** Segunda línea, cuando aporta algo («Sale hacia Bucaramanga»). */
  detalle?: string;
  /** ISO del momento en que ocurrió, o `null` si no hay registro. */
  at: string | null;
  estado: EstadoPaso;
}

/** Un paso de la plantilla: su clave, su texto y qué estados lo cumplen. */
interface Plantilla {
  clave: string;
  titulo: string;
  detalle?: string;
  /** Estados de BD que marcan este paso como alcanzado. */
  estados: EstadoPedidoBD[];
}

// El orden de los estados a lo largo de la vida del pedido. Se usa para saber
// si un estado es anterior o posterior a otro; `CANCELLED` queda fuera porque
// no es una etapa del recorrido sino una salida.
const ORDEN: EstadoPedidoBD[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'DRIVER_TO_PICKUP',
  'AT_PICKUP',
  'IN_INTERCITY_TRANSIT',
  'AT_DESTINATION_HUB',
  'IN_TRANSIT',
  'DELIVERED',
];

function posicion(e: EstadoPedidoBD): number {
  const i = ORDEN.indexOf(e);
  // Un estado desconocido se trata como el principio: es preferible una línea
  // que empieza a una que revienta.
  return i === -1 ? 0 : i;
}

/**
 * Los pasos que tiene ESTE pedido, en orden, sin fechas todavía.
 *
 * Cuatro formas, y cada una existe porque la anterior mentía sobre ella:
 * el pedido en mesa no tiene repartidor, la encomienda en taquilla no tiene
 * «en camino hacia ti», y la que sí va a la puerta tiene un tramo más.
 */
export function plantillaDePasos(f: FormaDelPedido): Plantilla[] {
  const ciudad = (f.ciudadDestino ?? '').trim();
  const aCiudad = ciudad ? ` a ${ciudad}` : ' a la otra ciudad';
  const enCiudad = ciudad ? ` en ${ciudad}` : ' en tu ciudad';

  if (f.dineIn) {
    return [
      { clave: 'realizado', titulo: 'Pedido enviado a la cocina', estados: ['PENDING'] },
      { clave: 'confirmado', titulo: 'Confirmado por el negocio', estados: ['CONFIRMED'] },
      { clave: 'preparando', titulo: 'Preparando tu pedido', estados: ['PREPARING'] },
      { clave: 'entregado', titulo: 'Servido en tu mesa', estados: ['DELIVERED'] },
    ];
  }

  if (f.intercity) {
    const comunes: Plantilla[] = [
      { clave: 'realizado', titulo: 'Pedido realizado', estados: ['PENDING'] },
      { clave: 'confirmado', titulo: 'Confirmado por el negocio', estados: ['CONFIRMED'] },
      {
        clave: 'preparando',
        titulo: 'Alistando tu pedido',
        detalle: 'El comercio lo empaca y lo lleva a la terminal',
        estados: ['PREPARING'],
      },
      {
        clave: 'en_ruta_ciudad',
        titulo: `En camino${aCiudad}`,
        detalle: 'Va en el despacho de la empresa de transporte',
        estados: ['IN_INTERCITY_TRANSIT'],
      },
    ];

    if (!f.lastMile) {
      return [
        ...comunes,
        {
          clave: 'entregado',
          titulo: 'Entregado en la taquilla',
          detalle: 'Se entrega al destinatario con documento y firma',
          estados: ['DELIVERED'],
        },
      ];
    }

    return [
      ...comunes,
      {
        clave: 'en_destino',
        titulo: `Llegó${enCiudad}`,
        detalle: 'Buscando repartidor para llevarlo a la puerta',
        estados: ['AT_DESTINATION_HUB'],
      },
      {
        clave: 'reparto',
        titulo: 'En camino hacia ti',
        estados: ['DRIVER_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'],
      },
      { clave: 'entregado', titulo: 'Entregado', estados: ['DELIVERED'] },
    ];
  }

  return [
    { clave: 'realizado', titulo: 'Pedido realizado', estados: ['PENDING'] },
    { clave: 'confirmado', titulo: 'Confirmado por el negocio', estados: ['CONFIRMED'] },
    { clave: 'preparando', titulo: 'Preparando tu pedido', estados: ['PREPARING'] },
    {
      clave: 'recogiendo',
      titulo: 'Repartidor recogiendo',
      estados: ['DRIVER_TO_PICKUP', 'AT_PICKUP'],
    },
    { clave: 'reparto', titulo: 'En camino hacia ti', estados: ['IN_TRANSIT'] },
    { clave: 'entregado', titulo: 'Entregado', estados: ['DELIVERED'] },
  ];
}

/**
 * La línea de tiempo lista para pintar.
 *
 * `eventos` puede venir vacío (pedidos anteriores a la bitácora): entonces
 * solo el primer paso lleva hora —la de creación, que sí se conoce— y el
 * resto se resuelve por posición, sin inventar instantes.
 */
export function lineaDeTiempoPedido(
  f: FormaDelPedido,
  eventos: EventoPedido[],
): PasoPedido[] {
  const pasos = plantillaDePasos(f);
  const cancelado = f.status === 'CANCELLED';

  // Primer instante registrado por estado. El PRIMERO y no el último: si un
  // pedido vuelve a un estado anterior, la hora que le interesa al cliente es
  // cuándo llegó ahí por primera vez.
  const primerInstante = new Map<EstadoPedidoBD, Date>();
  for (const e of [...eventos].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (!primerInstante.has(e.status)) primerInstante.set(e.status, e.at);
  }

  // Hasta dónde llegó el pedido. Con eventos manda el más avanzado de ellos,
  // porque el estado actual de un cancelado ya no dice por dónde iba.
  const alcanzado = eventos.reduce(
    (max, e) => Math.max(max, posicion(e.status)),
    cancelado ? 0 : posicion(f.status),
  );

  const salida: PasoPedido[] = pasos.map((p) => {
    const conRegistro = p.estados
      .map((e) => primerInstante.get(e))
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    // El paso «realizado» siempre tiene hora aunque no haya bitácora: el
    // pedido se creó, y esa fecha sí se conoce sin adivinar nada.
    const at = conRegistro ?? (p.clave === 'realizado' ? f.createdAt : null);
    const posPaso = Math.max(...p.estados.map(posicion));
    const esActual = !cancelado && p.estados.includes(f.status);

    let estado: EstadoPaso;
    if (esActual) estado = 'actual';
    else if (posPaso <= alcanzado) estado = 'cumplido';
    else estado = 'pendiente';

    return {
      clave: p.clave,
      titulo: p.titulo,
      ...(p.detalle ? { detalle: p.detalle } : {}),
      at: at ? at.toISOString() : null,
      estado,
    };
  });

  if (cancelado) {
    // Lo alcanzado se conserva: el cliente tiene derecho a ver que su pedido
    // sí se preparó antes de caerse. Lo que no llegó a pasar queda fuera —
    // dejarlo en gris debajo de un «cancelado» sugiere que todavía va a pasar.
    const vivos = salida.filter((p) => p.estado === 'cumplido');
    const cancelAt = primerInstante.get('CANCELLED');
    vivos.push({
      clave: 'cancelado',
      titulo: 'Pedido cancelado',
      at: cancelAt ? cancelAt.toISOString() : null,
      estado: 'cancelado',
    });
    return vivos;
  }

  return salida;
}
