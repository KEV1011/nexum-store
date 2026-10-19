import jwt from 'jsonwebtoken';
import { stopsFromDb } from '../lib/trip-stops';
import { JWT_SECRET, PORTAL_BASE_URL } from '../config/constants';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';
import { sendSms, isSmsSenderConfigured } from './sms.service';

// ─────────────────────────────────────────────────────────────────────────────
// Safety service — SOS panic events, trusted contacts, and trip sharing.
//
// What the SOS actually does (see SAFETY_NOTES.md for the honest scope):
//   1. Records an EmergencyEvent row (audit trail + location).
//   2. If the user configured a trusted contact, sends them an SMS (Twilio)
//      with the live location — and the live-trip tracking link when the SOS
//      happens during a trip. Without Twilio credentials it degrades to a log.
//   3. The apps facilitate a call to 123 (Colombia's emergency line).
// It does NOT automatically alert the police — we never claim otherwise.
//
// Trip sharing uses a short-lived opaque JWT so the trusted contact can poll a
// minimal, sanitised trip status. No phone numbers or PII ever go in the URL.
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL = process.env['APP_URL'] ?? 'http://localhost:3000';

export type SafetyRole = 'client' | 'driver';
export type EmergencyType = 'PANIC' | 'SHARE';

const SHARE_TOKEN_TTL = '6h';

export interface TrustedContact {
  name: string | null;
  phone: string | null;
}

/**
 * Qué pasó de verdad con el aviso al contacto de confianza.
 *
 * Existe porque el booleano solo no bastaba: devolvía `true` cuando no había
 * proveedor de SMS —es decir, cuando NADIE había sido avisado— y la app lo
 * traducía a "tu ubicación fue compartida con tu contacto". Alguien asustado,
 * pulsando un botón de pánico, leyendo que viene ayuda que no viene. De todos
 * los fallos posibles de esta plataforma, mentir en esta pantalla es el peor.
 */
export type SosContactoEstado =
  /** El SMS salió de verdad hacia el contacto. */
  | 'enviado'
  /** El titular no tiene contacto de confianza configurado. */
  | 'sin_contacto'
  /** No hay proveedor de SMS: nadie fue avisado. Solo queda el 123. */
  | 'sin_canal'
  /** Había proveedor y rechazó el envío. Tampoco fue avisado nadie. */
  | 'fallo';

export interface RecordSosResult {
  eventId: string;
  createdAt: string;
  /** true SOLO si el aviso salió de verdad. */
  trustedContactNotified: boolean;
  /** El motivo exacto, para que la app diga la verdad y no una plantilla. */
  trustedContactStatus: SosContactoEstado;
  emergencyNumber: '123';
}

// ─── Trusted contact ────────────────────────────────────────────────────────

export async function getTrustedContact(role: SafetyRole, actorId: string): Promise<TrustedContact> {
  if (role === 'client') {
    const u = await prisma.user.findUnique({
      where: { id: actorId },
      select: { trustedContactName: true, trustedContactPhone: true },
    });
    return { name: u?.trustedContactName ?? null, phone: u?.trustedContactPhone ?? null };
  }
  const d = await prisma.driver.findUnique({
    where: { id: actorId },
    select: { trustedContactName: true, trustedContactPhone: true },
  });
  return { name: d?.trustedContactName ?? null, phone: d?.trustedContactPhone ?? null };
}

export async function setTrustedContact(
  role: SafetyRole,
  actorId: string,
  name: string,
  phone: string,
): Promise<TrustedContact> {
  const data = { trustedContactName: name.trim(), trustedContactPhone: phone.trim() };
  if (role === 'client') {
    const u = await prisma.user.update({ where: { id: actorId }, data });
    return { name: u.trustedContactName, phone: u.trustedContactPhone };
  }
  const d = await prisma.driver.update({ where: { id: actorId }, data });
  return { name: d.trustedContactName, phone: d.trustedContactPhone };
}

// ─── SOS ────────────────────────────────────────────────────────────────────

export async function recordEmergencyEvent(params: {
  role: SafetyRole;
  actorId: string;
  tripId?: string;
  lat: number;
  lng: number;
  type?: EmergencyType;
}): Promise<RecordSosResult> {
  const { role, actorId, tripId, lat, lng } = params;
  const type = params.type ?? 'PANIC';

  const event = await prisma.emergencyEvent.create({
    data: {
      userId: role === 'client' ? actorId : null,
      driverId: role === 'driver' ? actorId : null,
      tripId: tripId ?? null,
      lat,
      lng,
      type,
    },
  });

  // If a trusted contact is configured, prepare and dispatch (stub) the alert.
  const contact = await getTrustedContact(role, actorId);
  const estado: SosContactoEstado = !contact.phone
    ? 'sin_contacto'
    : await notifyTrustedContact({
        to: contact.phone,
        contactName: contact.name ?? 'tu contacto',
        lat,
        lng,
        tripId,
      });

  if (estado !== 'enviado') {
    // Queda en el log del servidor con el motivo, porque un SOS que no llegó a
    // nadie es exactamente lo que hay que poder auditar después.
    console.error(`[SOS] evento ${event.id}: el contacto NO fue avisado (${estado})`);
  }

  return {
    eventId: event.id,
    createdAt: event.createdAt.toISOString(),
    trustedContactNotified: estado === 'enviado',
    trustedContactStatus: estado,
    emergencyNumber: '123',
  };
}

/**
 * Envía la alerta SOS al contacto de confianza por SMS (Twilio). Incluye la
 * ubicación puntual y, si el SOS ocurre durante un viaje, el link de
 * seguimiento en vivo. Sin proveedor configurado degrada a log (modo dev).
 */
async function notifyTrustedContact(payload: {
  to: string;
  contactName: string;
  lat: number;
  lng: number;
  tripId?: string;
}): Promise<SosContactoEstado> {
  const mapLink = `https://maps.google.com/?q=${payload.lat},${payload.lng}`;

  let trackLink = '';
  if (payload.tripId) {
    const claims: ShareTokenClaims = { tripId: payload.tripId, purpose: 'trip_share' };
    const token = jwt.sign(claims, JWT_SECRET, { expiresIn: SHARE_TOKEN_TTL });
    trackLink = `${APP_URL}/safety/track/${token}`;
  }

  const body =
    `ALERTA ZIPA: tu contacto activó el botón de emergencia. ` +
    `Ubicación: ${mapLink}` +
    (trackLink ? ` · Sigue el viaje en vivo: ${trackLink}` : '') +
    ` · Si no logras comunicarte, llama al 123.`;

  if (!isSmsSenderConfigured()) {
    // Sin proveedor no se avisó a NADIE. Se deja constancia, pero jamás se
    // devuelve "enviado": quien lea esto arriba tiene que poder decírselo al
    // usuario en vez de tranquilizarlo con algo que no ocurrió.
    // eslint-disable-next-line no-console
    console.error(`[SOS:SIN CANAL → ${maskPhone(payload.to)}] no se envió nada. ${body}`);
    return 'sin_canal';
  }

  const sent = await sendSms(payload.to, body);
  // eslint-disable-next-line no-console
  console.log(`[SOS → ${maskPhone(payload.to)}] SMS ${sent ? 'enviado' : 'FALLÓ'}`);
  return sent ? 'enviado' : 'fallo';
}

// ─── Trip sharing ─────────────────────────────────────────────────────────────

interface ShareTokenClaims {
  tripId: string;
  purpose: 'trip_share';
}

/**
 * Issue a short-lived opaque token for the given trip. The caller must own the
 * trip (passenger or assigned driver). The token carries no PII.
 */
export async function createTripShareToken(
  role: SafetyRole,
  actorId: string,
  tripId: string,
): Promise<{ shareToken: string; trackPath: string; shareUrl: string; expiresInHours: number } | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { passengerId: true, driverId: true },
  });
  if (!trip) return null;
  if (role === 'client' && trip.passengerId !== actorId) return null;
  if (role === 'driver' && trip.driverId !== actorId) return null;

  const claims: ShareTokenClaims = { tripId, purpose: 'trip_share' };
  const shareToken = jwt.sign(claims, JWT_SECRET, { expiresIn: SHARE_TOKEN_TTL });
  return {
    shareToken,
    trackPath: `/safety/track/${shareToken}`,
    // La PÁGINA que abre quien lo recibe: mapa, carro y hora de llegada.
    // `trackPath` es el JSON de la API y se queda para las apps que ya lo
    // usan, pero mandarlo por WhatsApp era mandarle código a un familiar.
    shareUrl: `${PORTAL_BASE_URL}/viaje/${shareToken}`,
    expiresInHours: 6,
  };
}

export interface SharedTripStatus {
  status: string;
  /** El estado en palabras, para la página pública («Va en camino»). */
  statusLabel: string;
  originAddress: string;
  destinationAddress: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  /** Paradas con punto, en orden, para dibujar el trayecto. */
  stops: Array<{ name: string; lat?: number; lng?: number }>;
  driverFirstName?: string;
  /** Texto de siempre, para las apps que ya lo leen. */
  driverVehicle?: string;
  /** El carro por partes: quien espera busca el COLOR y la PLACA. */
  vehicle?: { brand: string; model: string; color: string; plate: string };
  /**
   * Dónde va el carro. Solo mientras el viaje está vivo y con señal reciente:
   * terminado el viaje, el enlace sigue abriendo pero ya no enseña dónde está
   * el conductor — eso ya no es asunto de nadie.
   */
  driverPosition?: { lat: number; lng: number; at: string };
  etaMinutes?: number;
  /** Hora estimada de llegada al destino, en ISO, con el viaje en curso. */
  arrivalEstimate?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

/** Estados en los que el viaje está «vivo» y tiene sentido mostrar el carro. */
const ESTADOS_EN_CURSO = new Set(['ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS']);

/** Una posición más vieja que esto no se enseña: sería mentir sobre dónde va. */
const POSICION_MAX_MS = 5 * 60_000;

const ETIQUETA_ESTADO: Record<string, string> = {
  SCHEDULED: 'Reservado',
  SEARCHING: 'Buscando conductor',
  ACCEPTED: 'Conductor en camino a recogerle',
  ARRIVING: 'Conductor en camino a recogerle',
  ARRIVED: 'El conductor llegó al punto de recogida',
  IN_PROGRESS: 'En camino al destino',
  COMPLETED: 'Llegó a su destino',
  CANCELLED: 'Viaje cancelado',
};

/**
 * Resolve a share token to a minimal, sanitised trip status for the trusted
 * contact. Deliberately omits phones, full names, and fares.
 */
export async function getSharedTripStatus(
  token: string,
  ahora: Date = new Date(),
): Promise<SharedTripStatus | null> {
  let claims: ShareTokenClaims;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as ShareTokenClaims;
    if (decoded.purpose !== 'trip_share') return null;
    claims = decoded;
  } catch {
    return null;
  }

  const trip = await prisma.trip.findUnique({
    where: { id: claims.tripId },
    include: { driver: { include: { vehicles: { where: { isActive: true }, take: 1 } } } },
  });
  if (!trip) return null;

  const v = trip.driver?.vehicles[0];
  const enCurso = ESTADOS_EN_CURSO.has(trip.status);
  const d = trip.driver;
  const posicionFresca =
    enCurso && d?.lastLat != null && d.lastLng != null && d.lastSeenAt != null &&
    ahora.getTime() - d.lastSeenAt.getTime() <= POSICION_MAX_MS;

  // La hora de llegada solo con el viaje EN CURSO y con hora de salida: antes
  // de recoger no se sabe cuánto va a tardar en subir la persona.
  const llegada =
    trip.status === 'IN_PROGRESS' && trip.startedAt && trip.etaMinutes
      ? new Date(trip.startedAt.getTime() + trip.etaMinutes * 60_000)
      : null;

  return {
    status: trip.status,
    statusLabel: ETIQUETA_ESTADO[trip.status] ?? 'En curso',
    originAddress: trip.originAddress,
    destinationAddress: trip.destAddress,
    origin: { lat: trip.originLat, lng: trip.originLng },
    destination: { lat: trip.destLat, lng: trip.destLng },
    stops: (stopsFromDb(trip.stops) ?? []).map((p) => ({
      name: p.name,
      ...(p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : {}),
    })),
    driverFirstName: trip.driver?.name?.split(' ')[0],
    driverVehicle: v ? `${v.brand} ${v.model} • ${v.plate}` : undefined,
    vehicle: v ? { brand: v.brand, model: v.model, color: v.color, plate: v.plate } : undefined,
    driverPosition: posicionFresca
      ? { lat: d!.lastLat!, lng: d!.lastLng!, at: d!.lastSeenAt!.toISOString() }
      : undefined,
    etaMinutes: trip.etaMinutes ?? undefined,
    arrivalEstimate: llegada?.toISOString(),
    startedAt: trip.startedAt?.toISOString(),
    completedAt: trip.completedAt?.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  };
}
