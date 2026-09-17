/**
 * A qué otras ciudades despacha un comercio, a qué precio y en cuánto tiempo.
 *
 * El modelo que esto habilita: las empresas intermunicipales de pasajeros
 * —Brasilia, Copetran y compañía— ya salen todos los días y ya tienen taquilla
 * en cada terminal. Un comercio de Cúcuta que vende al por mayor puede mandar
 * su mercancía en esos buses y el cliente de Bucaramanga la tiene al día
 * siguiente. Aquí vive lo único que el comercio tiene que declarar para que eso
 * sea posible: sus destinos.
 *
 * POR QUÉ ES UNA LISTA DEL COMERCIO Y NO UNA TARIFA NUESTRA
 * ---------------------------------------------------------
 * Quien sabe cuánto cuesta mandar una caja de Cúcuta a Bucaramanga es el que la
 * manda todas las semanas, no nosotros. Además cada comercio negocia distinto
 * con la transportadora. Una tarifa central estaría mal para todos.
 *
 * LA REGLA QUE SOSTIENE TODO: SIN DESTINO DECLARADO, NO HAY ENVÍO
 * ---------------------------------------------------------------
 * La lista vacía —que es como nacen todos los comercios ya registrados— no
 * significa «a todas», significa «a ninguna». Lo contrario habría abierto de
 * golpe el catálogo de Pamplona a todo el país el día del despliegue, con
 * restaurantes ofreciendo almuerzos a Bogotá.
 */

import { saneaCorte } from './corte-bodega';

/** Un destino declarado por el comercio. */
export interface DestinoEnvio {
  /** Slug del municipio, tal como lo guarda `municipalities`. */
  city: string;
  /** Lo que el comercio cobra por llevar hasta allá, en pesos enteros. */
  fee: number;
  /** Horas que promete. 24 = «al día siguiente». */
  etaHours: number;
  /**
   * Hasta qué hora se recibe para que salga HOY, «HH:MM» en hora de Colombia.
   *
   * Va por destino y no por comercio porque el bus a Bogotá no sale a la misma
   * hora que el de Bucaramanga. Es opcional: sin corte, el plazo se cuenta
   * desde el momento del pedido, que es como funcionaba antes.
   */
  cutoff?: string;
}

/**
 * Tope de cordura del precio de envío, NO un límite de negocio.
 *
 * Un cero de más convierte 15.000 en 150.000 y el comercio se entera cuando un
 * cliente le reclama. Está alto a propósito para no estorbar a quien manda
 * bultos grandes; si algún día alguien despacha algo que de verdad cuesta más
 * que esto, se sube aquí y se deja escrito por qué.
 */
export const TOPE_ENVIO_COP = 1_000_000;

/** Una semana. Más que eso no es «de un día para otro», es otra cosa. */
export const TOPE_ETA_HORAS = 168;

/**
 * Cuántos destinos puede declarar un comercio.
 *
 * No hay razón técnica para el número: es el punto donde una lista deja de
 * poder revisarse a ojo, que es como el dueño va a revisarla.
 */
export const MAX_DESTINOS = 30;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Valida y normaliza lo que el comercio declara en su portal.
 *
 * Es ESTRICTA y lanza con el motivo concreto: esto se guarda una vez y se cobra
 * muchas, así que un destino mal escrito tiene que caerse delante del dueño y no
 * convertirse en un precio raro tres semanas después.
 *
 * `ciudadOrigen` es la plaza del propio comercio. Se pide para poder rechazar el
 * caso que más caro sale: declararse a sí mismo como destino. Eso le cobraría
 * flete intermunicipal a un cliente de la misma cuadra.
 */
export function saneaDestinos(
  valor: unknown,
  ciudadOrigen: string | null,
): DestinoEnvio[] {
  if (valor == null) return [];
  if (!Array.isArray(valor)) {
    throw new Error('Los destinos de envío deben venir como una lista.');
  }
  if (valor.length > MAX_DESTINOS) {
    throw new Error(
      `Puedes declarar hasta ${MAX_DESTINOS} destinos; enviaste ${valor.length}.`,
    );
  }

  const origen = texto(ciudadOrigen);
  const vistos = new Set<string>();
  const salida: DestinoEnvio[] = [];

  for (const crudo of valor) {
    if (crudo == null || typeof crudo !== 'object') {
      throw new Error('Cada destino debe tener ciudad, precio y tiempo.');
    }
    const d = crudo as Record<string, unknown>;
    const city = texto(d.city);

    if (!city) throw new Error('Hay un destino sin ciudad.');
    if (!SLUG.test(city)) {
      throw new Error(`«${city}» no es un municipio válido.`);
    }
    if (origen && city === origen) {
      // Es el error que más caro sale y el más fácil de cometer: el dueño ve
      // su ciudad en la lista de municipios y la marca «por si acaso».
      throw new Error(
        'No puedes declarar tu propia ciudad como destino de envío: ' +
          'ahí los pedidos son entregas normales.',
      );
    }
    if (vistos.has(city)) {
      // Dos precios para la misma ciudad y nadie sabe cuál quiso. Elegir uno
      // en silencio es cobrar un precio que el dueño no revisó.
      throw new Error(`«${city}» está repetida en la lista.`);
    }

    const fee = numero(d.fee);
    if (fee == null || fee <= 0) {
      throw new Error(`El precio de envío a «${city}» debe ser mayor a cero.`);
    }
    if (fee > TOPE_ENVIO_COP) {
      throw new Error(
        `El precio de envío a «${city}» (${Math.round(fee)}) supera el máximo ` +
          `de ${TOPE_ENVIO_COP}. Revisa que no sobre un cero.`,
      );
    }

    const etaHours = numero(d.etaHours);
    if (etaHours == null || etaHours < 1) {
      throw new Error(`El tiempo de entrega a «${city}» debe ser de al menos 1 hora.`);
    }
    if (etaHours > TOPE_ETA_HORAS) {
      throw new Error(
        `El tiempo de entrega a «${city}» no puede pasar de ${TOPE_ETA_HORAS} horas.`,
      );
    }

    // El corte es opcional, pero si se escribe algo tiene que ser una hora:
    // guardar «4pm» como si nada dejaría al comercio creyendo que declaró un
    // corte que no existe, y los clientes viendo plazos de otro día.
    let cutoff: string | undefined;
    if (d.cutoff != null && String(d.cutoff).trim() !== '') {
      const c = saneaCorte(d.cutoff);
      if (!c) {
        throw new Error(
          `La hora de corte de «${city}» debe ir como HH:MM (por ejemplo 16:00).`,
        );
      }
      cutoff = c;
    }

    vistos.add(city);
    salida.push({
      city,
      // A peso entero: el efectivo no tiene centavos y un precio con decimales
      // deja saldos fantasma en la conciliación.
      fee: Math.round(fee),
      etaHours: Math.round(etaHours),
      ...(cutoff ? { cutoff } : {}),
    });
  }

  return salida;
}

/**
 * Lee lo guardado en la base, TOLERANTE.
 *
 * La asimetría con `saneaDestinos` es deliberada y es el mismo patrón que
 * `sanitizeStops`/`stopsFromDb`: al guardar se rechaza y se explica, al leer se
 * descarta lo que no se entienda. Una fila corrupta no puede tumbar la vitrina
 * entera de un comercio.
 */
export function destinosDesdeBD(valor: unknown): DestinoEnvio[] {
  if (!Array.isArray(valor)) return [];
  const salida: DestinoEnvio[] = [];
  const vistos = new Set<string>();
  for (const crudo of valor) {
    if (crudo == null || typeof crudo !== 'object') continue;
    const d = crudo as Record<string, unknown>;
    const city = texto(d.city);
    const fee = numero(d.fee);
    const etaHours = numero(d.etaHours);
    if (!city || vistos.has(city)) continue;
    if (fee == null || fee <= 0) continue;
    if (etaHours == null || etaHours < 1) continue;
    vistos.add(city);
    const cutoff = saneaCorte(d.cutoff);
    salida.push({
      city,
      fee: Math.round(fee),
      etaHours: Math.round(etaHours),
      ...(cutoff ? { cutoff } : {}),
    });
  }
  return salida;
}

/**
 * El destino declarado para esa ciudad, o null si el comercio no despacha allá.
 *
 * Sin ciudad de destino devuelve null, y eso es lo correcto: cuando no se supo
 * a qué plaza cae la dirección de entrega, el pedido se trata como local. **Un
 * dato que falta no puede convertir un pedido en intermunicipal y cobrarle un
 * flete de más al cliente.**
 */
export function destinoPara(
  destinos: DestinoEnvio[],
  citySlug: string | null | undefined,
): DestinoEnvio | null {
  const c = texto(citySlug);
  if (!c) return null;
  return destinos.find((d) => d.city === c) ?? null;
}

/**
 * Si un pedido cruza de una plaza a otra.
 *
 * Con cualquiera de las dos sin resolver devuelve false: lo desconocido se
 * trata como local, que es exactamente el comportamiento que había antes de
 * que estas columnas existieran.
 */
export function esEnvioAOtraCiudad(
  origen: string | null | undefined,
  destino: string | null | undefined,
): boolean {
  const o = texto(origen);
  const d = texto(destino);
  return !!o && !!d && o !== d;
}
