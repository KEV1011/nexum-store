// Campañas de temporada: el admin las crea, los locales inscriben productos y
// la app las anuncia mientras rigen. Las reglas viven en `lib/campanas.ts`.

import { prisma } from '../lib/prisma';
import {
  CampanaError,
  estadoCampana,
  fechaColombia,
  saneaCampana,
  type CampanaEntrada,
  type EstadoCampana,
} from '../lib/campanas';
import { getMunicipality } from './municipality.service';

export { CampanaError } from '../lib/campanas';

export interface CampanaDTO {
  id: string;
  title: string;
  subtitle: string | null;
  citySlug: string | null;
  /** Fechas como las escribe el admin (AAAA-MM-DD, día de Colombia). */
  desde: string;
  hasta: string;
  startsAt: string;
  endsAt: string;
  icon: string | null;
  color: string | null;
  active: boolean;
  estado: EstadoCampana;
}

export interface CampanaAdminDTO extends CampanaDTO {
  /** Productos inscritos (de todos los locales). */
  productos: number;
  /** Locales con al menos un producto inscrito. */
  locales: number;
}

type FilaCampana = {
  id: string; title: string; subtitle: string | null; citySlug: string | null;
  startsAt: Date; endsAt: Date; icon: string | null; color: string | null; active: boolean;
};

function aDTO(c: FilaCampana, ahora: Date = new Date()): CampanaDTO {
  return {
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    citySlug: c.citySlug,
    desde: fechaColombia(c.startsAt),
    hasta: fechaColombia(c.endsAt),
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    icon: c.icon,
    color: c.color,
    active: c.active,
    estado: estadoCampana(c, ahora),
  };
}

async function sanearConCiudad(e: CampanaEntrada) {
  const s = saneaCampana(e);
  // Una ciudad que no existe dejaría la campaña sin anunciarse en ninguna
  // parte, sin un solo error que lo delate.
  if (s.citySlug && !(await getMunicipality(s.citySlug))) {
    throw new CampanaError(`No conocemos la ciudad «${s.citySlug}».`);
  }
  return s;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listarCampanasAdmin(): Promise<CampanaAdminDTO[]> {
  const filas = await prisma.campaign.findMany({ orderBy: { startsAt: 'desc' } });
  const conteos = await prisma.product.groupBy({
    by: ['campaignId', 'businessId'],
    where: { campaignId: { in: filas.map((f) => f.id) } },
    _count: { _all: true },
  });
  return filas.map((c) => {
    const mias = conteos.filter((x) => x.campaignId === c.id);
    return {
      ...aDTO(c),
      productos: mias.reduce((n, x) => n + x._count._all, 0),
      locales: mias.length,
    };
  });
}

export async function crearCampana(e: CampanaEntrada): Promise<CampanaDTO> {
  const s = await sanearConCiudad(e);
  return aDTO(await prisma.campaign.create({ data: s }));
}

export async function actualizarCampana(id: string, e: CampanaEntrada): Promise<CampanaDTO> {
  const s = await sanearConCiudad(e);
  const r = await prisma.campaign.updateMany({ where: { id }, data: s });
  if (r.count === 0) throw new CampanaError('Esa campaña no existe.');
  return aDTO((await prisma.campaign.findUnique({ where: { id } }))!);
}

export async function encenderCampana(id: string, active: boolean): Promise<CampanaDTO> {
  const r = await prisma.campaign.updateMany({ where: { id }, data: { active } });
  if (r.count === 0) throw new CampanaError('Esa campaña no existe.');
  return aDTO((await prisma.campaign.findUnique({ where: { id } }))!);
}

// ─── Portal del negocio ──────────────────────────────────────────────────────

/**
 * Las campañas en las que ESTE local puede inscribir productos: encendidas,
 * sin terminar y de su ciudad (o de todas). Las próximas también — el local
 * prepara su hamburguesa especial ANTES de que abra el evento.
 */
export async function campanasParaNegocio(businessId: string): Promise<CampanaDTO[]> {
  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    select: { citySlug: true },
  });
  const ahora = new Date();
  const filas = await prisma.campaign.findMany({
    where: {
      active: true,
      endsAt: { gte: ahora },
      OR: [{ citySlug: null }, ...(biz?.citySlug ? [{ citySlug: biz.citySlug }] : [])],
    },
    orderBy: { startsAt: 'asc' },
  });
  return filas.map((c) => aDTO(c, ahora));
}

// ─── App del cliente ─────────────────────────────────────────────────────────

export interface CampanaClienteDTO extends CampanaDTO {
  /** Cuántos productos se pueden ver ahora en la sección. */
  productos: number;
}

/**
 * Las campañas que rigen AHORA en la plaza del cliente, con al menos un
 * producto que enseñar. Un anuncio que abre una sección vacía es peor que no
 * anunciar nada: por eso, hasta que los locales no inscriban algo, no sale.
 *
 * Sin plaza conocida (sin ubicación) se enseñan todas las vigentes: es mejor
 * anunciar el Burger Show de más a esconderlo de quien no dio el GPS.
 */
export async function campanasVigentesParaCliente(
  plaza: string | null,
  ahora: Date = new Date(),
): Promise<CampanaClienteDTO[]> {
  const filas = await prisma.campaign.findMany({
    where: {
      active: true,
      startsAt: { lte: ahora },
      endsAt: { gte: ahora },
      ...(plaza ? { OR: [{ citySlug: null }, { citySlug: plaza }] } : {}),
    },
    orderBy: { startsAt: 'asc' },
  });
  if (filas.length === 0) return [];
  const conteos = await prisma.product.groupBy({
    by: ['campaignId'],
    where: {
      campaignId: { in: filas.map((f) => f.id) },
      isAvailable: true,
      business: { isOpen: true },
    },
    _count: { _all: true },
  });
  const porCampana = new Map(conteos.map((x) => [x.campaignId, x._count._all]));
  return filas
    .map((c) => ({ ...aDTO(c, ahora), productos: porCampana.get(c.id) ?? 0 }))
    .filter((c) => c.productos > 0);
}
