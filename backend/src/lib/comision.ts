/**
 * Qué comisión cobra la plataforma, y de dónde sale.
 *
 * Hasta ahora era una constante: `COMMISSION_RATE = 0.15` para todos, en todas
 * partes. Eso hace imposible la conversación comercial que sostiene el negocio
 * B2B —una flota grande negocia su porcentaje, y una ciudad nueva se abre con
 * una comisión de entrada más baja que la de la plaza consolidada— porque
 * cambiarla obligaba a desplegar y movía a TODO el mundo a la vez.
 *
 * Precedencia: **flota → ciudad → global**. La flota manda porque es con quien
 * se firma; la ciudad es el valor por defecto de la plaza; la global es la red
 * de seguridad.
 *
 * La tasa se resuelve al LIQUIDAR y el resultado se guarda en el servicio
 * (`commission`, `netEarning`). Renegociar mañana no puede cambiar lo que se
 * pagó ayer, y por eso nada de esto vuelve a leerse para la historia.
 */
import { COMMISSION_RATE } from '../config/constants';

/** La de siempre, cuando nadie definió una propia. */
export const COMISION_GLOBAL = COMMISSION_RATE;

/**
 * Techo de lo que se puede configurar.
 *
 * No es una opinión sobre cuánto es justo cobrar: es una barrera contra el
 * dedo. Quien escribe «15» queriendo decir «15 %» estaría fijando un 1500 % y
 * dejando al conductor debiendo dinero por trabajar. Con el tope, ese valor se
 * rechaza al guardarlo y nunca llega a una liquidación.
 */
export const COMISION_MAXIMA = 0.4;

/** De dónde salió la tasa que se aplicó. Va en la respuesta para poder auditar. */
export type OrigenComision = 'flota' | 'ciudad' | 'global';

export interface ComisionResuelta {
  tasa: number;
  origen: OrigenComision;
}

/**
 * ¿Es un porcentaje que se puede cobrar? Cero es válido —una plaza en
 * lanzamiento puede no cobrar nada— pero negativo o por encima del tope, no.
 */
export function tasaValida(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= COMISION_MAXIMA;
}

/**
 * Normaliza lo que llega de fuera antes de guardarlo.
 *
 * Acepta la fracción (`0.12`) y también el porcentaje humano (`12`), porque en
 * un formulario la gente escribe lo segundo. Devuelve `null` para «quítala, usa
 * la de arriba» y lanza si el número no se puede cobrar — callar y guardar un
 * valor absurdo sería peor que rechazarlo.
 */
export function saneaTasa(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    throw new Error('La comisión debe ser un número positivo.');
  }
  // Por encima de 1 solo puede ser un porcentaje escrito a la humana.
  const fraccion = n > 1 ? n / 100 : n;
  if (!tasaValida(fraccion)) {
    throw new Error(
      `La comisión no puede pasar del ${Math.round(COMISION_MAXIMA * 100)} %.`,
    );
  }
  // Dos decimales de porcentaje: 0.155 sí, 0.15547 es ruido.
  return Math.round(fraccion * 10_000) / 10_000;
}

/**
 * La tasa que aplica, con su procedencia.
 *
 * Cualquiera de las dos puede venir inválida desde la base (una fila vieja, una
 * edición a mano en SQL): en ese caso se ignora y se sigue bajando en la
 * precedencia, en vez de cobrar una barbaridad porque alguien escribió mal.
 */
export function resolverComision(
  tasaFlota: number | null | undefined,
  tasaCiudad: number | null | undefined,
): ComisionResuelta {
  if (tasaValida(tasaFlota)) return { tasa: tasaFlota, origen: 'flota' };
  if (tasaValida(tasaCiudad)) return { tasa: tasaCiudad, origen: 'ciudad' };
  return { tasa: COMISION_GLOBAL, origen: 'global' };
}

/** Reparte un bruto con la tasa dada. El neto nunca queda negativo. */
export function repartir(
  grossFare: number,
  tasa: number = COMISION_GLOBAL,
): { grossFare: number; commission: number; netEarning: number } {
  const efectiva = tasaValida(tasa) ? tasa : COMISION_GLOBAL;
  const commission = Math.round(grossFare * efectiva);
  return { grossFare, commission, netEarning: grossFare - commission };
}
