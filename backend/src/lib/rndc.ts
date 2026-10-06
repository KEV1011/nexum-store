/**
 * Lo que el RNDC exige de cada despacho, y qué nos falta para dárselo.
 *
 * QUÉ ES. El Registro Nacional de Despachos de Carga es el sistema del
 * Ministerio de Transporte donde las empresas habilitadas reportan sus
 * despachos de carga: la remesa terrestre (remitente, destinatario,
 * mercancía) y el manifiesto electrónico (empresa, vehículo, conductor,
 * viaje y flete). No es papeleo opcional — sin manifiesto el viaje no es
 * legal, y lo pide la policía de carreteras.
 *
 * QUIÉN REPORTA, Y POR QUÉ ESO LO CAMBIA TODO. Reporta la EMPRESA
 * habilitada, con su usuario y su clave del Ministerio. ZIPA no es una
 * empresa de transporte habilitada: las que usan el portal sí lo son. Así
 * que nuestro papel NO es reportar en nombre de nadie —no podríamos—, es:
 *
 *   1. Tener listos los datos que el RNDC pide, para que la empresa no los
 *      recopile a mano de cuatro sitios distintos.
 *   2. Decirle qué le FALTA antes de que se siente a reportar.
 *   3. Guardar la constancia de lo reportado, con su número, para que el
 *      viaje se pueda auditar después.
 *
 * LO QUE ESTO NO HACE, Y ES DELIBERADO. No habla con el web service del
 * Ministerio. Esa integración existe —es SOAP con usuario y clave por
 * empresa— pero su especificación no se puede verificar desde aquí, y un
 * XML escrito de memoria contra un sistema del Estado no es «un primer
 * intento»: es un despacho rechazado, o peor, uno aceptado con datos
 * equivocados a nombre de una empresa real. Ver `docs/RNDC.md` para qué
 * hace falta para automatizarlo.
 *
 * TAMPOCO VALIDA EL FLETE MÍNIMO. El RNDC rechaza un manifiesto por debajo
 * del costo del SICE-TAC para esa ruta y ese vehículo. Esa tabla la publica
 * el Ministerio y cambia; inventarla haría que el portal aprobara fletes
 * que el Ministerio después rechaza, que es peor que no decir nada.
 */

/** De dónde sale cada dato que el RNDC pide. */
export interface DatosDespacho {
  /** NIT de la empresa habilitada. */
  nitEmpresa?: string | null;
  /** Placa del vehículo. */
  placa?: string | null;
  /** Cédula del conductor. */
  documentoConductor?: string | null;
  /** Licencia de conducción. */
  licenciaConductor?: string | null;
  /** Código DANE del municipio de origen. El RNDC va por código, no por nombre. */
  daneOrigen?: string | null;
  daneDestino?: string | null;
  /** Quién entrega la carga, identificado. */
  remitente?: string | null;
  /** A quién va. */
  destinatario?: string | null;
  /** Peso total en kg. */
  pesoKg?: number | null;
  /** Qué es la mercancía. */
  descripcionCarga?: string | null;
  /** Valor del flete pactado con el cliente. */
  valorFlete?: number | null;
  /** Lo que se le paga al conductor o al propietario del vehículo. */
  valorPagoConductor?: number | null;
}

export interface FaltanteRndc {
  campo: keyof DatosDespacho;
  /** Qué hacer, en la pantalla donde se arregla. No «falta daneOrigen». */
  queHacer: string;
}

/**
 * Qué le falta a este despacho para poder reportarlo.
 *
 * El texto dice DÓNDE se arregla, no el nombre del campo: quien lee esto
 * es un despachador con el camión cargado, y «falta documentoConductor» no
 * le dice a qué pantalla ir.
 *
 * El orden es el de la pantalla donde se arreglan, agrupado: empresa,
 * vehículo y conductor primero —que se arreglan una vez y valen para todos
 * los viajes— y después lo del viaje concreto.
 */
export function faltantesParaRndc(d: DatosDespacho): FaltanteRndc[] {
  const falta: FaltanteRndc[] = [];
  const vacio = (v: unknown) =>
    v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

  if (vacio(d.nitEmpresa)) {
    falta.push({ campo: 'nitEmpresa', queHacer: 'Completa el NIT en «Mi empresa».' });
  }
  if (vacio(d.placa)) {
    falta.push({ campo: 'placa', queHacer: 'Asigna un vehículo al viaje.' });
  }
  if (vacio(d.documentoConductor)) {
    falta.push({
      campo: 'documentoConductor',
      queHacer: 'Al conductor le falta la cédula en su ficha de «Equipo».',
    });
  }
  if (vacio(d.licenciaConductor)) {
    falta.push({
      campo: 'licenciaConductor',
      queHacer: 'Al conductor le falta el número de licencia en su ficha.',
    });
  }
  if (vacio(d.daneOrigen) || vacio(d.daneDestino)) {
    // Este es NUESTRO pendiente, no de la empresa, y se dice así: mandarla a
    // buscar un código DANE que el portal debería saber sería echarle encima
    // un trabajo que no es suyo.
    falta.push({
      campo: vacio(d.daneOrigen) ? 'daneOrigen' : 'daneDestino',
      queHacer: 'Falta el código DANE del municipio. Avísanos para cargarlo.',
    });
  }
  if (vacio(d.remitente)) {
    falta.push({ campo: 'remitente', queHacer: 'Declara quién entrega la carga.' });
  }
  if (vacio(d.destinatario)) {
    falta.push({ campo: 'destinatario', queHacer: 'Añade el destinatario en la línea de mercancía.' });
  }
  if (!d.pesoKg || d.pesoKg <= 0) {
    falta.push({ campo: 'pesoKg', queHacer: 'Indica el peso total del viaje en kg.' });
  }
  if (vacio(d.descripcionCarga)) {
    falta.push({ campo: 'descripcionCarga', queHacer: 'Describe qué mercancía va.' });
  }
  if (!d.valorFlete || d.valorFlete <= 0) {
    falta.push({ campo: 'valorFlete', queHacer: 'Indica el valor del flete del viaje.' });
  }
  if (!d.valorPagoConductor || d.valorPagoConductor <= 0) {
    falta.push({
      campo: 'valorPagoConductor',
      queHacer: 'Indica cuánto se le paga al conductor o al propietario.',
    });
  }
  return falta;
}

/** ¿Está listo para que la empresa lo reporte? */
export function listoParaRndc(d: DatosDespacho): boolean {
  return faltantesParaRndc(d).length === 0;
}

export type EstadoRndc = 'no_reportado' | 'reportado';

export class RndcInvalido extends Error {}

export interface ConstanciaRndc {
  remesa: string;
  manifiesto: string;
}

const LARGO_MAX = 40;

/**
 * La constancia de lo reportado: los dos números que devuelve el RNDC.
 *
 * SE EXIGEN LOS DOS. Un manifiesto sin su remesa no describe un despacho
 * completo, y guardar medio reporte haría que el viaje figurara como
 * reportado cuando no lo está — que es exactamente la constancia que falla
 * el día que la pidan.
 *
 * Se guardan TAL CUAL los devuelve el Ministerio: son identificadores
 * ajenos y normalizarlos es inventarse el número de un trámite que existe
 * en otro sistema. (La misma regla del número de la remesa en papel.)
 */
export function saneaConstanciaRndc(v: unknown): ConstanciaRndc {
  const raw = (typeof v === 'object' && v !== null ? v : {}) as {
    remesa?: unknown; manifiesto?: unknown;
  };
  const remesa = typeof raw.remesa === 'string' ? raw.remesa.trim().slice(0, LARGO_MAX) : '';
  const manifiesto = typeof raw.manifiesto === 'string'
    ? raw.manifiesto.trim().slice(0, LARGO_MAX) : '';

  if (remesa.length < 2 || manifiesto.length < 2) {
    throw new RndcInvalido(
      'Para dejar constancia hacen falta los DOS números del RNDC: el de la '
      + 'remesa y el del manifiesto.',
    );
  }
  if (remesa === manifiesto) {
    // Casi siempre es el mismo valor pegado dos veces por error, y deja una
    // constancia que no se puede cruzar con nada.
    throw new RndcInvalido('La remesa y el manifiesto no pueden tener el mismo número.');
  }
  return { remesa, manifiesto };
}

/**
 * Si el portal exige el reporte antes de despachar.
 *
 * APAGADO por defecto, y no por duda: encenderlo hoy pararía camiones
 * cargados de empresas que reportan en el portal del Ministerio y anotan el
 * número después. Se enciende cuando el flujo esté rodado, con el patrón de
 * `KYC_ENFORCE` y `DOC_KILL_SWITCH_ENFORCE`, y `/health` lo publica.
 */
export function exigirRndcParaDespachar(): boolean {
  return process.env['RNDC_EXIGIR'] === 'true';
}
