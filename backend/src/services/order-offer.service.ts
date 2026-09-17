import { prisma } from '../lib/prisma';

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
}

export async function getOrderOfferInfo(orderId: string): Promise<{
  status: string;
  hasDriver: boolean;
  dto: OrderRequestDTO;
  lat: number;
  lng: number;
} | null> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      business: { select: { name: true, address: true, lat: true, lng: true } },
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
  const enDestino = o.status === 'AT_DESTINATION_HUB' && o.hubLat != null && o.hubLng != null;
  const businessLat = enDestino ? o.hubLat! : (o.business.lat ?? PAMPLONA.lat);
  const businessLng = enDestino ? o.hubLng! : (o.business.lng ?? PAMPLONA.lng);
  return {
    status: o.status,
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
    },
    lat: businessLat,
    lng: businessLng,
  };
}
