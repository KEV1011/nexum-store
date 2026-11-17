import { prisma } from '../lib/prisma';
import { metodoPorValor } from '../lib/metodos-pago';
import { anclaDeCompra, localLejosDeLaEntrega } from '../lib/ubicacion-comercio';
import { coordsOf, plazaDeCoordenadas } from './municipality.service';

// ─────────────────────────────────────────────────────────────────────────────
// Información de oferta de PEDIDOS para el motor de matching.
//
// Vive en su propio módulo (y no en client.service) porque matching.service
// necesita leerla y client.service ya importa matching.service: importarlo de
// vuelta crearía un ciclo. Aquí solo hay lecturas con prisma.
// ─────────────────────────────────────────────────────────────────────────────

// Centro de Pamplona: ancla del matching cuando el negocio no tiene coordenadas.
const PAMPLONA = { lat: 7.3754, lng: -72.6486 };

/** DTO que recibe el repartidor por WS en `order_request`. */
export interface OrderRequestDTO {
  id: string;
  orderRef: string;
  businessName: string;
  businessAddress: string;
  deliveryAddress: string;
  deliveryFee: number;
  itemsCount: number;
  total: number;
  // Coordenadas reales para el mapa del repartidor (fallback centro Pamplona).
  businessLat: number;
  businessLng: number;
  deliveryLat: number | null;
  deliveryLng: number | null;

  /**
   * Cómo va a cobrar: «Te paga por Nequi», «Ya pagado en la app».
   *
   * Ausente en los pedidos anteriores a que esto se guardara, y entonces la
   * app no enseña nada en vez de afirmar «efectivo» sobre un pedido del que
   * no se sabe con qué se paga.
   */
  paymentNote?: string;
  /** Si el dinero lo recibe él en la puerta. Confundirlo cuesta plata. */
  cobraElRepartidor?: boolean;
}

export async function getOrderOfferInfo(orderId: string): Promise<{
  status: string;
  /** El modo: lo que decide si este pedido se reparte o no. */
  mode: string;
  hasDriver: boolean;
  dto: OrderRequestDTO;
  lat: number;
  lng: number;
} | null> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      business: { select: { id: true, name: true, address: true, lat: true, lng: true, citySlug: true } },
      lines: { select: { quantity: true } },
    },
  });
  if (!o) return null;

  // ── ¿De dónde recoge el repartidor? ────────────────────────────────────────
  //
  // Normalmente del comercio. Pero en la última milla de una encomienda el
  // comercio está en OTRA CIUDAD: la caja quedó en la taquilla de destino, en el
  // punto donde el conductor del bus firmó el acta. Anclar al comercio buscaría
  // repartidores a cientos de kilómetros y no encontraría a ninguno.
  // `hubAt` y no solo el estado: si el repartidor de la última milla lo
  // retoma o lo suelta, el pedido ya no está en AT_DESTINATION_HUB y la caja
  // sigue en la taquilla, no en el comercio de la otra ciudad.
  const enDestino = (o.status === 'AT_DESTINATION_HUB' || o.hubAt != null)
    && o.hubLat != null && o.hubLng != null;
  // Fuera de la última milla, el punto del local se usa SOLO si es de fiar:
  // la MISMA regla que la compra en un local sin registrar (`anclaDeCompra`).
  // Un local geocodificado sin ciudad puede haber quedado guardado a cientos
  // de kilómetros, y entonces el despacho buscaba repartidores alrededor de
  // ese punto y no le salía a nadie aunque el repartidor estuviera en la
  // puerta. La referencia es la entrega del cliente —el único punto que pone
  // alguien que de verdad está ahí—; sin ella, el centro de la ciudad del
  // local, y solo al final el de Pamplona.
  let ancla: { lat: number; lng: number };
  if (enDestino) {
    ancla = { lat: o.hubLat!, lng: o.hubLng! };
  } else {
    const plaza = o.business.citySlug ? await coordsOf(o.business.citySlug) : null;
    let local = o.business.lat != null && o.business.lng != null
      ? { lat: o.business.lat, lng: o.business.lng }
      : null;
    if (local && !o.business.citySlug && !(await plazaDeCoordenadas(local.lat, local.lng))) local = null;
    const entrega = o.deliveryLat != null && o.deliveryLng != null
      ? { lat: o.deliveryLat, lng: o.deliveryLng }
      : null;
    ancla = anclaDeCompra(local, plaza, entrega, PAMPLONA);
    if (localLejosDeLaEntrega(local, entrega)) {
      console.warn(
        `[Pedido] «${o.business.name}» (${o.business.id}) tiene su punto lejos de la entrega: ` +
          `no se usa para buscar repartidor. Hay que fijar su ubicación en el mapa.`,
      );
    }
  }
  const businessLat = ancla.lat;
  const businessLng = ancla.lng;
  return {
    status: o.status,
    mode: o.mode,
    hasDriver: o.driverId != null,
    dto: {
      id: o.id,
      orderRef: o.orderRef,
      businessName: o.business.name,
      // Al repartidor de última milla no se le dice la dirección del comercio
      // de origen —que está en otra ciudad— sino dónde está la caja.
      businessAddress: enDestino
        ? `Encomienda recibida en ${o.destCitySlug ?? 'destino'}`
        : o.business.address,
      deliveryAddress: o.deliveryAddress,
      deliveryFee: o.deliveryFee,
      itemsCount: o.lines.reduce((sum, l) => sum + l.quantity, 0),
      total: o.total,
      businessLat,
      businessLng,
      deliveryLat: o.deliveryLat,
      deliveryLng: o.deliveryLng,
      // Con qué le van a pagar al llegar. Es lo que decide si tiene que
      // cobrar en la puerta o si ya está pagado, y hasta ahora no le llegaba:
      // el repartidor aceptaba sin saberlo. Lo redacta el servidor desde el
      // catálogo, para que un método nuevo no le deje un hueco en blanco.
      ...(() => {
        const m = metodoPorValor(o.paymentMethod);
        if (!m) return {};
        return {
          paymentNote: m.avisoAlConductor ?? 'Te paga en efectivo',
          cobraElRepartidor: m.quienCobra === 'conductor',
        };
      })(),
    },
    lat: businessLat,
    lng: businessLng,
  };
}
