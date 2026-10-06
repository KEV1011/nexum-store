/**
 * El giro a un aliado: a quién le debemos, cuánto, y cuándo se le puede pagar.
 *
 * CONTEXTO. Hasta ahora ZIPA no recaudaba: el pasajero le pagaba al conductor
 * y el cliente al negocio, así que nuestra comisión nacía como DEUDA que
 * alguien tenía que perseguir. El modelo que se acordó es el contrario —que
 * ZIPA cobre y gire— y eso invierte la obligación: **si cobramos, debemos**.
 *
 * Esta pieza es la mitad que faltaba. `Payout` existía solo para conductores
 * (cero referencias a negocios o empresas en el modelo), así que hoy se podría
 * cobrar el pedido de una tienda y no habría forma de pagarle a la tienda.
 * Recaudar sin tener el giro construido no es avanzar: es crear un pasivo.
 *
 * POR QUÉ UN SOLO MODELO DE GIRO Y NO UNO POR TIPO DE ALIADO. Construir una
 * tabla paralela para negocios y otra para empresas es exactamente el error
 * que este repositorio ya pagó con `CargoTrip` al lado de `FreightRequest`: la
 * trazabilidad quedó repartida y hubo que unificarla después. Un giro es un
 * giro —un dinero que sale hacia alguien, con su estado y su referencia—; lo
 * único que cambia es quién lo recibe.
 */

/** Los tres tipos de aliado a los que la plataforma le puede girar. */
export type TipoAliado = 'conductor' | 'negocio' | 'empresa';

/**
 * El destinatario de un giro. Exactamente UNO de los tres va informado.
 *
 * Se modela con tres campos opcionales y no con un par `(tipo, id)` porque la
 * base tiene llaves foráneas de verdad hacia cada tabla: un id huérfano no
 * puede entrar. El precio es esta comprobación, que es barata.
 */
export interface Beneficiario {
  driverId?: string | null;
  businessId?: string | null;
  operatorId?: string | null;
}

export class GiroError extends Error {}

/**
 * Devuelve el tipo de aliado, o lanza si no hay exactamente uno.
 *
 * POR QUÉ ES UN ERROR Y NO UNA PREFERENCIA. Un giro con DOS beneficiarios se
 * le pagaría a quien decidiera el orden de las comprobaciones del código —y
 * cambiar ese orden más tarde movería plata a otro bolsillo sin que nadie lo
 * note—. Un giro con NINGUNO es dinero que sale sin destinatario. Las dos
 * cosas son errores de programación nuestros, no entradas del usuario, así que
 * tienen que reventar en el acto y no degradar a un valor por defecto.
 */
export function tipoDeAliado(b: Beneficiario): TipoAliado {
  const puestos = [
    b.driverId ? 'conductor' : null,
    b.businessId ? 'negocio' : null,
    b.operatorId ? 'empresa' : null,
  ].filter(Boolean) as TipoAliado[];

  if (puestos.length === 0) {
    throw new GiroError('Un giro necesita un beneficiario: conductor, negocio o empresa.');
  }
  if (puestos.length > 1) {
    throw new GiroError(
      `Un giro no puede tener dos beneficiarios (${puestos.join(' y ')}).`,
    );
  }
  return puestos[0]!;
}

/**
 * Lo que la plataforma le debe a un aliado.
 *
 * El saldo se DERIVA de los créditos sin girar, nunca se guarda. Es la misma
 * regla que sostiene la cuenta de cobro de carga (`lib/cobro-balance.ts`): un
 * saldo guardado y unos movimientos guardados acaban discrepando, y entonces
 * nadie sabe cuál de los dos miente. Aquí el daño sería peor, porque lo que
 * discrepa es plata de otro.
 */
export interface CreditoSinGirar {
  /** Lo que le queda al aliado de esa venta, ya descontada la comisión. */
  netAmount: number;
}

export interface SaldoAliado {
  /** Lo que se le puede girar ahora mismo. */
  disponible: number;
  /** Cuántas ventas lo componen. Sin esto, un número suelto no se audita. */
  movimientos: number;
}

export function saldoDeAliado(creditos: readonly CreditoSinGirar[]): SaldoAliado {
  // Los negativos se descartan en vez de restar: un crédito en negativo sería
  // un error de cálculo nuestro, y dejar que reduzca lo que le debemos a un
  // aliado le cobraría a él una equivocación nuestra. Si aparece, se ve en el
  // conteo de movimientos que no cuadra.
  const vivos = creditos.filter((c) => Number.isFinite(c.netAmount) && c.netAmount > 0);
  const disponible = vivos.reduce((s, c) => s + c.netAmount, 0);
  return { disponible: Math.round(disponible), movimientos: vivos.length };
}

/**
 * El mínimo para girar. Por debajo no compensa: una transferencia tiene costo
 * —el del canal y el del minuto de quien la hace— y girar mil pesos lo quema.
 */
export const MINIMO_GIRO_COP = Number(process.env['GIRO_MINIMO_COP'] ?? 20000);

/**
 * Por qué NO se puede girar todavía. `null` = adelante.
 *
 * Devuelve el motivo y no un booleano porque quien lo lee está mirando una
 * pantalla con un botón apagado: «aún no llegas al mínimo de $20.000» se
 * arregla esperando, y «no tienes nada pendiente» no se arregla de ninguna
 * forma. Son dos conversaciones distintas.
 */
export function motivoParaNoGirar(
  saldo: SaldoAliado,
  monto: number,
): string | null {
  if (!Number.isFinite(monto) || monto <= 0) {
    return 'El monto del giro tiene que ser mayor que cero.';
  }
  if (saldo.disponible <= 0) {
    return 'No hay nada pendiente de girar.';
  }
  if (monto > saldo.disponible) {
    return (
      `El monto supera lo que hay pendiente: $${saldo.disponible.toLocaleString('es-CO')}.`
    );
  }
  if (monto < MINIMO_GIRO_COP) {
    return (
      `El giro mínimo es $${MINIMO_GIRO_COP.toLocaleString('es-CO')}. `
      + 'Se acumula para el siguiente.'
    );
  }
  return null;
}

/**
 * Qué créditos cubre un giro de `monto`, en orden de antigüedad.
 *
 * SE PAGA LO MÁS VIEJO PRIMERO, y no es un detalle: si se pagara lo más nuevo,
 * una venta de hace tres meses podría quedarse sin girar indefinidamente
 * mientras entran otras, y el aliado vería un saldo que nunca baja del todo.
 *
 * Solo entran créditos COMPLETOS. Partir uno obligaría a llevar un «pagado
 * parcialmente» por crédito, que es justo el estado que vuelve imposible
 * cuadrar una conciliación. Si el monto no alcanza para el siguiente, sobra —y
 * ese sobrante se queda disponible para el giro que viene.
 */
export function creditosQueCubre<T extends CreditoSinGirar>(
  creditos: readonly T[],
  monto: number,
): { cubiertos: T[]; total: number } {
  const cubiertos: T[] = [];
  let total = 0;
  for (const c of creditos) {
    if (c.netAmount <= 0) continue;
    if (total + c.netAmount > monto) break;
    cubiertos.push(c);
    total += c.netAmount;
  }
  return { cubiertos, total: Math.round(total) };
}
