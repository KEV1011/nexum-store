import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Feed de notificaciones del conductor — DERIVADO de datos reales.
//
// En vez de una tabla de notificaciones (y su migración), se arma el feed al
// vuelo a partir del estado real del backend: viajes completados, retiros y
// documentos. Refleja lo que de verdad pasó en la cuenta del conductor. El
// estado "leído" lo maneja la app localmente.
// ─────────────────────────────────────────────────────────────────────────────

export type DriverNotificationType =
  | 'trip'
  | 'payment'
  | 'document'
  | 'promo'
  | 'system'
  | 'rating';

export interface DriverNotificationDTO {
  id: string;
  type: DriverNotificationType;
  title: string;
  body: string;
  timestamp: string;
}

const DOC_LABELS: Record<string, string> = {
  CEDULA: 'cédula',
  LICENSE: 'licencia de conducción',
  SOAT: 'SOAT',
  PROPERTY_CARD: 'tarjeta de propiedad',
  PROFILE_PHOTO: 'foto de perfil',
};

const PAYOUT_META: Record<string, { title: string; verb: string }> = {
  REQUESTED: { title: 'Retiro solicitado', verb: 'en revisión' },
  PROCESSING: { title: 'Retiro en proceso', verb: 'procesándose' },
  PAID: { title: 'Retiro pagado', verb: 'transferido a tu cuenta' },
  REJECTED: { title: 'Retiro rechazado', verb: 'rechazado' },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Formatea pesos colombianos con separador de miles de punto: 18500 -> $18.500 */
function formatCop(n: number): string {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export async function getDriverNotifications(
  driverId: string,
): Promise<DriverNotificationDTO[]> {
  const [trips, errands, payouts, documents] = await Promise.all([
    prisma.trip.findMany({
      where: { driverId, status: 'COMPLETED' },
      select: { id: true, destAddress: true, netEarning: true, completedAt: true },
      orderBy: { completedAt: 'desc' },
      take: 15,
    }),
    prisma.errand.findMany({
      where: { driverId, status: 'DELIVERED' },
      select: { id: true, serviceFee: true, description: true, deliveredAt: true },
      orderBy: { deliveredAt: 'desc' },
      take: 10,
    }),
    prisma.payout.findMany({
      where: { driverId },
      orderBy: { requestedAt: 'desc' },
      take: 10,
    }),
    prisma.driverDocument.findMany({
      where: { driverId },
      orderBy: { uploadedAt: 'desc' },
    }),
  ]);

  const items: DriverNotificationDTO[] = [];

  for (const t of trips) {
    const net = t.netEarning ?? 0;
    items.push({
      id: `trip-${t.id}`,
      type: 'trip',
      title: 'Viaje completado',
      body: `Ganaste ${formatCop(net)}${t.destAddress ? ` · ${t.destAddress}` : ''}`,
      timestamp: (t.completedAt ?? new Date()).toISOString(),
    });
  }

  for (const e of errands) {
    items.push({
      id: `errand-${e.id}`,
      type: 'trip',
      title: 'Mandado entregado',
      body: `Ganaste ${formatCop(e.serviceFee)} · ${e.description}`,
      timestamp: (e.deliveredAt ?? new Date()).toISOString(),
    });
  }

  for (const p of payouts) {
    const meta = PAYOUT_META[p.status] ?? { title: 'Retiro', verb: p.status };
    items.push({
      id: `payout-${p.id}`,
      type: 'payment',
      title: meta.title,
      body: `${formatCop(p.amount)} ${meta.verb}.`,
      timestamp: (p.processedAt ?? p.requestedAt).toISOString(),
    });
  }

  const now = Date.now();
  for (const doc of documents) {
    const label = DOC_LABELS[doc.type] ?? doc.type;
    if (doc.status === 'APPROVED') {
      items.push({
        id: `doc-${doc.id}-approved`,
        type: 'document',
        title: 'Documento aprobado',
        body: `Tu ${label} fue aprobada y ya está vigente.`,
        timestamp: (doc.reviewedAt ?? doc.uploadedAt).toISOString(),
      });
    } else if (doc.status === 'REJECTED') {
      items.push({
        id: `doc-${doc.id}-rejected`,
        type: 'document',
        title: 'Documento rechazado',
        body: doc.rejectionReason
          ? `Tu ${label} fue rechazada: ${doc.rejectionReason}`
          : `Tu ${label} fue rechazada. Vuelve a subirla.`,
        timestamp: (doc.reviewedAt ?? doc.uploadedAt).toISOString(),
      });
    }
    if (doc.expiresAt) {
      const exp = new Date(doc.expiresAt).getTime();
      if (exp > now && exp - now < 30 * DAY_MS) {
        const days = Math.ceil((exp - now) / DAY_MS);
        items.push({
          id: `doc-${doc.id}-expiring`,
          type: 'document',
          title: 'Documento por vencer',
          body: `Tu ${label} vence en ${days} día${days === 1 ? '' : 's'}. Renuévala para seguir activo.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Más recientes primero; las cadenas ISO se ordenan lexicográficamente igual
  // que cronológicamente.
  items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  return items.slice(0, 30);
}
