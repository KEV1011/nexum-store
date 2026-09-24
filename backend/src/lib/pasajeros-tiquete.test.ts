import { describe, it, expect } from 'vitest';
import {
  MAX_PASAJEROS, PasajerosInvalidos, lineaDePasajero, pasajerosGuardados, saneaPasajeros,
} from './pasajeros-tiquete';

const uno = { tipoDoc: 'CC', documento: '1090123456', nombre: 'María Torres' };
const dos = { tipoDoc: 'TI', documento: '1012345678', nombre: 'Juan Torres' };

describe('saneaPasajeros', () => {
  it('acepta uno por silla', () => {
    expect(saneaPasajeros([uno, dos], 2)).toEqual([uno, dos]);
  });

  it('una app vieja que no los manda sigue reservando', () => {
    // Exigirlo de golpe dejaría sin comprar a quien no haya actualizado.
    expect(saneaPasajeros(undefined, 2)).toBeNull();
    expect(saneaPasajeros(null, 2)).toBeNull();
    expect(saneaPasajeros([], 2)).toBeNull();
  });

  it('EXIGE tantos pasajeros como puestos', () => {
    // Aceptar menos dejaría el mismo agujero con más formularios.
    expect(() => saneaPasajeros([uno], 4)).toThrow(/4 puestos y enviaste 1 pasajero/);
    expect(() => saneaPasajeros([uno, dos], 1)).toThrow(/1 puesto y enviaste 2 pasajeros/);
  });

  it('rechaza el documento repetido', () => {
    // La misma persona no ocupa dos sillas; casi siempre es copiar y pegar.
    expect(() => saneaPasajeros([uno, { ...dos, documento: uno.documento }], 2))
      .toThrow(/repetido/);
  });

  it('detecta el repetido aunque venga con puntos o guiones', () => {
    // «1.090.123-456» y «1090123456» son la misma persona.
    expect(() => saneaPasajeros([uno, { ...dos, documento: '1.090.123-456' }], 2))
      .toThrow(/repetido/);
  });

  it('normaliza el tipo en minúscula', () => {
    expect(saneaPasajeros([{ ...uno, tipoDoc: 'cc' }], 1)?.[0]?.tipoDoc).toBe('CC');
  });

  it('colapsa los espacios del nombre', () => {
    expect(saneaPasajeros([{ ...uno, nombre: '  María   Torres ' }], 1)?.[0]?.nombre)
      .toBe('María Torres');
  });

  it('nombra el PUESTO del que falla, no «hay un error»', () => {
    expect(() => saneaPasajeros([uno, { ...dos, nombre: 'Jo' }], 2)).toThrow(/pasajero 2/);
    expect(() => saneaPasajeros([{ ...uno, documento: '12' }, dos], 2)).toThrow(/pasajero 1/);
  });

  it('rechaza un tipo de documento inventado', () => {
    expect(() => saneaPasajeros([{ ...uno, tipoDoc: 'NIT' }], 1)).toThrow(PasajerosInvalidos);
  });

  it('acepta cédula de extranjería y pasaporte', () => {
    // En la frontera se ven a diario; dejarlos fuera sería dejar gente fuera.
    expect(saneaPasajeros([{ tipoDoc: 'CE', documento: 'E1234567', nombre: 'Ana Pérez' }], 1))
      .toHaveLength(1);
    expect(saneaPasajeros([{ tipoDoc: 'PA', documento: 'AB123456', nombre: 'Ana Pérez' }], 1))
      .toHaveLength(1);
  });

  it('rechaza un hueco en la lista', () => {
    expect(() => saneaPasajeros([uno, null], 2)).toThrow(/pasajero 2/);
  });

  it('rechaza más puestos de los que caben', () => {
    const muchos = Array.from({ length: MAX_PASAJEROS + 1 }, (_, i) => ({
      tipoDoc: 'CC', documento: `10901234${i}0`, nombre: `Persona ${i}`,
    }));
    expect(() => saneaPasajeros(muchos, MAX_PASAJEROS + 1)).toThrow(PasajerosInvalidos);
  });

  it('rechaza algo que no es una lista', () => {
    expect(() => saneaPasajeros({ tipoDoc: 'CC' }, 1)).toThrow(PasajerosInvalidos);
  });
});

describe('pasajerosGuardados', () => {
  it('lee lo válido y descarta lo roto sin lanzar', () => {
    const leidos = pasajerosGuardados([uno, { tipoDoc: 'XX', documento: '1', nombre: 'a' }, 'nada']);
    expect(leidos).toEqual([uno]);
  });

  it('una reserva vieja sin pasajeros da lista vacía', () => {
    expect(pasajerosGuardados(null)).toEqual([]);
    expect(pasajerosGuardados(undefined)).toEqual([]);
  });
});

describe('lineaDePasajero', () => {
  it('sale lista para el manifiesto del conductor', () => {
    expect(lineaDePasajero(uno)).toBe('CC 1090123456 · María Torres');
  });
});
