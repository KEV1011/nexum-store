/**
 * La página pública de «compartir viaje» (`app/viaje/`). Lo que decide sin
 * tocar el navegador vive en `app/viaje/seguimiento.ts` y se prueba aquí,
 * igual que `moneda-portal`.
 */
import { describe, expect, it } from 'vitest';

import {
  describirVehiculo,
  esTerminal,
  haceCuanto,
  horaColombia,
  trazo,
  type ViajeCompartido,
} from '../../../app/viaje/seguimiento';

const base: ViajeCompartido = {
  status: 'IN_PROGRESS',
  statusLabel: 'En camino al destino',
  originAddress: 'Calle 5',
  destinationAddress: 'Terminal',
  origin: { lat: 7.37, lng: -72.64 },
  destination: { lat: 7.39, lng: -72.66 },
  stops: [{ name: 'Farmacia', lat: 7.38, lng: -72.65 }, { name: 'Donde la tía' }],
  updatedAt: '2026-10-19T15:00:00Z',
};

describe('la hora va en hora de Colombia', () => {
  it('aunque quien abre el enlace esté en otro país', () => {
    // 04:39 UTC = 23:39 del día anterior en Bogotá.
    expect(horaColombia('2026-10-20T04:39:00Z')).toBe('23:39');
  });
  it('sin dato o con basura, nada', () => {
    expect(horaColombia(undefined)).toBeNull();
    expect(horaColombia('ayer')).toBeNull();
  });
});

describe('cuánto hace que el carro mandó su posición', () => {
  const t = Date.parse('2026-10-19T15:00:00Z');
  it('segundos y minutos', () => {
    expect(haceCuanto('2026-10-19T14:59:40Z', t)).toBe('hace 20 s');
    expect(haceCuanto('2026-10-19T14:57:00Z', t)).toBe('hace 3 min');
  });
  it('un reloj adelantado no da tiempos negativos', () => {
    expect(haceCuanto('2026-10-19T15:00:30Z', t)).toBe('hace 0 s');
  });
});

describe('el trayecto y el carro', () => {
  it('pasa por las paradas CON punto, en orden; la que no tiene no se inventa', () => {
    expect(trazo(base)).toEqual([[7.37, -72.64], [7.38, -72.65], [7.39, -72.66]]);
  });
  it('el carro se describe por marca y color; la placa va aparte', () => {
    expect(describirVehiculo({ brand: 'Chevrolet', model: 'Spark', color: 'Amarillo', plate: 'ABC123' }))
      .toBe('Chevrolet Spark · amarillo');
    expect(describirVehiculo(undefined)).toBeNull();
  });
  it('terminado o cancelado deja de preguntar', () => {
    expect(esTerminal('COMPLETED')).toBe(true);
    expect(esTerminal('CANCELLED')).toBe(true);
    expect(esTerminal('IN_PROGRESS')).toBe(false);
  });
});
