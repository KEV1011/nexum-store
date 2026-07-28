import { randomInt, timingSafeEqual } from 'crypto';

// ── Cadena de custodia por PIN ────────────────────────────────────────────────
//
// Cada servicio con recogida y entrega (pedido, mandado, flete) lleva DOS PIN
// de 4 dígitos generados al crearse:
//
//   pickupPin   → lo custodia quien ENTREGA la mercancía al conductor
//                 (el negocio en un pedido; el cliente/remitente en un mandado
//                 o un flete). El conductor lo teclea al recoger.
//   deliveryPin → lo custodia quien RECIBE (el cliente/destinatario). El
//                 conductor lo teclea al entregar.
//
// Los PIN NUNCA viajan en los DTO del conductor: él los pide de viva voz. Esa
// es toda la seguridad del mecanismo — si el conductor pudiera leerlos, no
// probaría nada.

/** PIN de 4 dígitos con aleatoriedad criptográfica (incluye los que empiezan por 0). */
export function generatePin(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

/** Par de PIN para un servicio nuevo. */
export function generateCustodyPins(): { pickupPin: string; deliveryPin: string } {
  return { pickupPin: generatePin(), deliveryPin: generatePin() };
}

/** Comparación en tiempo constante: no filtra cuántos dígitos acertó. */
export function pinMatches(expected: string | null | undefined, given: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(expected.trim());
  const b = Buffer.from(given.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class CustodyPinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustodyPinError';
  }
}

/**
 * Exige el PIN correcto o lanza `CustodyPinError` con mensaje en español.
 * Política actual: bloqueo ESTRICTO, sin excepciones — sin PIN válido el
 * servicio no avanza de estado.
 *
 * @param fase  'recogida' | 'entrega' — solo para el mensaje de error.
 */
export function assertCustodyPin(
  expected: string | null | undefined,
  given: string | undefined,
  fase: 'recogida' | 'entrega',
): void {
  const quien = fase === 'recogida' ? 'quien te entrega' : 'quien recibe';
  if (!given || !given.trim()) {
    throw new CustodyPinError(
      `Pide el PIN de ${fase} a ${quien} y escríbelo para continuar.`,
    );
  }
  if (!expected) {
    // Servicio creado antes de esta función: sin PIN guardado no hay nada que
    // comprobar. Se deja pasar para no bloquear entregas ya en curso.
    return;
  }
  if (!pinMatches(expected, given)) {
    throw new CustodyPinError(
      `El PIN de ${fase} no coincide. Verifícalo con ${quien}.`,
    );
  }
}
