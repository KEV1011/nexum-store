/**
 * Qué le debemos al conductor y qué nos debe él.
 *
 * EL DEFECTO QUE ESTO CORRIGE
 * ---------------------------
 * `recordCompletedTrip` escribía `netEarning` en la billetera en CADA servicio
 * completado, sin mirar quién cobró. Y el saldo disponible era
 * `suma(netEarning) − pagado − pendiente`.
 *
 * En una carrera de $6.000 en efectivo eso significa que el conductor ya tiene
 * los $6.000 en el bolsillo Y el sistema dice que le debemos $5.100. El signo
 * está invertido: la realidad es que él nos debe $900 de comisión. Un taxista
 * con cincuenta carreras en efectivo podía pedir un retiro de ~$255.000 por
 * plata que ya había cobrado.
 *
 * LA DISTINCIÓN YA EXISTÍA Y NADIE LA MIRABA
 * ------------------------------------------
 * `lib/metodos-pago.ts` clasifica cada método por `quienCobra`. Solo
 * `en_linea` es `plataforma`; efectivo, Nequi, Daviplata y las transferencias
 * son `conductor` — el dinero le llega a él directamente y por la app no pasa
 * un peso. Así que la regla es de una línea: **solo se le debe lo que nosotros
 * recaudamos; de lo que cobró él, sale nuestra comisión.**
 *
 * SIN MÉTODO DECLARADO SE ASUME EFECTIVO
 * --------------------------------------
 * `Trip.paymentMethod` es nullable y las apps viejas no lo mandan. Asumir
 * «plataforma» ahí acreditaría plata que nunca recibimos, que es justo el
 * error que esto viene a cerrar. Asumir efectivo, como mucho, deja una comisión
 * sin cobrar — el error barato.
 */

import { metodoPorValor, type QuienCobra } from './metodos-pago';

/** Quién recibió el dinero. Sin método declarado, el conductor (efectivo). */
export function quienCobra(metodo: string | null | undefined): QuienCobra {
  return metodoPorValor(metodo)?.quienCobra ?? 'conductor';
}

export interface MovimientoDeLiquidacion {
  /** Lo que ZIPA retuvo y tendrá que girarle. */
  aFavorDelConductor: number;
  /** La comisión que él cobró de su mano y nos debe. */
  deudaDelConductor: number;
}

/**
 * Qué mueve un servicio liquidado en la billetera.
 *
 * Las dos ramas son excluyentes a propósito: o la plata pasó por nosotros o no
 * pasó. Un servicio no puede a la vez dejarnos debiendo y dejarlo debiendo.
 */
export function movimientoDeLiquidacion(
  brutoCobrado: number,
  netoDelConductor: number,
  metodo: string | null | undefined,
): MovimientoDeLiquidacion {
  const bruto = Math.max(0, Math.round(brutoCobrado));
  const neto = Math.max(0, Math.round(netoDelConductor));
  const comision = Math.max(0, bruto - neto);

  if (quienCobra(metodo) === 'plataforma') {
    // Cobramos nosotros: le debemos su neto y la comisión ya está en casa.
    return { aFavorDelConductor: neto, deudaDelConductor: 0 };
  }
  // Cobró él: no le debemos nada de este servicio y nos debe la comisión.
  return { aFavorDelConductor: 0, deudaDelConductor: comision };
}

export interface SaldoDelConductor {
  /** Lo que puede retirar hoy. Nunca negativo. */
  disponible: number;
  /** Lo que debe de comisiones de servicios que cobró él. */
  deuda: number;
  /** Retenido por nosotros menos lo ya girado y lo solicitado. */
  aFavor: number;
}

/**
 * El saldo, con la deuda SEPARADA y visible.
 *
 * La deuda no se esconde restándola en silencio hasta dar cero: se enseña
 * aparte. Un conductor que ve «$0 disponible» sin más cree que hay un error de
 * la app; uno que ve «debes $12.400 de comisiones» sabe qué hacer. Y es lo que
 * hace falta para poder bloquear el «conectarse» el día que se exija.
 */
export function saldoDelConductor(p: {
  retenidoPorLaPlataforma: number;
  deudaAcumulada: number;
  yaPagado: number;
  solicitado: number;
}): SaldoDelConductor {
  const aFavor = Math.round(p.retenidoPorLaPlataforma - p.yaPagado - p.solicitado);
  const deuda = Math.max(0, Math.round(p.deudaAcumulada));
  return {
    // La deuda se descuenta de lo retirable: si le debemos 50.000 y nos debe
    // 12.000, puede sacar 38.000. Cobrarle aparte una deuda que podemos
    // compensar sería hacerle dar dos vueltas.
    disponible: Math.max(0, aFavor - deuda),
    deuda,
    aFavor: Math.max(0, aFavor),
  };
}
