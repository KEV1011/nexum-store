/**
 * La comisión que aplica a UN servicio concreto, resuelta contra la base.
 *
 * La regla (flota → ciudad → global) vive en `lib/comision.ts`, suelta y
 * probada. Aquí solo se buscan los dos datos que necesita.
 *
 * Se llama al LIQUIDAR, no al cotizar: lo que se guarda en el servicio
 * (`commission`, `netEarning`) es la foto de ese momento y no vuelve a
 * calcularse. Renegociar con una flota mañana no puede cambiar lo que se le
 * pagó ayer.
 */
import { prisma } from '../lib/prisma';
import { resolverComision, type ComisionResuelta } from '../lib/comision';
import { municipioDeCoordenadas } from './municipality.service';

export interface ContextoComision {
  /** Empresa a la que está afiliado el conductor, si la hay. */
  operatorId?: string | null;
  /** Conductor: se usa para averiguar su empresa cuando no viene dada. */
  driverId?: string | null;
  /** Dónde ocurrió el servicio, para resolver la ciudad. */
  lat?: number | null;
  lng?: number | null;
}

/**
 * Resuelve la comisión de un servicio.
 *
 * Best-effort por diseño: si cualquiera de las dos consultas falla, se cae a la
 * global en vez de reventar la liquidación. Cerrar un viaje es lo que de verdad
 * importa en ese instante, y la comisión por defecto es la que se ha cobrado
 * siempre — no una invención.
 */
export async function comisionPara(ctx: ContextoComision): Promise<ComisionResuelta> {
  let tasaFlota: number | null = null;
  let tasaCiudad: number | null = null;

  try {
    let operatorId = ctx.operatorId ?? null;
    if (!operatorId && ctx.driverId) {
      const d = await prisma.driver.findUnique({
        where: { id: ctx.driverId },
        select: { operatorId: true },
      });
      operatorId = d?.operatorId ?? null;
    }
    if (operatorId) {
      const op = await prisma.operator.findUnique({
        where: { id: operatorId },
        select: { commissionRate: true },
      });
      tasaFlota = op?.commissionRate ?? null;
    }
  } catch {
    /* sin flota: se sigue bajando en la precedencia */
  }

  try {
    if (typeof ctx.lat === 'number' && typeof ctx.lng === 'number') {
      const m = await municipioDeCoordenadas(ctx.lat, ctx.lng);
      tasaCiudad = m?.commissionRate ?? null;
    }
  } catch {
    /* sin ciudad: queda la global */
  }

  return resolverComision(tasaFlota, tasaCiudad);
}

/** Solo la tasa, para quien no necesita saber de dónde salió. */
export async function tasaComision(ctx: ContextoComision): Promise<number> {
  return (await comisionPara(ctx)).tasa;
}
