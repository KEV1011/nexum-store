import { prisma } from '../lib/prisma';
import { createPaymentLink } from './payment.service';

/** Error de dominio de propinas (mapea a HTTP 400 en las rutas). */
export class TipError extends Error {}

export interface TipPaymentDTO {
  paymentId: string;
  referenceCode: string;
  paymentUrl: string;
  amount: number;
}

/**
 * Registra la propina de un viaje y genera el link de pago Wompi. El conductor
 * se acredita cuando el pago se aprueba (ver payment.service). 100% del monto
 * va al conductor (sin comisión).
 */
export async function requestTripTip(
  clientId: string,
  tripId: string,
  amount: number,
): Promise<TipPaymentDTO> {
  const tip = Math.round(amount);
  if (!Number.isFinite(tip) || tip <= 0) throw new TipError('Monto de propina inválido');

  const trip = await prisma.trip.findFirst({ where: { id: tripId, passengerId: clientId } });
  if (!trip) throw new TipError('Viaje no encontrado');
  if (trip.status !== 'COMPLETED') throw new TipError('Solo puedes dar propina en un viaje completado');
  if (!trip.driverId) throw new TipError('Este viaje no tiene conductor asignado');
  if (trip.tipPaid) throw new TipError('Ya registraste una propina para este viaje');

  await prisma.trip.update({ where: { id: tripId }, data: { tipAmount: tip } });
  return createPaymentLink(clientId, {
    amount: tip,
    description: `Propina · ${trip.requestRef}`,
    tripId,
  });
}

/** Igual que [requestTripTip] pero para un pedido entregado. */
export async function requestOrderTip(
  clientId: string,
  orderId: string,
  amount: number,
): Promise<TipPaymentDTO> {
  const tip = Math.round(amount);
  if (!Number.isFinite(tip) || tip <= 0) throw new TipError('Monto de propina inválido');

  const order = await prisma.order.findFirst({ where: { id: orderId, userId: clientId } });
  if (!order) throw new TipError('Pedido no encontrado');
  if (order.status !== 'DELIVERED') throw new TipError('Solo puedes dar propina en un pedido entregado');
  if (!order.driverId) throw new TipError('Este pedido no tiene repartidor asignado');
  if (order.tipPaid) throw new TipError('Ya registraste una propina para este pedido');

  await prisma.order.update({ where: { id: orderId }, data: { tipAmount: tip } });
  return createPaymentLink(clientId, {
    amount: tip,
    description: `Propina · ${order.orderRef}`,
    orderId,
  });
}
