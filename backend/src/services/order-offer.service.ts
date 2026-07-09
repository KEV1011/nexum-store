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
  return {
    status: o.status,
    hasDriver: o.driverId != null,
    dto: {
      id: o.id,
      orderRef: o.orderRef,
      businessName: o.business.name,
      businessAddress: o.business.address,
      deliveryAddress: o.deliveryAddress,
      deliveryFee: o.deliveryFee,
      itemsCount: o.lines.reduce((sum, l) => sum + l.quantity, 0),
      total: o.total,
    },
    lat: o.business.lat ?? PAMPLONA.lat,
    lng: o.business.lng ?? PAMPLONA.lng,
  };
}
