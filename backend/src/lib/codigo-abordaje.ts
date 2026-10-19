// ── Código de abordaje: subirse al carro correcto ────────────────────────────
//
// POR QUÉ EXISTE. El error más común —y el más peligroso— de un viaje es
// subirse al carro equivocado: dos taxis amarillos en la misma esquina, un
// carro que dice «¿Usted pidió un servicio?» y se lleva a quien conteste que
// sí. La placa ayuda, pero de noche y con lluvia nadie la lee.
//
// El código cierra ese hueco por el lado que importa: el conductor NO puede
// iniciar el viaje sin los cuatro dígitos que solo tiene el pasajero. Si quien
// te recoge no te los pide, no es tu conductor; y si te los pide, tú se los
// das a quien ya comprobaste que es — no al revés.
//
// Por eso el código NUNCA viaja en los DTO del conductor (igual que los PIN de
// custodia): él solo sabe que hace falta (`requiresBoardingPin`), no cuál es.
//
// Solo en viajes de PASAJERO. Un envío ya tiene su PIN de entrega, y pedirle
// un código de abordaje a un paquete no prueba nada.

import { pinMatches, CustodyPinError } from './custody-pin';

/** ¿Este tipo de servicio lleva código de abordaje? */
export function llevaCodigoAbordaje(serviceType: string | null | undefined): boolean {
  return !!serviceType && serviceType !== 'ENVIOS';
}

/**
 * ¿Se le exige el código a TODO conductor, aunque su app no lo mande?
 *
 * Apagado por defecto, como `KYC_ENFORCE`: las apps del conductor ya
 * instaladas no conocen el código, y exigirlo el día del despliegue dejaría a
 * todos sin poder iniciar un viaje hasta actualizar. Con el interruptor
 * apagado, un código QUE SE MANDA se comprueba igual (uno equivocado se
 * rechaza siempre); lo único que se tolera es que no llegue ninguno.
 */
export function exigirCodigoAbordaje(): boolean {
  return process.env['BOARDING_PIN_ENFORCE'] === 'true';
}

/** Intentos fallidos por viaje, para que el código no se adivine a la fuerza. */
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 5 * 60_000;
const fallidos = new Map<string, { n: number; hasta: number }>();

/**
 * Comprueba el código al iniciar el viaje, o lanza `CustodyPinError` con un
 * mensaje que el conductor puede leer.
 *
 * Cuatro dígitos son diez mil combinaciones: sin tope, quien tenga el viaje
 * asignado podría probarlas todas sin llevar a nadie (y cobrar un viaje que
 * no hizo). Cinco intentos y una pausa bastan para que el pasajero lo dicte
 * otra vez; no bastan para recorrer la lista.
 */
export function comprobarCodigoAbordaje(
  tripId: string,
  esperado: string | null | undefined,
  dado: string | undefined,
  exigir = exigirCodigoAbordaje(),
  ahora = Date.now(),
): void {
  // Viaje creado antes de esta función: no hay nada que comprobar.
  if (!esperado) return;

  const limpio = (dado ?? '').trim();
  if (!limpio) {
    if (!exigir) return;
    throw new CustodyPinError(
      'Pídele al pasajero su código de abordaje y escríbelo para iniciar el viaje.',
    );
  }

  const registro = fallidos.get(tripId);
  if (registro && registro.n >= MAX_INTENTOS && registro.hasta > ahora) {
    const min = Math.ceil((registro.hasta - ahora) / 60_000);
    throw new CustodyPinError(
      `Demasiados intentos con un código equivocado. Espera ${min} min y pídele ` +
        'al pasajero que te lo lea desde su app.',
    );
  }

  if (!pinMatches(esperado, limpio)) {
    const n = (registro && registro.hasta > ahora ? registro.n : 0) + 1;
    fallidos.set(tripId, { n, hasta: ahora + BLOQUEO_MS });
    throw new CustodyPinError(
      'El código no coincide. Pídele al pasajero que te lo lea desde su app: ' +
        'si no tiene ese código, puede que no sea tu pasajero.',
    );
  }
  fallidos.delete(tripId);
}

/** Para pruebas: olvida los intentos registrados. */
export function _reiniciarIntentosAbordaje(): void {
  fallidos.clear();
}

// ── Nota para el conductor ───────────────────────────────────────────────────

/**
 * Lo que el pasajero le escribe al conductor («Estoy en la portería del
 * edificio azul»). Corta a propósito: es una indicación, no un chat, y se lee
 * conduciendo. Lo que no es texto, o queda vacío, es `null`.
 */
export const NOTA_MAX = 140;

export function sanearNotaConductor(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  // Saltos de línea y espacios repetidos: la nota se pinta en un renglón.
  const limpia = valor.replace(/\s+/g, ' ').trim();
  if (!limpia) return null;
  return limpia.length > NOTA_MAX ? limpia.slice(0, NOTA_MAX).trimEnd() : limpia;
}
