// ── Soporte con tickets ────────────────────────────────────────────────────────
//
// Tickets persistentes que abre un cliente o un conductor; el admin responde y
// cambia el estado desde el panel. Cada ticket es un hilo de mensajes
// (SupportMessage) con autor 'client' | 'driver' | 'admin'.

import { SupportStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { sendPushToClient } from './push.service';
import { sendPushToDriver } from './push.service';

export class SupportError extends Error {}

export type RequesterKind = 'client' | 'driver';
export type AuthorKind = 'client' | 'driver' | 'admin';

const CATEGORIES = new Set(['general', 'pago', 'viaje', 'cuenta', 'seguridad', 'otro']);

export interface SupportMessageDTO {
  id: string;
  authorKind: AuthorKind;
  body: string;
  sentAt: string;
}

export interface SupportTicketDTO {
  id: string;
  requesterKind: RequesterKind;
  requesterId: string;
  requesterName: string | null;
  subject: string;
  category: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
  messages?: SupportMessageDTO[];
}

function _msgDTO(m: { id: string; authorKind: string; body: string; createdAt: Date }): SupportMessageDTO {
  return {
    id: m.id,
    authorKind: (m.authorKind as AuthorKind) ?? 'client',
    body: m.body,
    sentAt: m.createdAt.toISOString(),
  };
}

/** Crea un ticket con el primer mensaje del solicitante. */
export async function createTicket(
  requesterKind: RequesterKind,
  requesterId: string,
  params: { subject: string; body: string; category?: string; requesterName?: string | null },
): Promise<SupportTicketDTO> {
  const subject = params.subject.trim();
  const body = params.body.trim();
  if (!subject) throw new SupportError('El asunto es requerido.');
  if (!body) throw new SupportError('Describe tu problema.');
  const category = CATEGORIES.has(params.category ?? '') ? params.category! : 'general';

  const ticket = await prisma.supportTicket.create({
    data: {
      requesterKind,
      requesterId,
      requesterName: params.requesterName ?? null,
      subject: subject.slice(0, 160),
      category,
      status: 'OPEN',
      messages: {
        create: { authorKind: requesterKind, authorId: requesterId, body: body.slice(0, 2000) },
      },
    },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  return _detailDTO(ticket);
}

/** Lista los tickets de un solicitante (más recientes primero). */
export async function listTicketsFor(
  requesterKind: RequesterKind,
  requesterId: string,
): Promise<SupportTicketDTO[]> {
  const rows = await prisma.supportTicket.findMany({
    where: { requesterKind, requesterId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return rows.map((t) => _listDTO(t, t.messages[0]?.body ?? null));
}

/** Detalle de un ticket con todos sus mensajes (autorizado al solicitante). */
export async function getTicketDetail(
  ticketId: string,
  requesterKind: RequesterKind,
  requesterId: string,
): Promise<SupportTicketDTO> {
  const t = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!t) throw new SupportError('Ticket no encontrado.');
  if (t.requesterKind !== requesterKind || t.requesterId !== requesterId) {
    throw new SupportError('No autorizado.');
  }
  return _detailDTO(t);
}

/** El solicitante agrega un mensaje a su ticket (reabre si estaba resuelto). */
export async function addRequesterMessage(
  ticketId: string,
  requesterKind: RequesterKind,
  requesterId: string,
  body: string,
): Promise<SupportTicketDTO> {
  const text = body.trim();
  if (!text) throw new SupportError('El mensaje está vacío.');
  const t = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!t) throw new SupportError('Ticket no encontrado.');
  if (t.requesterKind !== requesterKind || t.requesterId !== requesterId) {
    throw new SupportError('No autorizado.');
  }
  await prisma.supportMessage.create({
    data: { ticketId, authorKind: requesterKind, authorId: requesterId, body: text.slice(0, 2000) },
  });
  // Nuevo mensaje del usuario → vuelve a abrir la atención.
  const nextStatus: SupportStatus = t.status === 'CLOSED' || t.status === 'RESOLVED' ? 'OPEN' : t.status;
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: nextStatus } });
  return getTicketDetail(ticketId, requesterKind, requesterId);
}

// ── Admin ───────────────────────────────────────────────────────────────────

/** Lista tickets para el panel admin (filtro opcional por estado). */
export async function listAllTickets(status?: SupportStatus): Promise<SupportTicketDTO[]> {
  const rows = await prisma.supportTicket.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return rows.map((t) => _listDTO(t, t.messages[0]?.body ?? null));
}

/** Detalle de un ticket para el admin (sin filtro de solicitante). */
export async function getTicketForAdmin(ticketId: string): Promise<SupportTicketDTO> {
  const t = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!t) throw new SupportError('Ticket no encontrado.');
  return _detailDTO(t);
}

/** El admin responde un ticket; pasa a IN_PROGRESS y avisa al solicitante. */
export async function adminReply(ticketId: string, body: string): Promise<SupportTicketDTO> {
  const text = body.trim();
  if (!text) throw new SupportError('El mensaje está vacío.');
  const t = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!t) throw new SupportError('Ticket no encontrado.');
  await prisma.supportMessage.create({
    data: { ticketId, authorKind: 'admin', authorId: null, body: text.slice(0, 2000) },
  });
  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: t.status === 'CLOSED' ? 'IN_PROGRESS' : t.status === 'OPEN' ? 'IN_PROGRESS' : t.status },
  });
  _notifyRequester(t.requesterKind, t.requesterId, 'Soporte Nexum respondió tu ticket', text);
  return getTicketForAdmin(ticketId);
}

/** El admin cambia el estado del ticket. */
export async function setTicketStatus(ticketId: string, status: SupportStatus): Promise<SupportTicketDTO> {
  const t = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!t) throw new SupportError('Ticket no encontrado.');
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status } });
  return getTicketForAdmin(ticketId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _notifyRequester(kind: string, id: string, title: string, body: string): void {
  const preview = body.length > 90 ? `${body.slice(0, 90)}…` : body;
  if (kind === 'client') {
    void sendPushToClient(id, { title, body: preview, data: { type: 'support_reply' } });
  } else if (kind === 'driver') {
    void sendPushToDriver(id, { title, body: preview, data: { type: 'support_reply' } });
  }
}

function _listDTO(
  t: {
    id: string; requesterKind: string; requesterId: string; requesterName: string | null;
    subject: string; category: string; status: SupportStatus; createdAt: Date; updatedAt: Date;
  },
  lastMessage: string | null,
): SupportTicketDTO {
  return {
    id: t.id,
    requesterKind: t.requesterKind === 'driver' ? 'driver' : 'client',
    requesterId: t.requesterId,
    requesterName: t.requesterName,
    subject: t.subject,
    category: t.category,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    lastMessage,
  };
}

function _detailDTO(
  t: {
    id: string; requesterKind: string; requesterId: string; requesterName: string | null;
    subject: string; category: string; status: SupportStatus; createdAt: Date; updatedAt: Date;
    messages: Array<{ id: string; authorKind: string; body: string; createdAt: Date }>;
  },
): SupportTicketDTO {
  const base = _listDTO(t, t.messages[t.messages.length - 1]?.body ?? null);
  return { ...base, messages: t.messages.map(_msgDTO) };
}
