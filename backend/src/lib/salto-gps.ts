// ── ¿Este salto de GPS es imposible? ─────────────────────────────────────────
//
// La regla vive aquí, suelta y probada, porque acusa a una persona. Un
// conductor marcado como sospechoso acaba en la cola del admin, y si el
// contador miente, la revisión se hace sobre alguien que no hizo nada.
//
// EL FALLO QUE MOTIVA ESTE ARCHIVO
//
// El detector medía la velocidad con el reloj del SERVIDOR entre dos
// ESCRITURAS: `Date.now() - lastSeenAt`. Eso no es el tiempo que el conductor
// tardó en recorrer la distancia — es el tiempo que tardaron en llegar y
// procesarse dos mensajes. Con la red de por medio son cosas distintas.
//
// Y la diferencia importa porque en carretera la distancia entre latidos pasa
// de largo el umbral de 120 m: a 120 km/h son 133 m cada 4 segundos. Con la
// distancia ya por encima del mínimo, lo único que separa a un conductor
// honesto de una marca de fraude es que el hueco medido sea real. Si un
// mensaje se retrasa y el siguiente entra pegado, 200 m con 0,3 s medidos dan
// 2.400 km/h y el conductor queda marcado por conducir por la vía a Cúcuta.
//
// La corrección: la app manda CUÁNDO tomó la lectura, y el tiempo se mide
// entre lecturas. El reloj del servidor queda de respaldo para las apps que
// todavía no mandan la marca de tiempo.

/** Por encima de esto, entre dos lecturas reales, no hay vehículo: hay GPS falso. */
export const VELOCIDAD_MAX_KMH = Number(process.env['FRAUD_MAX_SPEED_KMH'] ?? 200);

/** Por debajo de esto no se evalúa: es el ruido del GPS en reposo. */
export const MOVIMIENTO_MIN_M = 120;

/**
 * Un hueco entre lecturas por debajo de esto no se cree.
 *
 * Dos fixes del mismo segundo no miden una velocidad: miden el redondeo del
 * reloj. Sin este piso, cualquier par de lecturas juntas da una cifra enorme
 * y marca al conductor.
 */
export const HUECO_MIN_CREIBLE_S = 1;

/**
 * Una marca de tiempo más vieja que esto no se usa: el teléfono la tenía en
 * cola, o su reloj está mal. Se cae al reloj del servidor.
 */
export const FIX_MAX_ANTIGUEDAD_S = 300;

export interface Fix {
  lat: number;
  lng: number;
  /** Milisegundos de cuando el TELÉFONO tomó la lectura. Null si no la manda. */
  tomadoEn: number | null;
}

/**
 * Segundos transcurridos entre dos lecturas.
 *
 * Usa las marcas de tiempo del teléfono cuando son creíbles, porque es lo
 * único que mide de verdad cuánto tardó el conductor en recorrer la distancia.
 * Devuelve `null` cuando no se puede saber, y entonces NO se evalúa nada: es
 * preferible dejar pasar un salto que marcar a alguien con una cuenta que no
 * se sostiene.
 */
export function segundosEntreLecturas(
  anterior: Fix,
  nueva: Fix,
  ahoraMs: number,
  segundosDeRespaldo: number,
): number | null {
  const a = anterior.tomadoEn;
  const b = nueva.tomadoEn;

  const creibles =
    a != null &&
    b != null &&
    // Ni del futuro ni rancias: un reloj adelantado o una lectura que estuvo
    // en cola media hora no miden nada útil.
    b <= ahoraMs + 60_000 &&
    ahoraMs - b <= FIX_MAX_ANTIGUEDAD_S * 1000 &&
    b > a;

  const segundos = creibles ? (b - a) / 1000 : segundosDeRespaldo;
  if (!Number.isFinite(segundos) || segundos < HUECO_MIN_CREIBLE_S) return null;
  return segundos;
}

/** km/h implícitos. Solo tiene sentido con segundos > 0. */
export function velocidadKmh(metros: number, segundos: number): number {
  return metros / 1000 / (segundos / 3600);
}

/**
 * ¿Hay que marcar este salto?
 *
 * Dos condiciones, y las dos hacen falta: que se haya movido de verdad (por
 * encima del ruido) y que la velocidad sea imposible.
 */
export function esSaltoImposible(metros: number, segundos: number | null): boolean {
  if (segundos == null || segundos <= 0) return false;
  if (metros < MOVIMIENTO_MIN_M) return false;
  return velocidadKmh(metros, segundos) > VELOCIDAD_MAX_KMH;
}
