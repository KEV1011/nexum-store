import { describe, expect, it } from 'vitest';
import {
  ABIERTAS_MAX_POR_PASAJERO,
  DIAS_MAX_ADELANTE,
  motivoParaNoPublicarComoPasajero,
  motivoParaNoTomar,
} from './puesto-de-pasajero';

const AHORA = new Date('2026-09-26T12:00:00Z');
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3600_000);

function publicacion(over: Partial<Parameters<typeof motivoParaNoPublicarComoPasajero>[0]> = {}) {
  return motivoParaNoPublicarComoPasajero({
    puestos: 4,
    puestosDelCreador: 1,
    salida: enHoras(3),
    abiertas: 0,
    ahora: AHORA,
    ...over,
  });
}

describe('publicar un viaje por puestos siendo pasajero', () => {
  it('lo normal pasa', () => {
    expect(publicacion()).toBeNull();
  });

  it('quien publica tiene que ir: cero puestos suyos se rechaza', () => {
    expect(publicacion({ puestosDelCreador: 0 })).toMatch(/quien publica/i);
  });

  it('no se puede quedar con TODOS los puestos', () => {
    // Es la regla que impide usar esto para pagar una carrera entera al precio
    // de un puesto: sin ella, «4 puestos y voy yo en los 4» es una carrera
    // sola por debajo de la tarifa del decreto y nadie se sube nunca.
    expect(publicacion({ puestos: 4, puestosDelCreador: 4 })).toMatch(/al menos un puesto libre/i);
    expect(publicacion({ puestos: 2, puestosDelCreador: 2 })).toMatch(/al menos un puesto libre/i);
  });

  it('puede ocupar varios mientras deje uno', () => {
    expect(publicacion({ puestos: 4, puestosDelCreador: 3 })).toBeNull();
  });

  it('la salida tiene que ser en el futuro', () => {
    expect(publicacion({ salida: enHoras(-1) })).toMatch(/futuro/i);
    expect(publicacion({ salida: AHORA })).toMatch(/futuro/i);
  });

  it('una fecha ilegible se rechaza en vez de guardarse', () => {
    expect(publicacion({ salida: new Date('no es una fecha') })).toMatch(/futuro/i);
  });

  it('no se publica para dentro de un mes', () => {
    expect(publicacion({ salida: enHoras(24 * (DIAS_MAX_ADELANTE + 1)) })).toMatch(/anticipación/i);
  });

  it('justo en el límite de días todavía pasa', () => {
    expect(publicacion({ salida: enHoras(24 * DIAS_MAX_ADELANTE - 1) })).toBeNull();
  });

  it('con el tope de abiertas alcanzado se rechaza diciendo cuántas hay', () => {
    const m = publicacion({ abiertas: ABIERTAS_MAX_POR_PASAJERO });
    expect(m).toMatch(new RegExp(String(ABIERTAS_MAX_POR_PASAJERO)));
    expect(m).toMatch(/cancela/i);
  });

  it('una por debajo del tope todavía pasa', () => {
    expect(publicacion({ abiertas: ABIERTAS_MAX_POR_PASAJERO - 1 })).toBeNull();
  });
});

function toma(over: Partial<Parameters<typeof motivoParaNoTomar>[0]> = {}) {
  return motivoParaNoTomar({
    driverIdActual: null,
    estado: 'OPEN',
    salida: enHoras(3),
    tipoVehiculo: 'TAXI',
    ahora: AHORA,
    ...over,
  });
}

describe('tomar un viaje publicado por un pasajero', () => {
  it('un taxi libre la puede tomar', () => {
    expect(toma()).toBeNull();
  });

  it('un particular también', () => {
    expect(toma({ tipoVehiculo: 'PARTICULAR' })).toBeNull();
  });

  it('si ya la tomó otro, lo dice', () => {
    expect(toma({ driverIdActual: 'drv_1' })).toMatch(/ya tomó/i);
  });

  it('una salida cerrada o cancelada no se toma', () => {
    for (const estado of ['CANCELLED', 'DEPARTED', 'COMPLETED', 'FULL']) {
      expect(toma({ estado })).toMatch(/ya no está disponible/i);
    }
  });

  it('una salida cuya hora ya pasó no se toma', () => {
    expect(toma({ salida: enHoras(-1) })).toMatch(/ya pasó/i);
  });

  it('una moto no puede: la salida lleva de dos a cuatro pasajeros', () => {
    expect(toma({ tipoVehiculo: 'MOTO' })).toMatch(/carro/i);
  });

  it('un camión tampoco', () => {
    for (const tipo of ['TURBO', 'CAMION', 'MULA']) {
      expect(toma({ tipoVehiculo: tipo })).toMatch(/carro/i);
    }
  });

  it('sin vehículo registrado se dice qué falta, no «no puedes»', () => {
    expect(toma({ tipoVehiculo: null })).toMatch(/registra tu vehículo/i);
  });

  it('el orden importa: tomada manda sobre la hora pasada', () => {
    // Las dos son ciertas a la vez y el arreglo es distinto: «la tomó otro» se
    // resuelve buscando otra, «ya pasó» no se resuelve. Se dice la primera.
    expect(toma({ driverIdActual: 'drv_1', salida: enHoras(-1) })).toMatch(/ya tomó/i);
  });
});
