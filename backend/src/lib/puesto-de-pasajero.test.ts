import { describe, expect, it } from 'vitest';
import {
  ABIERTAS_MAX_POR_PASAJERO,
  DIAS_MAX_ADELANTE,
  GRACIA_TOMA_MIN,
  TOLERANCIA_AHORA_MIN,
  motivoParaNoPublicarComoPasajero,
  motivoParaNoTomar,
} from './puesto-de-pasajero';

const AHORA = new Date('2026-09-26T12:00:00Z');
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3600_000);
const enMinutos = (m: number) => new Date(AHORA.getTime() + m * 60_000);

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

  // ESTAS DOS EXPECTATIVAS CAMBIARON, y el motivo importa: antes se exigía
  // que la salida fuera estrictamente futura, y eso hacía IMPOSIBLE pedir un
  // taxi «para ahora» — la app manda `DateTime.now()` y entre el teléfono y
  // el servidor pasan décimas, así que el propio instante que el pasajero
  // acaba de tocar llegaba ya en el pasado y se rechazaba con «la hora tiene
  // que ser en el futuro». Fue una de las tres causas de «se solicita un
  // servicio y no le sale a ningún conductor».
  it('«ahora mismo» se puede publicar', () => {
    expect(publicacion({ salida: AHORA })).toBeNull();
    // Y un reloj de teléfono atrasado unos minutos tampoco bloquea.
    expect(publicacion({ salida: enMinutos(-TOLERANCIA_AHORA_MIN + 1) })).toBeNull();
  });

  it('pero una hora que de verdad ya pasó sí se rechaza', () => {
    expect(publicacion({ salida: enHoras(-1) })).toMatch(/ya pasó/i);
    expect(publicacion({ salida: enMinutos(-TOLERANCIA_AHORA_MIN - 1) })).toMatch(/ya pasó/i);
  });

  it('una fecha ilegible se rechaza en vez de guardarse', () => {
    expect(publicacion({ salida: new Date('no es una fecha') })).toMatch(/no entendimos/i);
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

  it('se puede tomar unos minutos DESPUÉS de la hora de salida', () => {
    // Un taxi que ve el aviso a las 6:00 y lo toma a las 6:04 todavía hace el
    // viaje. Antes esto se rechazaba, así que un viaje «para ahora» dejaba de
    // poderse tomar al minuto siguiente de publicarse: el taxista recibía el
    // aviso y al abrir la app no había nada.
    expect(toma({ salida: enMinutos(-GRACIA_TOMA_MIN + 1) })).toBeNull();
  });

  it('pasada la gracia sí se retira: el pasajero ya se fue', () => {
    // Aceptar entonces manda al taxista a una esquina vacía.
    expect(toma({ salida: enMinutos(-GRACIA_TOMA_MIN - 1) })).toMatch(/pasó/i);
    expect(toma({ salida: enHoras(-1) })).toMatch(/pasó/i);
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
