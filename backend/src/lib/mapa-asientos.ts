/**
 * La distribución de sillas de un vehículo de pasajeros.
 *
 * POR QUÉ UNA PLANTILLA Y NO EL PLANO DE CADA BUS
 * -----------------------------------------------
 * Hay cientos de modelos de buseta y de bus circulando, y ninguna empresa va a
 * dibujar el suyo. Lo que sí es constante es la FORMA: filas de asientos, un
 * pasillo que las parte, y unos huecos donde van el conductor y la puerta. Con
 * tres plantillas —van, buseta, bus— se cubre lo que se mueve entre municipios
 * de Norte de Santander, y la empresa ajusta el número de filas a su vehículo.
 *
 * LA NUMERACIÓN ES LA QUE VE EL PASAJERO
 * --------------------------------------
 * Correlativa de adelante hacia atrás y de izquierda a derecha, como está
 * pintada en el tubo del asiento. Si la app numerara de otra forma, el
 * pasajero pediría la 5 y se sentaría en la que dice 7: la discusión sería a
 * bordo, con el bus andando, y contra el conductor.
 *
 * LO QUE NO SE MODELA, Y ES DELIBERADO
 * ------------------------------------
 * No hay clases (primera/segunda), ni sillas de distinta tarifa, ni reclinable
 * contra normal. Todas cuestan lo mismo, que es como opera hoy el
 * intermunicipal corto. Cuando haga falta, la tarifa por silla entra en la
 * plantilla; meterla ahora sería inventar un precio que nadie cobra.
 */

/** Los vehículos de pasajeros que pueden llevar una salida programada. */
export const TIPOS_CON_SILLAS = ['VAN', 'BUSETA', 'BUS'] as const;
export type TipoConSillas = (typeof TIPOS_CON_SILLAS)[number];

export function esTipoConSillas(v: unknown): v is TipoConSillas {
  return typeof v === 'string' && (TIPOS_CON_SILLAS as readonly string[]).includes(v);
}

/** Qué hay en una posición de la rejilla. */
export type Celda =
  | { tipo: 'silla'; numero: number }
  | { tipo: 'pasillo' }
  | { tipo: 'vacio' }
  | { tipo: 'conductor' }
  | { tipo: 'puerta' };

export interface Plantilla {
  tipo: TipoConSillas;
  etiqueta: string;
  /** Columnas de la rejilla, pasillo incluido. */
  columnas: number;
  /** Filas de arriba (frente del vehículo) abajo. */
  filas: Celda[][];
  /** Cuántas sillas de pasajero tiene en total. */
  sillas: number;
}

/**
 * Cómo se arma cada tipo.
 *
 * `patron` describe UNA fila de pasajeros con la letra de cada columna:
 *   'S' silla · '|' pasillo · '.' hueco
 *
 * Las medidas salen de lo que rueda: una van tipo Hiace lleva 3 por fila con
 * pasillo lateral; una buseta, 2+2 pero con la primera fila partida por la
 * puerta; un bus intermunicipal, 2+2 corridas.
 */
const MOLDES: Record<TipoConSillas, {
  etiqueta: string;
  patron: string;
  filasPorDefecto: number;
  /** La fila del frente, si es distinta (puerta, menos sillas). */
  frente?: string;
}> = {
  VAN: { etiqueta: 'Van', patron: 'SS|S', filasPorDefecto: 4, frente: 'S.|S' },
  BUSETA: { etiqueta: 'Buseta', patron: 'SS|SS', filasPorDefecto: 5, frente: '..|SS' },
  BUS: { etiqueta: 'Bus', patron: 'SS|SS', filasPorDefecto: 10, frente: '..|SS' },
};

/** Cuántas filas admite cada tipo. Fuera de esto no es ese vehículo. */
export const FILAS_MIN = 2;
export const FILAS_MAX = 15;

/**
 * Arma el mapa de sillas.
 *
 * `filas` es el número de filas de pasajeros que declara la empresa; sin él se
 * usa el de un vehículo típico de ese tipo.
 */
export function plantillaDe(tipo: TipoConSillas, filas?: number): Plantilla {
  const molde = MOLDES[tipo];
  const n = Math.min(FILAS_MAX, Math.max(FILAS_MIN, Math.trunc(filas ?? molde.filasPorDefecto)));

  const rejilla: Celda[][] = [];
  let numero = 0;

  // Fila del conductor: no se vende y se dibuja para que el pasajero sepa
  // hacia dónde mira el mapa. Sin ella, elegir «adelante» es una lotería.
  const cabina: Celda[] = [{ tipo: 'conductor' }];
  const anchoPatron = (molde.frente ?? molde.patron).length;
  while (cabina.length < anchoPatron - 1) cabina.push({ tipo: 'vacio' });
  cabina.push({ tipo: 'puerta' });
  rejilla.push(cabina);

  for (let f = 0; f < n; f++) {
    const patron = f === 0 && molde.frente ? molde.frente : molde.patron;
    rejilla.push(
      [...patron].map((c): Celda => {
        if (c === '|') return { tipo: 'pasillo' };
        if (c === '.') return { tipo: 'vacio' };
        numero += 1;
        return { tipo: 'silla', numero };
      }),
    );
  }

  return {
    tipo,
    etiqueta: molde.etiqueta,
    columnas: anchoPatron,
    filas: rejilla,
    sillas: numero,
  };
}

/** Los números de silla válidos de esa plantilla. */
export function sillasDe(tipo: TipoConSillas, filas?: number): number[] {
  const p = plantillaDe(tipo, filas);
  return p.filas
    .flat()
    .filter((c): c is { tipo: 'silla'; numero: number } => c.tipo === 'silla')
    .map((c) => c.numero);
}

export interface SeleccionSillas {
  tipo: TipoConSillas;
  filas?: number;
  /** Las que pide el pasajero. */
  pedidas: number[];
  /** Las que ya vendió esta salida. */
  ocupadas: number[];
}

/**
 * Motivo por el que NO se puede reservar esa selección, o `null` si sí.
 *
 * Devuelve el motivo y no un booleano: quien está comprando necesita saber si
 * la silla ya se vendió —para elegir otra— o si pidió una que no existe.
 *
 * ⚠ ESTO NO ES LA GARANTÍA CONTRA LA DOBLE VENTA. Entre esta comprobación y el
 * INSERT pasan milisegundos en los que otro puede llevarse la misma silla. Lo
 * que de verdad lo impide es el índice único (tripId, seatNumber) de
 * `seat_assignments`: aquí se valida para dar un mensaje claro, allí se
 * garantiza. Confiar solo en esta función sería el fallo clásico de reservas.
 */
export function motivoParaNoReservar(s: SeleccionSillas): string | null {
  if (s.pedidas.length === 0) return 'Elige al menos una silla.';

  const unicas = new Set(s.pedidas);
  if (unicas.size !== s.pedidas.length) return 'Hay una silla repetida en tu selección.';

  const validas = new Set(sillasDe(s.tipo, s.filas));
  const inexistente = s.pedidas.find((n) => !validas.has(n));
  if (inexistente !== undefined) {
    return `La silla ${inexistente} no existe en este vehículo.`;
  }

  const tomadas = new Set(s.ocupadas);
  const ocupada = s.pedidas.find((n) => tomadas.has(n));
  if (ocupada !== undefined) {
    return `La silla ${ocupada} ya está tomada. Elige otra.`;
  }

  return null;
}

/**
 * Cuántas sillas quedan libres.
 *
 * Se calcula, no se guarda: un contador y unas filas acaban discrepando y
 * nadie sabe cuál miente. Misma regla que el saldo de la cuenta de cobro.
 */
export function sillasLibres(tipo: TipoConSillas, ocupadas: number[], filas?: number): number {
  const validas = sillasDe(tipo, filas);
  const tomadas = new Set(ocupadas);
  return validas.filter((n) => !tomadas.has(n)).length;
}
