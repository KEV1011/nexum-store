import { describe, it, expect } from 'vitest';
import {
  generatePin,
  generateCustodyPins,
  pinMatches,
  assertCustodyPin,
  CustodyPinError,
} from './custody-pin';

describe('generatePin', () => {
  it('siempre devuelve 4 dígitos, incluidos los que empiezan por cero', () => {
    for (let i = 0; i < 500; i++) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{4}$/);
    }
  });

  it('genera un par distinto para recogida y entrega', () => {
    // Con 10 000 combinaciones un choque puntual es posible; lo que no debe
    // pasar es que siempre sean iguales (bug de reutilizar el mismo valor).
    const pares = Array.from({ length: 50 }, () => generateCustodyPins());
    const iguales = pares.filter((p) => p.pickupPin === p.deliveryPin).length;
    expect(iguales).toBeLessThan(5);
  });
});

describe('pinMatches', () => {
  it('acepta el PIN correcto y rechaza el incorrecto', () => {
    expect(pinMatches('1234', '1234')).toBe(true);
    expect(pinMatches('1234', '1235')).toBe(false);
  });

  it('rechaza cuando no hay PIN esperado', () => {
    expect(pinMatches(null, '1234')).toBe(false);
    expect(pinMatches(undefined, '1234')).toBe(false);
    expect(pinMatches('', '1234')).toBe(false);
  });

  it('tolera espacios alrededor (el conductor teclea con el móvil)', () => {
    expect(pinMatches('1234', ' 1234 ')).toBe(true);
  });

  it('no casa por prefijo ni por longitud distinta', () => {
    expect(pinMatches('1234', '123')).toBe(false);
    expect(pinMatches('1234', '12345')).toBe(false);
  });
});

describe('assertCustodyPin — bloqueo estricto', () => {
  it('bloquea si no se envía PIN', () => {
    expect(() => assertCustodyPin('1234', undefined, 'entrega')).toThrow(CustodyPinError);
    expect(() => assertCustodyPin('1234', '', 'entrega')).toThrow(CustodyPinError);
    expect(() => assertCustodyPin('1234', '   ', 'entrega')).toThrow(CustodyPinError);
  });

  it('bloquea si el PIN no coincide', () => {
    expect(() => assertCustodyPin('1234', '9999', 'recogida')).toThrow(CustodyPinError);
  });

  it('deja pasar el PIN correcto', () => {
    expect(() => assertCustodyPin('1234', '1234', 'entrega')).not.toThrow();
  });

  it('el mensaje va en español y nombra la fase', () => {
    try {
      assertCustodyPin('1234', '0000', 'recogida');
      throw new Error('debió lanzar');
    } catch (err) {
      expect((err as Error).message).toContain('recogida');
      expect((err as Error).message).toContain('no coincide');
    }
  });

  it('NUNCA revela el PIN esperado en el mensaje de error', () => {
    try {
      assertCustodyPin('4321', '0000', 'entrega');
      throw new Error('debió lanzar');
    } catch (err) {
      expect((err as Error).message).not.toContain('4321');
    }
  });

  it('no bloquea servicios creados antes de existir el PIN (sin PIN guardado)', () => {
    // Pedidos/mandados/fletes en curso durante el despliegue: no hay nada
    // contra qué comparar, así que la entrega no puede quedar trabada.
    expect(() => assertCustodyPin(null, '1234', 'entrega')).not.toThrow();
    expect(() => assertCustodyPin(undefined, '1234', 'recogida')).not.toThrow();
  });

  it('pero sigue exigiendo que el conductor escriba algo, aunque no haya PIN', () => {
    expect(() => assertCustodyPin(null, undefined, 'entrega')).toThrow(CustodyPinError);
  });
});
