import { prisma } from '../lib/prisma';
import {
  etiquetaMotivo,
  saneaBloqueo,
  saneaReporte,
  type EntradaReporte,
  type QuienReporta,
} from '../lib/reportes';

// ─── Moderación: reportes y bloqueos ─────────────────────────────────────────
//
// Las reglas están en `lib/reportes.ts` (puras y probadas). Aquí solo se
// persiste y se consulta.
//
// Un reporte NO borra nada por sí solo, y es deliberado: el contenido de un
// chat es la prueba de lo que pasó en un servicio, y un sistema que borra
// solo con que alguien pulse un botón es un arma para el que reporta. Lo que
// hace el reporte es entrar en una cola que un humano revisa; lo que sí es
// inmediato y no necesita a nadie es el bloqueo, porque solo afecta a quien lo
// pulsa.

export interface ReporteDTO {
  id: string;
  reporterKind: string;
  reporterId: string;
  reporterNombre: string | null;
  targetKind: string;
  targetId: string;
  reason: string;
  reasonEtiqueta: string;
  detail: string | null;
  status: string;
  resolution: string | null;
  reviewedBy: string | null;
  createdAt: string;
}

export interface BloqueoDTO {
  id: string;
  blockedKind: string;
  blockedId: string;
  nombre: string | null;
  createdAt: string;
}

export async function crearReporte(
  quienReporta: QuienReporta,
  quienId: string,
  entrada: EntradaReporte,
): Promise<{ id: string; urgente: boolean }> {
  const r = saneaReporte(entrada, quienReporta, quienId);
  const fila = await prisma.contentReport.create({
    data: {
      reporterKind: quienReporta,
      reporterId: quienId,
      targetKind: r.targetKind,
      targetId: r.targetId,
      reason: r.reason,
      detail: r.detail,
    },
    select: { id: true },
  });
  // Un reporte urgente que nadie mira hasta el lunes no cumple con nada. Sin
  // canal de avisos configurado, al menos queda en el log del servidor con la
  // palabra que se busca.
  if (r.urgente) {
    console.warn(
      `[Moderación] URGENTE ${r.reason} · ${r.targetKind}=${r.targetId} · reporte=${fila.id}`,
    );
  }
  return { id: fila.id, urgente: r.urgente };
}

export async function bloquear(
  quienBloquea: QuienReporta,
  quienId: string,
  objetivo: { kind?: unknown; id?: unknown; reason?: unknown },
): Promise<void> {
  const par = saneaBloqueo(quienBloquea, quienId, objetivo);
  const reason = objetivo.reason == null ? null : String(objetivo.reason).slice(0, 200);
  // Bloquear dos veces no es un error: es la misma intención repetida.
  await prisma.userBlock.upsert({
    where: {
      blockerKind_blockerId_blockedKind_blockedId: {
        blockerKind: par.blockerKind,
        blockerId: par.blockerId,
        blockedKind: par.blockedKind,
        blockedId: par.blockedId,
      },
    },
    create: { ...par, reason },
    update: {},
  });
}

export async function desbloquear(
  quienBloquea: QuienReporta,
  quienId: string,
  bloqueadoId: string,
): Promise<void> {
  await prisma.userBlock.deleteMany({
    where: {
      blockerKind: quienBloquea,
      blockerId: quienId,
      blockedId: bloqueadoId,
    },
  });
}

/** A quién tiene bloqueado esta persona, con nombre para poder desbloquear. */
export async function listarBloqueos(
  quienBloquea: QuienReporta,
  quienId: string,
): Promise<BloqueoDTO[]> {
  const filas = await prisma.userBlock.findMany({
    where: { blockerKind: quienBloquea, blockerId: quienId },
    orderBy: { createdAt: 'desc' },
  });
  if (filas.length === 0) return [];

  // Un listado de identificadores no le sirve a nadie para decidir a quién
  // desbloquear.
  const idsConductor = filas.filter((f) => f.blockedKind === 'driver').map((f) => f.blockedId);
  const idsCliente = filas.filter((f) => f.blockedKind === 'client').map((f) => f.blockedId);
  const [conductores, clientes] = await Promise.all([
    idsConductor.length
      ? prisma.driver.findMany({ where: { id: { in: idsConductor } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    idsCliente.length
      ? prisma.user.findMany({ where: { id: { in: idsCliente } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const nombres = new Map<string, string | null>();
  for (const c of conductores) nombres.set(c.id, c.name);
  for (const c of clientes) nombres.set(c.id, c.name);

  return filas.map((f) => ({
    id: f.id,
    blockedKind: f.blockedKind,
    blockedId: f.blockedId,
    nombre: nombres.get(f.blockedId) ?? null,
    createdAt: f.createdAt.toISOString(),
  }));
}

// ─── Panel de administración ─────────────────────────────────────────────────

export async function listarReportes(estado = 'PENDING', limite = 100): Promise<ReporteDTO[]> {
  const filas = await prisma.contentReport.findMany({
    where: estado === 'ALL' ? {} : { status: estado },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limite, 1), 300),
  });
  if (filas.length === 0) return [];

  const idsConductor = filas.filter((f) => f.reporterKind === 'driver').map((f) => f.reporterId);
  const idsCliente = filas.filter((f) => f.reporterKind === 'client').map((f) => f.reporterId);
  const [conductores, clientes] = await Promise.all([
    idsConductor.length
      ? prisma.driver.findMany({ where: { id: { in: idsConductor } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    idsCliente.length
      ? prisma.user.findMany({ where: { id: { in: idsCliente } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const nombres = new Map<string, string | null>();
  for (const c of conductores) nombres.set(c.id, c.name);
  for (const c of clientes) nombres.set(c.id, c.name);

  return filas.map((f) => ({
    id: f.id,
    reporterKind: f.reporterKind,
    reporterId: f.reporterId,
    reporterNombre: nombres.get(f.reporterId) ?? null,
    targetKind: f.targetKind,
    targetId: f.targetId,
    reason: f.reason,
    reasonEtiqueta: etiquetaMotivo(f.reason),
    detail: f.detail,
    status: f.status,
    resolution: f.resolution,
    reviewedBy: f.reviewedBy,
    createdAt: f.createdAt.toISOString(),
  }));
}

export async function resolverReporte(
  id: string,
  decision: 'ACTIONED' | 'DISMISSED',
  quien: string,
  nota?: string,
): Promise<void> {
  // `updateMany` con guard de estado: dos administradores revisando la misma
  // cola no se pisan la decisión del otro sin enterarse.
  const r = await prisma.contentReport.updateMany({
    where: { id, status: 'PENDING' },
    data: {
      status: decision,
      resolution: nota?.slice(0, 500) ?? null,
      reviewedBy: quien,
      reviewedAt: new Date(),
    },
  });
  if (r.count === 0) throw new Error('El reporte ya fue revisado por alguien más.');
}

/** Cuántos reportes esperan revisión. Para el badge del panel. */
export function reportesPendientes(): Promise<number> {
  return prisma.contentReport.count({ where: { status: 'PENDING' } });
}
