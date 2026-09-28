// ── Las cifras del tablero de reservas ───────────────────────────────────────
//
// POR QUÉ EXISTE. `admin.service` no mencionaba `SCHEDULED` en ninguna parte:
// no se sabía cuántas reservas se piden, cuántas se apartan, en cuánto tiempo
// ni cuántas se incumplen. Para una empresa de taxis esa es *la* cifra — si
// solo se aparta una de cada cinco, la función no está funcionando y hay que
// enterarse antes de que un pasajero se quede tirado a las seis de la mañana.
//
// Las reglas viven aquí y no en la consulta porque son donde una métrica
// miente sin que se note, y son las mismas que ya se pagaron una vez en
// `metricas-negocio`: **sin denominador no hay porcentaje** y **una muestra
// diminuta no da una tasa, da una fracción**.

import { porcentaje } from './metricas-negocio';

/**
 * Por debajo de esto no se publica un porcentaje.
 *
 * Un «100 % de reservas apartadas» sobre dos reservas no dice que el tablero
 * funcione; dice que hubo dos. Y un «0 % de incumplimiento» sobre una sola
 * felicita a quien todavía no ha tenido ocasión de fallar.
 */
export const MINIMO_PARA_TASA = 10;

export interface ConteosReserva {
  /** Reservas creadas en el período. */
  creadas: number;
  /** De esas, cuántas llegó a apartar algún conductor. */
  apartadas: number;
  /** Cuántas terminaron el viaje. */
  cumplidas: number;
  /** Cuántas se le quitaron a un conductor por no aparecer. */
  incumplidasSinSenal: number;
  /** Cuántas se le quitaron por documentos vencidos entre apartar y la hora. */
  incumplidasDocumentos: number;
  /** Cuántas se cancelaron (el pasajero, o el barrido de no aceptadas). */
  canceladas: number;
  /** Minutos que tardó en apartarse cada una de las que se apartaron. */
  minutosHastaApartar: number[];
}

export interface Tasa {
  /** Cuántos casos cumplen. */
  parte: number;
  /** Sobre cuántos. */
  total: number;
  /** El porcentaje, o null si no hay denominador o la muestra es diminuta. */
  pct: number | null;
  /** Falso ⇒ hay datos pero son demasiado pocos para leer un porcentaje. */
  fiable: boolean;
}

export interface MetricasReservas {
  creadas: number;
  apartadas: number;
  cumplidas: number;
  incumplidas: number;
  incumplidasSinSenal: number;
  incumplidasDocumentos: number;
  canceladas: number;
  /** Qué parte de lo que se pide encuentra conductor con antelación. */
  tasaApartado: Tasa;
  /** De las apartadas, cuántas acabaron con el pasajero en el carro. */
  tasaCumplimiento: Tasa;
  /** De las apartadas, cuántas se cayeron. Es la que duele. */
  tasaIncumplimiento: Tasa;
  /**
   * Mediana de minutos desde que se pide hasta que alguien la aparta.
   *
   * Mediana y no promedio: una sola reserva que nadie tocó en tres días
   * arrastra un promedio hasta dejarlo sin significado, y lo que se quiere
   * saber es cuánto tarda la reserva típica. Null si ninguna se apartó.
   */
  medianaMinutosHastaApartar: number | null;
}

/** La tasa, con su muestra a la vista para poder no creérsela. */
export function tasa(parte: number, total: number): Tasa {
  return {
    parte,
    total,
    // `porcentaje` ya devuelve null sin denominador. Aquí además se calla
    // cuando la muestra es diminuta: un número sin significado en un tablero
    // se lee igual que uno con significado.
    pct: total >= MINIMO_PARA_TASA ? porcentaje(parte, total) : null,
    fiable: total >= MINIMO_PARA_TASA,
  };
}

/** La mediana de una lista de minutos. Null si está vacía. */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  const v = orden.length % 2 === 1
    ? orden[medio]!
    : (orden[medio - 1]! + orden[medio]!) / 2;
  return Math.round(v);
}

export function armarMetricasReservas(c: ConteosReserva): MetricasReservas {
  const incumplidas = c.incumplidasSinSenal + c.incumplidasDocumentos;
  return {
    creadas: c.creadas,
    apartadas: c.apartadas,
    cumplidas: c.cumplidas,
    incumplidas,
    incumplidasSinSenal: c.incumplidasSinSenal,
    incumplidasDocumentos: c.incumplidasDocumentos,
    canceladas: c.canceladas,
    tasaApartado: tasa(c.apartadas, c.creadas),
    // El denominador es lo APARTADO y no lo creado: una reserva que nadie
    // tomó no la incumplió nadie, y meterla aquí repartiría la culpa de un
    // problema de oferta entre los conductores que sí aparecieron.
    tasaCumplimiento: tasa(c.cumplidas, c.apartadas),
    tasaIncumplimiento: tasa(incumplidas, c.apartadas),
    medianaMinutosHastaApartar: mediana(c.minutosHastaApartar),
  };
}
