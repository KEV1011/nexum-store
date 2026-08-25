import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calcFare, liquidarViaje, topeDeCordura, conTope } from './fare';

/**
 * El techo de cordura de la tarifa.
 *
 * Lo que se está protegiendo no es la precisión del precio: es que un número
 * disparatado no llegue a la billetera de un conductor. Una vez abonado, el
 * dinero no se deshace con un `UPDATE`, se deshace con una conversación.
 */
describe('tope de cordura de la tarifa', () => {
  let errores: string[];

  beforeEach(() => {
    errores = [];
    vi.spyOn(console, 'error').mockImplementation((m: unknown) => {
      errores.push(String(m));
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('no toca una carrera normal', () => {
    const { grossFare } = calcFare(3.2, 13);
    expect(grossFare).toBeLessThan(topeDeCordura(3.2, 13));
    expect(errores).toHaveLength(0);
  });

  it('deja pasar la carrera mínima de 0 km', () => {
    // Una carrera de 0,0 km cobrando la mínima es correcta: el suelo del tope
    // es el mínimo más caro de la tabla, así que no debe recortarla.
    const { grossFare } = calcFare(0, 0);
    expect(grossFare).toBeLessThanOrEqual(topeDeCordura(0, 0));
    expect(errores).toHaveLength(0);
  });

  it('atrapa el caso real: 89.887 $ en 3,2 km', () => {
    const tope = topeDeCordura(3.2, 13);
    expect(conTope(89_887, 3.2, 13)).toBe(tope);
    expect(tope).toBeLessThan(89_887);
  });

  it('y lo DICE, no lo recorta en silencio', () => {
    conTope(89_887, 3.2, 13);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('89887');
    expect(errores[0]).toContain('tope de cordura');
  });

  it('el techo crece con el trayecto', () => {
    expect(topeDeCordura(50, 90)).toBeGreaterThan(topeDeCordura(3, 10));
  });

  it('un intermunicipal largo y caro NO se recorta', () => {
    // 60 km y hora y media: el techo tiene que dar de sobra, si no estaríamos
    // cortando viajes legítimos, que es peor que no tener tope.
    const tope = topeDeCordura(60, 90);
    expect(tope).toBeGreaterThan(150_000);
  });

  it('un bruto inválido se cobra a cero, no NaN', () => {
    expect(conTope(Number.NaN, 3, 10)).toBe(0);
    expect(conTope(-500, 3, 10)).toBe(0);
    expect(errores.length).toBeGreaterThan(0);
  });

  it('una distancia disparatada no revienta el techo', () => {
    // `distanceKm` en metros por error: el techo sube, pero sigue siendo un
    // número, y el aviso queda escrito.
    expect(Number.isFinite(topeDeCordura(3200, 13))).toBe(true);
    expect(Number.isFinite(topeDeCordura(Number.NaN, Number.NaN))).toBe(true);
  });

  it('la liquidación por categoría también pasa por el techo', () => {
    // Con un multiplicador de demanda absurdo, el particular sí lo aplica.
    const { grossFare } = liquidarViaje('PARTICULAR', 3, 10, 999);
    expect(grossFare).toBeLessThanOrEqual(topeDeCordura(3, 10));
    expect(errores.length).toBeGreaterThan(0);
  });

  it('el neto y la comisión salen del bruto ya recortado', () => {
    const r = liquidarViaje('PARTICULAR', 3, 10, 999);
    expect(r.netEarning + r.commission).toBe(r.grossFare);
  });
});
