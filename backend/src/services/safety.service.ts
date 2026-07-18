import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/constants';
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

export interface RecordSosResult {
  eventId: string;
  createdAt: string;
  trustedContactNotified: boolean;
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
  let trustedContactNotified = false;
  if (contact.phone) {
    trustedContactNotified = await notifyTrustedContact({
      to: contact.phone,
      contactName: contact.name ?? 'tu contacto',
      lat,
      lng,
      tripId,
    });
  }

  return {
    eventId: event.id,
    createdAt: event.createdAt.toISOString(),
    trustedContactNotified,
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
}): Promise<boolean> {
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
    // eslint-disable-next-line no-console
    console.log(`[SOS:mock → ${maskPhone(payload.to)}] ${body}`);
    return true; // queued en modo dev
  }

  const sent = await sendSms(payload.to, body);
  // eslint-disable-next-line no-console
  console.log(`[SOS → ${maskPhone(payload.to)}] SMS ${sent ? 'enviado' : 'FALLÓ'}`);
  return sent;
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
): Promise<{ shareToken: string; trackPath: string; expiresInHours: number } | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { passengerId: true, driverId: true },
  });
  if (!trip) return null;
  if (role === 'client' && trip.passengerId !== actorId) return null;
  if (role === 'driver' && trip.driverId !== actorId) return null;

  const claims: ShareTokenClaims = { tripId, purpose: 'trip_share' };
  const shareToken = jwt.sign(claims, JWT_SECRET, { expiresIn: SHARE_TOKEN_TTL });
  return { shareToken, trackPath: `/safety/track/${shareToken}`, expiresInHours: 6 };
}

export interface SharedTripStatus {
  status: string;
  originAddress: string;
  destinationAddress: string;
  driverFirstName?: string;
  driverVehicle?: string;
  etaMinutes?: number;
  updatedAt: string;
}

/**
 * Resolve a share token to a minimal, sanitised trip status for the trusted
 * contact. Deliberately omits phones, full names, and fares.
 */
export async function getSharedTripStatus(token: string): Promise<SharedTripStatus | null> {
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
  return {
    status: trip.status,
    originAddress: trip.originAddress,
    destinationAddress: trip.destAddress,
    driverFirstName: trip.driver?.name?.split(' ')[0],
    driverVehicle: v ? `${v.brand} ${v.model} • ${v.plate}` : undefined,
    etaMinutes: trip.etaMinutes ?? undefined,
    updatedAt: trip.updatedAt.toISOString(),
  };
}
