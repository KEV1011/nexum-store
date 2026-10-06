/**
 * Lo que la empresa necesita para reportar un viaje al RNDC.
 *
 * Reúne de la base los datos que el Ministerio pide y que hoy la empresa
 * recopila a mano de cuatro sitios: el NIT de su ficha, la placa del
 * vehículo, la cédula y la licencia del conductor, los códigos DANE de los
 * municipios, el remitente, el destinatario, el peso, el flete y el pago al
 * conductor.
 *
 * NO REPORTA. Reporta la empresa, con su usuario y su clave del Ministerio
 * — ZIPA no es una empresa de transporte habilitada. Aquí se prepara lo que
 * hay que llevar y se guarda la constancia de lo que se llevó.
 */

import { prisma } from '../lib/prisma';
import {
  faltantesParaRndc,
  saneaConstanciaRndc,
  RndcInvalido,
  type DatosDespacho,
  type FaltanteRndc,
} from '../lib/rndc';

export { RndcInvalido };

export interface PreparacionRndc {
  datos: DatosDespacho;
  faltan: FaltanteRndc[];
  listo: boolean;
  /** Si ya se reportó, con qué números y cuándo. */
  reportado?: { remesa: string; manifiesto: string; fecha: string };
}

/** Los datos del despacho tal como están hoy, y qué falta. */
export async function prepararRndc(
  operatorId: string, cargoTripId: string,
): Promise<PreparacionRndc | null> {
  const t = await prisma.cargoTrip.findUnique({
    where: { id: cargoTripId },
    include: {
      manifests: {
        where: { status: { not: 'CANCELLED' } },
        select: { clientName: true, reference: true, clientCity: true },
      },
      freight: {
        select: {
          senderName: true, senderDocType: true, senderDocNumber: true,
          cargoDescription: true, weightKg: true,
        },
      },
    },
  });
  if (!t || t.operatorId !== operatorId) return null;

  const [empresa, conductor, vehiculo] = await Promise.all([
    prisma.operator.findUnique({ where: { id: operatorId }, select: { nit: true } }),
    t.driverId
      ? prisma.driver.findUnique({
          where: { id: t.driverId },
          select: { documentNumber: true, licenseNumber: true },
        })
      : Promise.resolve(null),
    t.vehicleId
      ? prisma.vehicle.findUnique({ where: { id: t.vehicleId }, select: { plate: true } })
      : Promise.resolve(null),
  ]);

  // El código DANE sale de la tabla de municipios, que ya lo tiene. Si falta
  // es pendiente NUESTRO, y el mensaje de `lib/rndc` lo dice así.
  const slugs = [t.originCity, t.destCity].filter((v): v is string => !!v);
  const municipios = slugs.length
    ? await prisma.municipality.findMany({
        where: { slug: { in: slugs.map((s) => s.toLowerCase()) } },
        select: { slug: true, daneCode: true },
      })
    : [];
  const dane = new Map(municipios.map((m) => [m.slug, m.daneCode]));

  // El remitente sale del flete que originó el viaje, cuando lo hubo. Un
  // viaje creado en el portal todavía no lo pide, y eso se ve como un
  // faltante en vez de rellenarse con el nombre de la empresa — que sería
  // declarar remitente a quien no lo es.
  const remitente = t.freight?.senderName
    ? `${t.freight.senderDocType ?? ''} ${t.freight.senderDocNumber ?? ''} ${t.freight.senderName}`.trim()
    : null;

  const primeraLinea = t.manifests[0];

  const datos: DatosDespacho = {
    nitEmpresa: empresa?.nit ?? null,
    // La placa sellada en el viaje manda sobre la del vehículo: el documento
    // no puede cambiar si mañana la flota edita la ficha del camión.
    placa: t.vehiclePlate ?? vehiculo?.plate ?? null,
    documentoConductor: conductor?.documentNumber ?? null,
    licenciaConductor: conductor?.licenseNumber ?? null,
    daneOrigen: dane.get((t.originCity ?? '').toLowerCase()) ?? null,
    daneDestino: dane.get((t.destCity ?? '').toLowerCase()) ?? null,
    remitente,
    destinatario: primeraLinea?.clientName ?? null,
    pesoKg: t.weightKg ?? t.freight?.weightKg ?? null,
    descripcionCarga: t.freight?.cargoDescription ?? primeraLinea?.reference ?? null,
    valorFlete: t.freightAmount ?? null,
    valorPagoConductor: t.driverPayAmount ?? null,
  };

  const faltan = faltantesParaRndc(datos);
  return {
    datos,
    faltan,
    listo: faltan.length === 0,
    ...(t.rndcRemesa && t.rndcManifiesto && t.rndcReportedAt
      ? {
          reportado: {
            remesa: t.rndcRemesa,
            manifiesto: t.rndcManifiesto,
            fecha: t.rndcReportedAt.toISOString(),
          },
        }
      : {}),
  };
}

/**
 * Deja constancia de lo reportado.
 *
 * No se comprueba contra el Ministerio —no hablamos con él— así que esto es
 * literalmente lo que la empresa declara haber reportado. Vale lo que vale
 * una constancia: queda por escrito quién dijo qué y cuándo, que es lo que
 * permite auditar un viaje meses después.
 *
 * Se puede CORREGIR mientras no cambie de manos: quien se equivoca al
 * teclear el número lo arregla, y no hay nada que anular porque el trámite
 * real vive en otro sistema. Lo que sí queda es la fecha, que se reescribe
 * con la corrección para no afirmar una hora que no fue.
 */
export async function anotarConstanciaRndc(
  operatorId: string, cargoTripId: string, body: unknown,
): Promise<{ remesa: string; manifiesto: string; fecha: string }> {
  const c = saneaConstanciaRndc(body);
  // `updateMany` con el operatorId en el `where`: pertenencia y escritura en
  // una sola operación, el patrón del resto del repo.
  const r = await prisma.cargoTrip.updateMany({
    where: { id: cargoTripId, operatorId },
    data: {
      rndcRemesa: c.remesa,
      rndcManifiesto: c.manifiesto,
      rndcReportedAt: new Date(),
    },
  });
  if (r.count === 0) throw new RndcInvalido('El viaje no existe o no es tuyo.');
  const t = await prisma.cargoTrip.findUnique({
    where: { id: cargoTripId },
    select: { rndcReportedAt: true },
  });
  return {
    remesa: c.remesa,
    manifiesto: c.manifiesto,
    fecha: (t?.rndcReportedAt ?? new Date()).toISOString(),
  };
}
