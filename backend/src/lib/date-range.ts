// Rango de fechas para los reportes de liquidación.
//
// Vive en lib/ y no dentro del servicio para poder probarlo sin base de datos:
// un error aquí no rompe nada visiblemente, solo devuelve cifras equivocadas, y
// la empresa lo descubriría al cuadrar el mes con sus conductores.

export interface RangoFechas {
  createdAt?: { gte?: Date; lte?: Date };
}

/**
 * Construye el filtro `createdAt` de Prisma a partir de dos fechas sueltas.
 *
 * `to` llega como día ("2026-07-31") y se toma COMPLETO, hasta las 23:59:59.
 * Sin eso, `lte: 2026-07-31T00:00:00` dejaría fuera todo el último día del mes
 * y el reporte no cuadraría justo en el corte que importa.
 *
 * Una fecha inválida se ignora en vez de reventar: es preferible un reporte de
 * más a un portal que falla porque alguien escribió mal en el campo.
 */
export function rangoFechas(from?: string, to?: string): RangoFechas {
  const desde = from ? new Date(from) : null;
  const hasta = to ? new Date(to) : null;
  const valido = (d: Date | null): d is Date => d != null && !Number.isNaN(d.getTime());

  if (!valido(desde) && !valido(hasta)) return {};

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (valido(desde)) createdAt.gte = desde;
  if (valido(hasta)) createdAt.lte = new Date(hasta.setHours(23, 59, 59, 999));
  return { createdAt };
}
