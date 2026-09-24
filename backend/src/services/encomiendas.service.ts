import { prisma } from '../lib/prisma';
import {
  motivoParaNoDespachar,
  motivoParaNoAdmitir,
  itemsDeRemito,
  totalBultos,
} from '../lib/encomiendas';
import { sendPushToClient } from './push.service';
import { puntoDeEntrega } from '../lib/ultima-milla';

/**
 * Encomiendas: pedidos intermunicipales que viajan en el despacho de una
 * empresa de transporte.
 *
 * El modelo, en una frase: **un pedido se convierte en UN remito de UN
 * despacho.** No hay tabla nueva — `FreightManifest` ya era el remito y
 * `CargoTrip` ya era el despacho, con su rastro, sus gastos y su cuenta de
 * cobro. Las reglas puras (qué pedido puede subir, a qué bus, cómo se reparten
 * los bultos) viven en `lib/encomiendas.ts` con sus pruebas.
 */

export class EncomiendaError extends Error {}

/** Lo que ve el despachador en su tablero. */
export interface EncomiendaPendienteDTO {
  orderId: string;
  orderRef: string;
  createdAt: string;
  /** Quién la manda y desde dónde. */
  businessName: string;
  originCitySlug: string | null;
  /** A quién y a dónde. */
  clientName: string;
  clientPhone: string | null;
  deliveryAddress: string;
  destCitySlug: string | null;
  /** Lo que el comercio le cobró al cliente por el envío. */
  intercityFee: number | null;
  bultos: number;
  items: Array<{ productName: string; quantity: number }>;
}

const _incluirPedido = {
  business: { select: { name: true, citySlug: true } },
  user: { select: { name: true, phone: true } },
  lines: true,
  manifest: { select: { id: true } },
} as const;

type PedidoConTodo = Awaited<ReturnType<typeof _buscarPedido>>;

async function _buscarPedido(orderId: string) {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: _incluirPedido,
  });
  if (!o) throw new EncomiendaError('Ese pedido no existe.');
  return o;
}

function _aDTO(o: NonNullable<PedidoConTodo>): EncomiendaPendienteDTO {
  const items = o.lines.map((l) => ({
    productName: l.productName,
    quantity: l.quantity,
  }));
  return {
    orderId: o.id,
    orderRef: o.orderRef,
    createdAt: o.createdAt.toISOString(),
    businessName: o.business?.name ?? 'Comercio',
    originCitySlug: o.originCitySlug,
    clientName: o.customerName ?? o.user?.name ?? 'Cliente',
    clientPhone: o.user?.phone ?? null,
    deliveryAddress: o.deliveryAddress,
    destCitySlug: o.destCitySlug,
    intercityFee: o.intercityFee,
    bultos: totalBultos(itemsDeRemito(
      o.lines.map((l) => ({ productName: l.productName, quantity: l.quantity })),
    )),
    items,
  };
}

/**
 * El tablero: encomiendas esperando bus.
 *
 * NO se filtra por empresa porque una encomienda no pertenece a ninguna hasta
 * que alguien la sube a su despacho — igual que el tablero de fletes del
 * marketplace. Se filtra por RUTA, que es lo que decide si a esta empresa le
 * sirve: un despachador de Cúcuta no quiere ver lo que sale de Bogotá.
 */
export async function listarEncomiendasPendientes(opts: {
  origen?: string;
  destino?: string;
  limit?: number;
} = {}): Promise<EncomiendaPendienteDTO[]> {
  const pedidos = await prisma.order.findMany({
    where: {
      isIntercity: true,
      // Sin remito = nadie la ha subido a un despacho todavía.
      manifest: { is: null },
      status: { in: ['CONFIRMED', 'PREPARING'] },
      ...(opts.origen ? { originCitySlug: opts.origen } : {}),
      ...(opts.destino ? { destCitySlug: opts.destino } : {}),
    },
    include: _incluirPedido,
    orderBy: { createdAt: 'asc' },
    take: Math.min(opts.limit ?? 100, 300),
  });
  return pedidos.map(_aDTO);
}

/**
 * Sube una encomienda a un despacho, creando su remito.
 *
 * El `create` con `orderId` es lo que hace la toma ATÓMICA: la columna es
 * única, así que dos despachadores pulsando a la vez y el segundo choca contra
 * el índice en vez de crear un segundo remito de la misma caja.
 */
export async function adjuntarEncomienda(
  operatorId: string,
  orderId: string,
  cargoTripId: string,
): Promise<{ manifestId: string; code: string; bultos: number }> {
  const viaje = await prisma.cargoTrip.findUnique({
    where: { id: cargoTripId },
    select: {
      id: true, operatorId: true, status: true, cobroId: true,
      originCity: true, destCity: true,
    },
  });
  if (!viaje || viaje.operatorId !== operatorId) {
    throw new EncomiendaError('Ese despacho no existe o no es de tu empresa.');
  }

  return _adjuntar(operatorId, orderId, {
    origen: viaje.originCity?.toLowerCase() ?? null,
    destino: viaje.destCity?.toLowerCase() ?? null,
    // Facturado o ya salido: no admite más carga.
    editable: viaje.status === 'DRAFT' && !viaje.cobroId,
    vinculo: { cargoTripId },
  });
}

/**
 * Sube una encomienda a una SALIDA DE BUS de pasajeros.
 *
 * Es el mismo remito, el mismo consecutivo y la misma conciliación que en un
 * viaje de carga: lo único que cambia es de qué vehículo cuelga. Por eso todo
 * pasa por `_adjuntar` y no hay una segunda versión de la lógica — dos copias
 * de esto acabarían admitiendo cosas distintas, y la que se equivocara sería
 * la que deja una caja en la ciudad que no es.
 */
export async function adjuntarEncomiendaASalida(
  operatorId: string,
  orderId: string,
  pooledTripId: string,
): Promise<{ manifestId: string; code: string; bultos: number }> {
  const salida = await prisma.pooledTrip.findUnique({
    where: { id: pooledTripId },
    select: { id: true, operatorId: true, status: true, origin: true, destination: true },
  });
  if (!salida || salida.operatorId !== operatorId) {
    throw new EncomiendaError('Esa salida no existe o no es de tu empresa.');
  }

  return _adjuntar(operatorId, orderId, {
    // La columna ya guarda el slug del municipio; `lower` es defensivo para las
    // salidas escritas antes de que eso se corrigiera.
    origen: salida.origin?.toLowerCase() ?? null,
    destino: salida.destination?.toLowerCase() ?? null,
    // Una vez el bus salió, la bodega está cerrada. CANCELLED tampoco admite.
    editable: salida.status === 'OPEN' || salida.status === 'FULL',
    vinculo: { pooledTripId },
  });
}

/** El despacho al que se sube la caja, sea un camión o la bodega de un bus. */
interface DestinoDeCarga {
  origen: string | null;
  destino: string | null;
  editable: boolean;
  vinculo: { cargoTripId: string } | { pooledTripId: string };
}

async function _adjuntar(
  operatorId: string,
  orderId: string,
  destino: DestinoDeCarga,
): Promise<{ manifestId: string; code: string; bultos: number }> {
  const o = await _buscarPedido(orderId);

  const motivo = motivoParaNoDespachar({
    status: o.status,
    isIntercity: o.isIntercity,
    originCitySlug: o.originCitySlug,
    destCitySlug: o.destCitySlug,
    tieneRemito: o.manifest != null,
  });
  if (motivo) throw new EncomiendaError(motivo);

  const noAdmite = motivoParaNoAdmitir(
    {
      status: o.status,
      isIntercity: o.isIntercity,
      originCitySlug: o.originCitySlug,
      destCitySlug: o.destCitySlug,
      tieneRemito: false,
    },
    {
      origen: destino.origen,
      destino: destino.destino,
      editable: destino.editable,
    },
  );
  if (noAdmite) throw new EncomiendaError(noAdmite);

  const items = itemsDeRemito(
    o.lines.map((l) => ({ productName: l.productName, quantity: l.quantity })),
  );

  // Consecutivo del remito, por empresa, igual que los que escribe la flota.
  const ultimo = await prisma.freightManifest.findFirst({
    where: { operatorId },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const n = Number(ultimo?.code?.replace(/\D/g, '') ?? 0) + 1;

  try {
    const m = await prisma.freightManifest.create({
      data: {
        operatorId,
        code: `REM-${String(n).padStart(4, '0')}`,
        // La referencia del lote es el número del pedido: es lo que el cliente
        // tiene en su teléfono y lo que va a decir por teléfono si reclama.
        reference: o.orderRef,
        warehouse: o.business?.name ?? null,
        clientName: o.customerName ?? o.user?.name ?? 'Cliente',
        clientAddress: o.deliveryAddress,
        clientCity: o.destCitySlug,
        ...destino.vinculo,
        orderId,
        items: { create: items },
      },
      select: { id: true, code: true },
    });
    return { manifestId: m.id, code: m.code, bultos: totalBultos(items) };
  } catch (e) {
    // Choque contra el índice único: otro despachador se la llevó entre la
    // comprobación y el insert.
    const msg = e instanceof Error ? e.message : '';
    if (/Unique constraint|orderId/.test(msg)) {
      throw new EncomiendaError('Ese pedido acaba de subirse a otro despacho.');
    }
    throw e;
  }
}

/**
 * Baja una encomienda del despacho, mientras el bus no haya salido.
 *
 * Borra el remito en vez de desvincularlo: un remito sin pedido y sin líneas
 * propias no es un documento de nada, y dejarlo ensuciaría el consecutivo.
 */
export async function soltarEncomienda(
  operatorId: string,
  orderId: string,
): Promise<void> {
  const m = await prisma.freightManifest.findUnique({
    where: { orderId },
    select: {
      id: true, operatorId: true, status: true,
      cargoTrip: { select: { status: true, cobroId: true } },
      pooledTrip: { select: { status: true } },
    },
  });
  if (!m || m.operatorId !== operatorId) {
    throw new EncomiendaError('Esa encomienda no está en ninguno de tus despachos.');
  }
  // Va en la bodega de un bus: se puede bajar mientras el bus no haya salido.
  const enSalida = m.pooledTrip != null;
  const bodegaAbierta = enSalida
    ? m.pooledTrip!.status === 'OPEN' || m.pooledTrip!.status === 'FULL'
    : m.cargoTrip?.status === 'DRAFT' && !m.cargoTrip?.cobroId;

  if (m.status !== 'DRAFT' || !bodegaAbierta) {
    throw new EncomiendaError(
      'Ese despacho ya salió o ya se facturó: la encomienda no se puede bajar.',
    );
  }
  await prisma.freightManifest.delete({ where: { id: m.id } });
}

/**
 * GANCHO 1 — el despacho sale: sus encomiendas entran en tránsito.
 *
 * Se llama DESPUÉS de que el viaje pase a DISPATCHED. `updateMany` con guard de
 * estado para no reescribir un pedido que se canceló entre medias.
 */
export async function marcarEncomiendasEnTransito(cargoTripId: string): Promise<number> {
  const remitos = await prisma.freightManifest.findMany({
    where: { cargoTripId, orderId: { not: null } },
    select: { orderId: true },
  });
  return _ponerEnTransito(remitos.map((r) => r.orderId!).filter(Boolean));
}

/**
 * GANCHO 1c — la SALIDA DE BUS arranca: sus encomiendas entran en tránsito.
 *
 * Mismo criterio que el despacho de carga y la misma función de fondo. Se
 * llama después de que la salida pase a DEPARTED.
 */
export async function marcarEncomiendasDeSalidaEnTransito(
  pooledTripId: string,
): Promise<number> {
  const remitos = await prisma.freightManifest.findMany({
    where: { pooledTripId, orderId: { not: null } },
    select: { orderId: true },
  });
  return _ponerEnTransito(remitos.map((r) => r.orderId!).filter(Boolean));
}

/**
 * Las encomiendas que van en una salida, para el tablero del portal.
 */
export async function listarEncomiendasDeSalida(
  operatorId: string,
  pooledTripId: string,
): Promise<Array<{ manifestId: string; code: string; orderRef: string | null; clientName: string; clientCity: string | null; bultos: number; status: string }>> {
  const remitos = await prisma.freightManifest.findMany({
    where: { pooledTripId, operatorId },
    select: {
      id: true, code: true, reference: true, clientName: true,
      clientCity: true, status: true, items: { select: { measure: true } },
    },
    orderBy: { code: 'asc' },
  });
  return remitos.map((m) => ({
    manifestId: m.id,
    code: m.code,
    orderRef: m.reference,
    clientName: m.clientName,
    clientCity: m.clientCity,
    bultos: m.items.reduce((s, i) => s + i.measure, 0),
    status: m.status,
  }));
}

/**
 * GANCHO 1b — el REMITO se despacha (se le asigna conductor y placa).
 *
 * Hace falta además del gancho del viaje porque son dos acciones distintas del
 * portal y cualquiera puede ir primero: despachar el remito sin despachar el
 * viaje dejaba el pedido en «preparando» con la caja ya en el bus. El guard de
 * estado del `updateMany` hace que llamarlo dos veces no cambie nada.
 */
export async function marcarEncomiendaEnTransito(manifestId: string): Promise<boolean> {
  const m = await prisma.freightManifest.findUnique({
    where: { id: manifestId },
    select: { orderId: true },
  });
  if (!m?.orderId) return false;
  return (await _ponerEnTransito([m.orderId])) > 0;
}

async function _ponerEnTransito(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const avance = await prisma.order.updateMany({
    where: { id: { in: ids }, status: { in: ['CONFIRMED', 'PREPARING'] } },
    data: { status: 'IN_INTERCITY_TRANSIT' },
  });

  // Aviso al cliente: su caja salió. Es el push que más importa de este flujo
  // —lo siguiente que sabrá es que llegó— y va best-effort para que un fallo
  // de Firebase no tumbe el despacho de un bus.
  if (avance.count > 0) {
    const pedidos = await prisma.order.findMany({
      where: { id: { in: ids }, status: 'IN_INTERCITY_TRANSIT' },
      select: { id: true, userId: true, orderRef: true, destCitySlug: true },
    });
    for (const p of pedidos) {
      if (!p.userId) continue;
      void sendPushToClient(p.userId, {
        title: 'Tu envío va en camino',
        body: `El pedido ${p.orderRef} salió hacia ${p.destCitySlug ?? 'su destino'}.`,
        data: { type: 'order_intercity_transit', orderId: p.id },
      });
    }
  }
  return avance.count;
}

/**
 * GANCHO 2 — el remito se recibe: la encomienda está entregada.
 *
 * Así opera de verdad una encomienda en bus: el destinatario va a la taquilla,
 * muestra su cédula y firma. El remito ya guarda quién recibió, su documento y
 * la foto del acta, así que ese ES el cierre — no un apaño esperando la última
 * milla, que es una mejora encima de esto.
 *
 * Con faltantes o averiados el pedido se entrega igual pero la discrepancia
 * queda en el remito: negarle la entrega a quien SÍ recibió nueve de diez
 * cajas sería peor, y la constancia es lo que sostiene el reclamo.
 */
export async function marcarEncomiendaEntregada(manifestId: string): Promise<boolean> {
  const m = await prisma.freightManifest.findUnique({
    where: { id: manifestId },
    select: { orderId: true, discrepancyCount: true, driverId: true },
  });
  if (!m?.orderId) return false;

  const pedido = await prisma.order.findUnique({
    where: { id: m.orderId },
    select: { lastMile: true },
  });

  // ── Última milla: la caja llegó a la ciudad, pero no a la puerta ──────────
  //
  // Solo si el cliente la pidió. Para los demás, recibir en la taquilla ES la
  // entrega: así opera una encomienda en bus y así se cierra.
  if (pedido?.lastMile) {
    const entregada = await _arrancarUltimaMilla(m.orderId, m.driverId);
    if (entregada) return true;
    // Si no se pudo (sin posición del conductor), se sigue al cierre normal:
    // más vale un pedido cerrado en taquilla que uno colgado esperando a un
    // repartidor que nunca se va a buscar.
  }

  const avance = await prisma.order.updateMany({
    where: { id: m.orderId, status: 'IN_INTERCITY_TRANSIT' },
    data: { status: 'DELIVERED', deliveredAt: new Date() },
  });
  if (avance.count === 0) return false;

  const o = await prisma.order.findUnique({
    where: { id: m.orderId },
    select: { userId: true, orderRef: true },
  });
  if (o?.userId) {
    void sendPushToClient(o.userId, {
      title: 'Tu envío llegó',
      body: m.discrepancyCount > 0
        // No se le dice «todo bien» a quien recibió de menos: lo va a ver al
        // abrir la caja y lo peor sería que la app se lo hubiera negado.
        ? `El pedido ${o.orderRef} fue recibido, con ${m.discrepancyCount} novedad(es) anotada(s).`
        : `El pedido ${o.orderRef} fue recibido y firmado.`,
      data: { type: 'order_delivered', orderId: m.orderId },
    });
  }
  return true;
}

/**
 * Pone el pedido a esperar repartidor en la ciudad de destino.
 *
 * El punto de recogida es **dónde estaba el conductor del bus al firmar el
 * acta**, no una dirección de terminal que nadie declaró. Si no hay posición no
 * se arranca: mandar al repartidor al centroide del municipio sería mandarlo a
 * un sitio donde la caja no está.
 *
 * Devuelve `true` si el pedido quedó esperando última milla.
 */
async function _arrancarUltimaMilla(
  orderId: string,
  driverId: string | null,
): Promise<boolean> {
  const conductor = driverId
    ? await prisma.driver.findUnique({
        where: { id: driverId },
        select: { lastLat: true, lastLng: true },
      })
    : null;

  const punto = puntoDeEntrega(conductor?.lastLat, conductor?.lastLng);
  if (!punto) {
    console.warn(
      `[Encomienda] ${orderId} pidió última milla pero el conductor no reportó ` +
        'posición al recibir: se cierra en taquilla.',
    );
    return false;
  }

  // Transición atómica con guarda: dos recepciones a la vez no pueden lanzar
  // dos ciclos de despacho para la misma caja.
  const avance = await prisma.order.updateMany({
    where: { id: orderId, status: 'IN_INTERCITY_TRANSIT' },
    data: {
      status: 'AT_DESTINATION_HUB',
      hubLat: punto.lat,
      hubLng: punto.lng,
      hubAt: new Date(),
      // El repartidor de origen no existe en este pedido; el que viene es el de
      // destino y todavía no hay ninguno asignado.
      driverId: null,
    },
  });
  if (avance.count === 0) return false;

  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userId: true, orderRef: true },
  });
  if (o?.userId) {
    void sendPushToClient(o.userId, {
      title: 'Tu envío llegó a tu ciudad',
      body: `El pedido ${o.orderRef} ya está en destino. Buscamos quién te lo lleve.`,
      data: { type: 'order_at_hub', orderId },
    });
  }

  // El despacho urbano de siempre, anclado al punto donde quedó la caja.
  const { startOrderMatchingCycle } = await import('./matching.service');
  void startOrderMatchingCycle(orderId);
  return true;
}
