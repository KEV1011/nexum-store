import { describe, it, expect } from 'vitest';

import {
  ERRAND_TERMINALES,
  ORDER_TERMINALES,
  TRIP_TERMINALES,
  esEstadoTerminal,
  guardaNoTerminal,
} from './estado-terminal';

describe('estados terminales de un servicio', () => {
  it('un viaje completado o cancelado está cerrado', () => {
    expect(esEstadoTerminal('trip', 'COMPLETED')).toBe(true);
    expect(esEstadoTerminal('trip', 'CANCELLED')).toBe(true);
  });

  it('un viaje en curso NO está cerrado', () => {
    for (const s of ['SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS']) {
      expect(esEstadoTerminal('trip', s), s).toBe(false);
    }
  });

  it('el pedido y el mandado cierran en DELIVERED, no en COMPLETED', () => {
    expect(esEstadoTerminal('order', 'DELIVERED')).toBe(true);
    expect(esEstadoTerminal('errand', 'DELIVERED')).toBe(true);
    // COMPLETED no es un estado de estos dos: si algún día se usara por error,
    // la guarda debe decir que NO está cerrado en vez de dejarlo pasar por
    // parecido.
    expect(esEstadoTerminal('order', 'COMPLETED')).toBe(false);
  });

  it('acepta la minúscula que mandan las apps', () => {
    // Las apps envían la acción como 'delivered'; en la base es 'DELIVERED'.
    // Si la guarda distinguiera mayúsculas, no cazaría nada y la doble
    // liquidación volvería.
    expect(esEstadoTerminal('order', 'delivered')).toBe(true);
    expect(esEstadoTerminal('trip', 'completed')).toBe(true);
  });

  it('un estado ausente no se considera cerrado', () => {
    expect(esEstadoTerminal('trip', null)).toBe(false);
    expect(esEstadoTerminal('trip', undefined)).toBe(false);
    expect(esEstadoTerminal('trip', '')).toBe(false);
  });

  it('un estado desconocido no se considera cerrado', () => {
    // Preferimos dejar avanzar un estado que no conocemos a bloquear un
    // servicio real: lo que NO se puede es liquidar dos veces, y de eso se
    // encargan los estados que sí conocemos.
    expect(esEstadoTerminal('trip', 'INVENTADO')).toBe(false);
  });

  it('la guarda para Prisma lista exactamente los estados cerrados', () => {
    expect(guardaNoTerminal('trip')).toEqual({ notIn: TRIP_TERMINALES });
    expect(guardaNoTerminal('order')).toEqual({ notIn: ORDER_TERMINALES });
    expect(guardaNoTerminal('errand')).toEqual({ notIn: ERRAND_TERMINALES });
  });

  it('cancelado está en los tres: un "entregado" tardío no revive un cancelado', () => {
    expect(esEstadoTerminal('trip', 'CANCELLED')).toBe(true);
    expect(esEstadoTerminal('order', 'CANCELLED')).toBe(true);
    expect(esEstadoTerminal('errand', 'CANCELLED')).toBe(true);
  });
});
