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
const MOLDES: Record<TipoConSillas, ConfigSillas & { etiqueta: string }> = {
  VAN: { etiqueta: 'Van', izquierda: 2, derecha: 1, filas: 4, frenteIzquierda: 1 },
  BUSETA: { etiqueta: 'Buseta', izquierda: 2, derecha: 2, filas: 5, frenteIzquierda: 0 },
  BUS: { etiqueta: 'Bus', izquierda: 2, derecha: 2, filas: 10, frenteIzquierda: 0 },
};

/** Cuántas filas admite cada tipo. Fuera de esto no es ese vehículo. */
export const FILAS_MIN = 2;
export const FILAS_MAX = 15;

/** Sillas a un lado del pasillo. Más de tres no es un vehículo de carretera. */
export const LADO_MIN = 0;
export const LADO_MAX = 3;

/**
 * Cómo está distribuido el vehículo de ESTA empresa.
 *
 * POR QUÉ ESTO NO PODÍA SEGUIR SIENDO TRES MOLDES FIJOS
 * -----------------------------------------------------
 * Con un patrón cerrado por tipo, la capacidad solo podía saltar de cuatro en
 * cuatro: una buseta daba 6, 10, 14, 18, 22… y un bus lo mismo. Medido sobre
 * el código anterior, eso dejaba FUERA las capacidades más comunes del
 * transporte colombiano — una buseta de 19 o 20 puestos y un bus de 40 o 44 no
 * se podían publicar. La empresa tenía que declarar el número de al lado, y
 * entonces o vendía sillas que no existen o dejaba dos sin vender. Las dos
 * cosas se arreglan discutiendo en la terminal.
 *
 * Las cuatro perillas de aquí abajo salen de mirar lo que rueda: lo que varía
 * entre una van Hiace, una buseta de escalera y un bus intermunicipal es de
 * cuántas sillas va cada lado del pasillo, cuántas filas hay, si la fila del
 * fondo va corrida de lado a lado —que es lo que convierte un 2+2 de diez
 * filas en 41 o 42 en vez de 40— y si hay baño.
 */
export interface ConfigSillas {
  /** Sillas a la izquierda del pasillo. */
  izquierda: number;
  /** Sillas a la derecha del pasillo. */
  derecha: number;
  /** Filas de pasajeros, contando la del frente. */
  filas: number;
  /**
   * Sillas a la izquierda en la PRIMERA fila, donde suele ir la puerta. Sin
   * declarar, la primera fila es como las demás.
   */
  frenteIzquierda?: number;
  /** Lo mismo a la derecha. */
  frenteDerecha?: number;
  /**
   * Sillas de la última fila, corridas de lado a lado sin pasillo. Casi todos
   * los buses la llevan, y es de donde salen los números impares.
   */
  fondoCorrido?: number;
  /**
   * De qué lado va el baño, en la última fila normal. Ocupa el sitio de una
   * silla y no se vende.
   *
   * Viaja al DTO como hueco (`vacio`) y no como un tipo nuevo: las apps ya
   * instaladas saben ignorar un hueco, y una celda que no conocen la pintarían
   * como silla — una silla sin número en mitad del mapa. El icono del baño es
   * cosmética y puede esperar a que la app se actualice; vender una silla que
   * es un inodoro, no.
   */
  bano?: 'izquierda' | 'derecha';
}

function acotar(v: number | undefined, min: number, max: number, pordefecto: number): number {
  const n = Math.trunc(v ?? pordefecto);
  if (!Number.isFinite(n)) return pordefecto;
  return Math.min(max, Math.max(min, n));
}

/** La configuración típica de ese tipo de vehículo, para partir de algo. */
export function configPorDefecto(tipo: TipoConSillas): ConfigSillas {
  const { etiqueta: _e, ...config } = MOLDES[tipo];
  return { ...config };
}

/**
 * Arma el mapa de sillas a partir de la configuración declarada.
 *
 * La numeración sigue siendo correlativa de adelante hacia atrás y de
 * izquierda a derecha, que es como está pintada en el tubo del asiento.
 */
export function plantillaDeConfig(tipo: TipoConSillas, config: ConfigSillas): Plantilla {
  const izq = acotar(config.izquierda, LADO_MIN, LADO_MAX, 2);
  const der = acotar(config.derecha, LADO_MIN, LADO_MAX, 2);
  const n = acotar(config.filas, FILAS_MIN, FILAS_MAX, 5);
  const frenteIzq = acotar(config.frenteIzquierda, LADO_MIN, izq, izq);
  const frenteDer = acotar(config.frenteDerecha, LADO_MIN, der, der);
  const fondo = acotar(config.fondoCorrido, 0, izq + der + 1, 0);

  // El ancho lo manda la fila más ancha: si el fondo corrido lleva una silla
  // más que las demás (el clásico 2+1+2 del fondo), las otras filas se
  // completan con huecos para que la rejilla siga siendo rectangular. Una
  // rejilla dentada la app la pinta torcida.
  const anchoNormal = izq + 1 + der;
  const ancho = Math.max(anchoNormal, fondo);

  const rejilla: Celda[][] = [];
  let numero = 0;

  const rellenar = (fila: Celda[]): Celda[] => {
    while (fila.length < ancho) fila.push({ tipo: 'vacio' });
    return fila;
  };

  // Fila del conductor: no se vende y se dibuja para que el pasajero sepa
  // hacia dónde mira el mapa. Sin ella, elegir «adelante» es una lotería.
  const cabina: Celda[] = [{ tipo: 'conductor' }];
  while (cabina.length < ancho - 1) cabina.push({ tipo: 'vacio' });
  cabina.push({ tipo: 'puerta' });
  rejilla.push(cabina);

  const filasNormales = fondo > 0 ? n - 1 : n;
  // La última fila normal es la que pierde una silla por el baño.
  const filaDelBano = config.bano ? filasNormales - 1 : -1;

  for (let f = 0; f < filasNormales; f++) {
    const fila: Celda[] = [];
    const nIzq = f === 0 ? frenteIzq : izq;
    const nDer = f === 0 ? frenteDer : der;

    const lado = (cuantas: number, cuantasLlenas: number, esLadoDelBano: boolean) => {
      for (let i = 0; i < cuantas; i++) {
        // El baño se lleva la silla de la ventana, que es donde va el cubículo.
        const esBano = esLadoDelBano && f === filaDelBano && i === cuantas - 1;
        if (esBano || i >= cuantasLlenas) {
          fila.push({ tipo: 'vacio' });
        } else {
          numero += 1;
          fila.push({ tipo: 'silla', numero });
        }
      }
    };

    lado(izq, nIzq, config.bano === 'izquierda');
    fila.push({ tipo: 'pasillo' });
    lado(der, nDer, config.bano === 'derecha');
    rejilla.push(rellenar(fila));
  }

  if (fondo > 0) {
    const fila: Celda[] = [];
    for (let i = 0; i < fondo; i++) {
      numero += 1;
      fila.push({ tipo: 'silla', numero });
    }
    rejilla.push(rellenar(fila));
  }

  return {
    tipo,
    etiqueta: MOLDES[tipo].etiqueta,
    columnas: ancho,
    filas: rejilla,
    sillas: numero,
  };
}

/**
 * Arma el mapa de sillas.
 *
 * `filas` es el número de filas de pasajeros que declara la empresa; sin él se
 * usa el de un vehículo típico de ese tipo. Se conserva porque las salidas ya
 * publicadas se guardaron así, y cambiarles el mapa a mitad de venta dejaría a
 * quien ya compró sin saber dónde se sienta.
 */
export function plantillaDe(tipo: TipoConSillas, filas?: number): Plantilla {
  const base = configPorDefecto(tipo);
  return plantillaDeConfig(tipo, { ...base, filas: filas ?? base.filas });
}

/**
 * La plantilla que corresponde a una salida: su configuración si la declaró,
 * y si no el molde del tipo.
 *
 * Existe para que haya UN SOLO SITIO donde se decide cuál usar. El mapa que se
 * dibuja y la validación de la reserva tienen que salir de aquí los dos: si el
 * mapa se pintara con la configuración de la empresa y la reserva se validara
 * contra el molde, el pasajero tocaría la silla 40 de su bus de 40 y el
 * servidor le diría que no existe — o peor al revés, y se venderían dos veces.
 */
export function plantillaPara(
  tipo: TipoConSillas,
  filas?: number | null,
  config?: ConfigSillas | null,
): Plantilla {
  if (config) return plantillaDeConfig(tipo, config);
  return plantillaDe(tipo, filas ?? undefined);
}

/**
 * Deja utilizable lo que llega de fuera, o `null` si no es una configuración.
 *
 * El portal manda esto por API, así que no se puede confiar en su forma. Se
 * acotan los valores en vez de rechazarlos —`plantillaDeConfig` ya lo hace—
 * pero un objeto sin los tres campos que de verdad hacen falta no es una
 * configuración: devolverlo a medias dibujaría un vehículo que no es el suyo.
 */
export function saneaConfigSillas(v: unknown): ConfigSillas | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;

  const num = (k: string): number | undefined =>
    typeof o[k] === 'number' && Number.isFinite(o[k]) ? Math.trunc(o[k] as number) : undefined;

  const izquierda = num('izquierda');
  const derecha = num('derecha');
  const filas = num('filas');
  if (izquierda === undefined || derecha === undefined || filas === undefined) return null;
  // Un vehículo sin sillas a ningún lado no es un vehículo.
  if (izquierda + derecha < 1) return null;

  const bano = o['bano'] === 'izquierda' || o['bano'] === 'derecha' ? o['bano'] : undefined;

  return {
    izquierda, derecha, filas,
    ...(num('frenteIzquierda') !== undefined && { frenteIzquierda: num('frenteIzquierda') }),
    ...(num('frenteDerecha') !== undefined && { frenteDerecha: num('frenteDerecha') }),
    ...(num('fondoCorrido') !== undefined && { fondoCorrido: num('fondoCorrido') }),
    ...(bano !== undefined && { bano }),
  };
}

/**
 * Cuántas sillas tiene esa configuración.
 *
 * Se arma la plantilla y se cuentan, en vez de hacer la aritmética aparte: dos
 * fórmulas para el mismo número acaban discrepando, y la que miente sería
 * justo la que el portal le enseña a la empresa antes de publicar.
 */
export function capacidadDe(tipo: TipoConSillas, config: ConfigSillas): number {
  return plantillaDeConfig(tipo, config).sillas;
}

/**
 * Qué disposiciones dan EXACTAMENTE esa capacidad.
 *
 * Es lo que hace usable el formulario: la empresa sabe que su bus tiene 40
 * puestos, no de cuántas filas de 2+2 se compone. Se le ofrecen las que
 * cuadran y elige la que se parece a su vehículo, en vez de tantear el número
 * de filas hasta que salga.
 *
 * Devuelve las más parecidas a un vehículo real primero: pasillo centrado y
 * pocas irregularidades.
 */
export function configuracionesPara(tipo: TipoConSillas, objetivo: number): ConfigSillas[] {
  if (!Number.isFinite(objetivo) || objetivo < 1) return [];

  const tipico = configPorDefecto(tipo);
  const salidas: Array<{ config: ConfigSillas; rareza: number }> = [];

  for (let izq = 1; izq <= LADO_MAX; izq++) {
    for (let der = 1; der <= LADO_MAX; der++) {
      for (let filas = FILAS_MIN; filas <= FILAS_MAX; filas++) {
        for (const fondo of [0, izq + der, izq + der + 1]) {
          for (const frenteIzq of new Set([izq, 0, 1])) {
            if (frenteIzq > izq) continue;
            const config: ConfigSillas = {
              izquierda: izq, derecha: der, filas,
              ...(frenteIzq !== izq && { frenteIzquierda: frenteIzq }),
              ...(fondo > 0 && { fondoCorrido: fondo }),
            };
            if (capacidadDe(tipo, config) !== objetivo) continue;

            // Menor es mejor. Se puntúa contra el vehículo TÍPICO de ese tipo
            // y no contra una idea abstracta de simetría: con eso último, a
            // una buseta de 26 se le ofrecía «1+1 con 13 filas» —que da 26 y
            // no existe en ninguna carretera— antes que su 2+2 de siempre.
            const rareza =
              Math.abs(izq - tipico.izquierda) * 4 +
              Math.abs(der - tipico.derecha) * 4 +
              Math.abs(filas - tipico.filas) +
              (frenteIzq !== izq ? 2 : 0) +  // frente recortado
              (fondo > 0 ? 0 : 1);           // casi todos llevan fondo corrido
            salidas.push({ config, rareza });
          }
        }
      }
    }
  }

  return salidas
    .sort((a, b) => a.rareza - b.rareza || a.config.filas - b.config.filas)
    .slice(0, 6)
    .map((s) => s.config);
}

/** Los números de silla válidos de esa plantilla. */
export function sillasDe(
  tipo: TipoConSillas,
  filas?: number | null,
  config?: ConfigSillas | null,
): number[] {
  const p = plantillaPara(tipo, filas, config);
  return p.filas
    .flat()
    .filter((c): c is { tipo: 'silla'; numero: number } => c.tipo === 'silla')
    .map((c) => c.numero);
}

export interface SeleccionSillas {
  tipo: TipoConSillas;
  filas?: number | null;
  /** La distribución declarada por la empresa, si la salida la tiene. */
  config?: ConfigSillas | null;
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

  const validas = new Set(sillasDe(s.tipo, s.filas, s.config));
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
export function sillasLibres(
  tipo: TipoConSillas,
  ocupadas: number[],
  filas?: number | null,
  config?: ConfigSillas | null,
): number {
  const validas = sillasDe(tipo, filas, config);
  const tomadas = new Set(ocupadas);
  return validas.filter((n) => !tomadas.has(n)).length;
}
