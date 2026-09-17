import { prisma } from '../lib/prisma';
import {
  motivoParaNoDespachar,
  motivoParaNoAdmitir,
  itemsDeRemito,
  totalBultos,
} from '../lib/encomiendas';
import { sendPushToClient } from './push.service';

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
      origen: viaje.originCity?.toLowerCase() ?? null,
      destino: viaje.destCity?.toLowerCase() ?? null,
      // Facturado o ya salido: no admite más carga.
      editable: viaje.status === 'DRAFT' && !viaje.cobroId,
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
        cargoTripId,
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
    },
  });
  if (!m || m.operatorId !== operatorId) {
    throw new EncomiendaError('Esa encomienda no está en ninguno de tus despachos.');
  }
  if (m.status !== 'DRAFT' || m.cargoTrip?.status !== 'DRAFT' || m.cargoTrip?.cobroId) {
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
    select: { orderId: true, discrepancyCount: true },
  });
  if (!m?.orderId) return false;

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
