import { describe, it, expect } from 'vitest';
import { celda, numero, metricasACsv } from './piloto-csv';
import type { MetricasNegocio } from '../services/admin.service';

const base: MetricasNegocio = {
  desde: '2026-09-01',
  hasta: '2026-09-03',
  serie: [
    { dia: '2026-09-01', solicitados: 4, completados: 3 },
    { dia: '2026-09-02', solicitados: 0, completados: 0 },
    { dia: '2026-09-03', solicitados: 6, completados: 5 },
  ],
  emparejamiento: { solicitados: 10, conConductor: 8, sinConductor: 1, tasa: 80 },
  retencion: { base: 20, volvieron: 9, pct: 45, fiable: true },
  pasajerosActivos: 7,
};

const filas = (csv: string) => csv.split('\n');

describe('las cifras del piloto en CSV', () => {
  it('una fila por día, incluidos los vacíos', () => {
    // Saltarse los días de cero haría que un mes con dos semanas muertas se
    // leyera como un mes entero de actividad.
    const csv = metricasACsv(base);
    expect(filas(csv)[0]).toBe('Fecha;Solicitados;Completados');
    expect(filas(csv)[1]).toBe('2026-09-01;4;3');
    expect(filas(csv)[2]).toBe('2026-09-02;0;0');
    expect(filas(csv)[3]).toBe('2026-09-03;6;5');
  });

  it('separa con «;» — el Excel en español abre así', () => {
    // Con comas, la hoja llega con todo en la primera columna y quien la
    // recibe supone que el archivo está roto.
    const csv = metricasACsv(base);
    expect(csv).toContain('Fecha;Solicitados');
    expect(csv).not.toContain('Fecha,Solicitados');
  });

  it('lleva la plaza dentro, no solo en el nombre del archivo', () => {
    // Dos hojas de dos ciudades acaban en la misma carpeta y con el nombre
    // cambiado. Si la ciudad no va dentro, no hay forma de saber cuál es cuál.
    expect(metricasACsv(base, 'cucuta')).toContain('Plaza;cucuta');
    expect(metricasACsv(base)).toContain('Plaza;Toda la plataforma');
  });

  it('una tasa que no existe va VACÍA, no en cero', () => {
    const sinNada = metricasACsv({
      ...base,
      emparejamiento: { solicitados: 0, conConductor: 0, sinConductor: 0, tasa: null },
      retencion: { base: 0, volvieron: 0, pct: null, fiable: false },
    });
    expect(sinNada).toContain('Tasa de emparejamiento %;\n');
    expect(sinNada).toContain('Retención %;');
    expect(sinNada).not.toContain('Tasa de emparejamiento %;0');
    expect(sinNada).not.toContain('Retención %;0\n');
  });

  it('avisa cuando la retención se calculó sobre cuatro gatos', () => {
    // Quien abra esta hoja dentro de un mes no se va a acordar de que ese
    // «50 %» eran dos personas.
    const csv = metricasACsv({
      ...base,
      retencion: { base: 2, volvieron: 1, pct: 50, fiable: false },
    });
    expect(csv).toContain('Retención fiable;no (base de 2)');
  });

  it('los decimales van con coma', () => {
    const csv = metricasACsv({
      ...base,
      emparejamiento: { ...base.emparejamiento, tasa: 66.7 },
    });
    expect(csv).toContain('Tasa de emparejamiento %;66,7');
  });

  it('el cero se escribe, porque cero es un dato', () => {
    expect(numero(0)).toBe('0');
    expect(numero(null)).toBe('');
    expect(numero(Number.NaN)).toBe('');
  });

  it('un texto con «;» o comillas no parte la fila', () => {
    expect(celda('Pamplona; N. de S.')).toBe('"Pamplona; N. de S."');
    expect(celda('El "centro"')).toBe('"El ""centro"""');
    expect(celda(null)).toBe('');
    expect(celda(0)).toBe('0');
  });
});
