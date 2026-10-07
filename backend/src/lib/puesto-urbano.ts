/**
 * El puesto de taxi urbano: una carrera de ciudad que se vende por sillas.
 *
 * QUÉ ES
 * ------
 * Los taxis de Pamplona ya lo hacen: en vez de quedarse quietos en el paradero
 * salen recogiendo persona por persona sobre un trayecto conocido —terminal,
 * universidad, el barrio de arriba— y cada uno paga un puesto. Al pasajero le
 * sale a $2.000 lo que en buseta cuesta $2.200, y al conductor le rinde más
 * que una carrera sola. Esto no inventa esa práctica: le pone una publicación,
 * una reserva y un precio que no se discute a bordo.
 *
 * POR QUÉ ES UNA SALIDA (`PooledTrip`) Y NO UN MODELO NUEVO
 * --------------------------------------------------------
 * Ya existe el motor de salidas con puestos: publicar, vender, contar lo que
 * queda, arrancar y cerrar. Construir un segundo modelo al lado fragmentó
 * antes la trazabilidad de la carga (`CargoTrip` junto a `FreightRequest`) y
 * eso está escrito en la bitácora. Aquí solo se distingue con `kind` y se le
 * cambia lo que de verdad es distinto: los extremos de un trayecto urbano son
 * dos PUNTOS de la misma ciudad, no dos municipios.
 *
 * LAS TRES REGLAS
 * ---------------
 * 1. **La misma ciudad.** Es la guarda que sostiene todo lo demás: el camino
 *    urbano se salta la ruta intermunicipal, el tope de gasto compartido y la
 *    exigencia de empresa habilitada del modelo dual. Sin esta comprobación,
 *    publicar «urbano» de Pamplona a Cúcuta sería la puerta de atrás para
 *    operar una troncal sin habilitación.
 *
 * 2. **Dos puestos como mínimo.** Un «puesto compartido» de una sola silla no
 *    es compartir: es una carrera entera a un precio que pone el conductor,
 *    esquivando la tarifa del decreto. Y máximo cuatro, que son las sillas de
 *    pasajero de un taxi; de ahí para arriba es transporte colectivo, que
 *    tiene su propio permiso y en el motor ya exige empresa habilitada.
 *
 * 3. **El precio NO lo pone nadie: lo pone la plataforma.** La carrera
 *    compartida vale una cifra fija (`tarifaDeCarrera()`, hoy $8.000) y el
 *    puesto es esa cifra repartida entre las sillas que se publican: con
 *    cuatro, $2.000 cada uno. Antes el conductor escribía el precio y había
 *    que ponerle un tope derivado del taxímetro; eso tenía dos problemas —el
 *    tope dependía de que Google resolviera la ruta (y si fallaba caía al piso
 *    en silencio, cambiando la regla sin avisar), y dos taxistas cobraban
 *    distinto por el mismo trayecto—. Con precio fijo no hay nada que topar:
 *    el pasajero sabe de antemano lo que paga y el conductor lo que recibe.
 *
 *    El tope (`topePorPuesto`) se conserva porque sigue describiendo una
 *    verdad útil —cuánto puede rendir un carro compartido frente a la carrera
 *    sola— y lo usan el ahorro que se le enseña al pasajero y la auditoría del
 *    precio sellado. Ya no es una puerta.
 */

/** Sillas de pasajero de un taxi. Menos de dos no es compartir. */
export const PUESTOS_MIN = 2;
export const PUESTOS_MAX = 4;

/**
 * Cuánto puede rendir el viaje lleno frente a la carrera sola.
 *
 * 1,5 no es un número redondo por casualidad: es lo que hace que valga la pena
 * ir recogiendo (con cuatro puestos el conductor gana un 50 % más que llevando
 * a uno solo) sin que el pasajero pague por su silla más de lo que le costaría
 * compartir el carro a partes iguales más un poco.
 */
export const FACTOR_TOPE = 1.5;

/** Lo que se le propone al conductor en el formulario. Puede bajarlo. */
export const FACTOR_SUGERIDO = 1.25;

/**
 * Lo que vale la carrera compartida COMPLETA, en pesos.
 *
 * Es un precio de plaza, igual que la tarifa del decreto: lo fija quien conoce
 * la ciudad, no una fórmula. Por eso se lee del entorno y no es una constante
 * compilada — subirlo el mes que viene no puede exigir un despliegue de código.
 *
 * Se lee en cada llamada a propósito: como constante de módulo quedaría
 * congelada con el entorno del arranque, y cambiar la variable en Render no
 * tendría efecto hasta reiniciar — eso ya pasó con los textos legales.
 */
export function tarifaDeCarrera(): number {
  const crudo = Number(process.env['PUESTO_URBANO_CARRERA_COP']);
  // Un valor inservible NO apaga el servicio ni lo deja en cero: se cae al
  // precio acordado. Un puesto a $0 se cobraría a $0 y nadie lo notaría hasta
  // cerrar el mes.
  if (!Number.isFinite(crudo) || crudo < 1000) return 8000;
  return Math.round(crudo);
}

/**
 * Lo que se queda la plataforma de lo recaudado.
 *
 * Es TASA y no una cifra fija de $2.000 por una razón concreta: con el carro
 * lleno las dos cosas dan igual ($2.000 de $8.000), pero si solo suben dos
 * pasajeros se recaudan $4.000 — y $2.000 fijos serían la mitad de lo
 * recaudado en vez de su cuarta parte. El conductor se llevaría lo mismo que
 * la app por manejar.
 *
 * NO pasa por la precedencia flota → ciudad → global, al contrario que el
 * resto de los servicios. Aquí el precio TAMBIÉN lo fija la plataforma, así
 * que una flota con otra tasa rompería el reparto exacto que se le prometió al
 * conductor ($6.000 de $8.000). Donde el precio es nuestro, la comisión
 * también.
 */
export const COMISION_PUESTO_URBANO = 0.25;

/** El efectivo no tiene monedas de $7. */
function aMultiploDe50Abajo(v: number): number {
  return Math.floor(v / 50) * 50;
}

function esPositivo(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Lo máximo que puede costar un puesto, dada la carrera sola y cuántas sillas
 * se venden. Cero si no hay con qué calcularlo — el que llama lo rechaza en vez
 * de dejar pasar una tarifa sin techo.
 */
export function topePorPuesto(tarifaSolo: number, puestos: number): number {
  if (!esPositivo(tarifaSolo) || !Number.isInteger(puestos) || puestos < 1) return 0;
  return Math.max(0, aMultiploDe50Abajo((tarifaSolo * FACTOR_TOPE) / puestos));
}

/** Lo que el formulario propone. Nunca por encima del tope. */
export function sugeridoPorPuesto(tarifaSolo: number, puestos: number): number {
  if (!esPositivo(tarifaSolo) || !Number.isInteger(puestos) || puestos < 1) return 0;
  const sugerido = aMultiploDe50Abajo((tarifaSolo * FACTOR_SUGERIDO) / puestos);
  return Math.min(sugerido, topePorPuesto(tarifaSolo, puestos));
}

/**
 * Lo que cuesta UN puesto: la carrera repartida entre las sillas publicadas.
 *
 * Redondea HACIA ABAJO al múltiplo de 50, en esa dirección a propósito: así lo
 * recaudado nunca pasa de la carrera anunciada. Con tres puestos sale $2.650
 * cada uno ($7.950 en total) en vez de $2.700 ($8.100) — cobrarle a la gente
 * cien pesos más de lo publicado, aunque sea por el redondeo, es la clase de
 * detalle por el que se discute a bordo, que es justo lo que esto viene a
 * evitar. Y el efectivo no tiene monedas de $7.
 */
export function precioDelPuesto(puestos: number): number {
  if (!Number.isInteger(puestos) || puestos < 1) return 0;
  return aMultiploDe50Abajo(tarifaDeCarrera() / puestos);
}

/**
 * Cómo se reparte lo que de verdad se recaudó.
 *
 * Se calcula sobre lo COBRADO y no sobre la carrera completa: si el carro no se
 * llena, la app se lleva su cuarta parte de lo que entró, no su cuarta parte de
 * lo que habría entrado.
 */
export function repartoDeCarrera(recaudado: number): { neto: number; comision: number } {
  if (!esPositivo(recaudado)) return { neto: 0, comision: 0 };
  const bruto = Math.round(recaudado);
  const comision = Math.round(bruto * COMISION_PUESTO_URBANO);
  return { neto: bruto - comision, comision };
}

export interface PublicacionDePuesto {
  /** Slug del municipio de donde sale. */
  ciudadOrigen: string;
  /** Slug del municipio a donde llega. Tiene que ser el mismo. */
  ciudadDestino: string;
  /** Cómo se llama el punto de salida («Terminal de transportes»). */
  origenTexto: string;
  destinoTexto: string;
  puestos: number;
}

/**
 * Por qué NO se puede publicar esta salida por puestos, o `null` si sí.
 *
 * Devuelve el motivo y no un booleano: el conductor está con el carro
 * encendido y «no se pudo publicar» no le dice qué corregir.
 */
export function motivoParaNoPublicarPuesto(p: PublicacionDePuesto): string | null {
  const origen = (p.ciudadOrigen ?? '').trim().toLowerCase();
  const destino = (p.ciudadDestino ?? '').trim().toLowerCase();

  if (!origen || !destino) return 'Falta la ciudad de la ruta';
  if (origen !== destino) {
    return 'Un viaje por puestos urbano es dentro de la misma ciudad. Para viajar a otro municipio, publica una salida intermunicipal.';
  }

  if (!p.origenTexto?.trim()) return 'Escribe de dónde sale';
  if (!p.destinoTexto?.trim()) return 'Escribe a dónde llega';
  if (p.origenTexto.trim().toLowerCase() === p.destinoTexto.trim().toLowerCase()) {
    return 'El punto de salida y el de llegada no pueden ser el mismo';
  }

  if (!Number.isInteger(p.puestos) || p.puestos < PUESTOS_MIN) {
    return `Un viaje por puestos se comparte: publica al menos ${PUESTOS_MIN} puestos. Para llevar a una sola persona, toma una carrera normal.`;
  }
  if (p.puestos > PUESTOS_MAX) {
    return `Un taxi lleva máximo ${PUESTOS_MAX} pasajeros. Para más puestos hace falta una empresa de transporte habilitada.`;
  }

  // El precio ya no se comprueba porque ya no se recibe: lo pone
  // `precioDelPuesto`. Ver la regla 3 de la cabecera.
  return null;
}

/**
 * Cuánto se ahorra el pasajero frente a tomar el taxi solo. Cero si no hay
 * ahorro: no se enseña un ahorro negativo como si fuera un descuento.
 */
export function ahorroDelPasajero(tarifaSolo: number, tarifaPorPuesto: number): number {
  if (!esPositivo(tarifaSolo) || !esPositivo(tarifaPorPuesto)) return 0;
  return Math.max(0, Math.round(tarifaSolo - tarifaPorPuesto));
}
