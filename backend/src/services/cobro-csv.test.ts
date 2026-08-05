import { describe, it, expect } from 'vitest';
import { cobroToCsv, type CobroDTO } from './cobro.service';

// Datos tomados del documento real del cliente («CUENTA DE COBRO 066»), que es
// el formato que hay que reproducir: un viaje puede llevar varias líneas con
// distinto cliente y destino, y el peso se anota una sola vez por viaje.

function linea(
  reference: string | undefined, totalItems: number, totalMeasure: number,
  clientName: string, clientCity: string, deliveredOn?: string,
) {
  return { reference, totalItems, totalMeasure, clientName, clientCity, deliveredOn } as
    unknown as CobroDTO['trips'][number]['lines'][number];
}

function viaje(
  number: number, originCity: string, originPlace: string | undefined,
  weightKg: number | undefined, lines: CobroDTO['trips'][number]['lines'],
  isUrban = false,
) {
  const totalItems = lines.reduce((s, l) => s + (l.totalItems ?? 0), 0);
  const totalMeasure = lines.reduce((s, l) => s + (l.totalMeasure ?? 0), 0);
  return { number, originCity, originPlace, weightKg, isUrban, lines, totalItems, totalMeasure } as
    unknown as CobroDTO['trips'][number];
}

function cuenta(trips: CobroDTO['trips']): CobroDTO {
  return { number: '066', trips } as unknown as CobroDTO;
}

/** Parte una línea CSV entrecomillada en sus celdas. */
function celdas(linea: string): string[] {
  return linea.split('","').map((c) => c.replace(/^"|"$/g, ''));
}

describe('cobroToCsv', () => {
  it('el encabezado trae las columnas del documento en papel', () => {
    const csv = cobroToCsv(cuenta([]));
    expect(celdas(csv.split('\r\n')[0]!)).toEqual([
      'Viaje', 'Origen', 'Referencia', 'Rollos', 'Metros', 'Peso_kg',
      'Fecha_entrega', 'Cliente', 'Destino',
    ]);
  });

  it('un viaje de una línea sale completo', () => {
    // Viaje 09 del documento: 79 rollos, 7.026 m, 6.000 kg.
    const csv = cobroToCsv(cuenta([
      viaje(9, 'CUCUTA', 'DON LUIS', 6000, [
        linea('706001 BLACK', 79, 7026, 'BERNARDO SERNA', 'MEDELLIN', '2026-07-31T00:00:00.000Z'),
      ]),
    ]));
    const f = celdas(csv.split('\r\n')[1]!);
    expect(f).toEqual([
      '9', 'CUCUTA DON LUIS', '706001 BLACK', '79', '7026', '6000',
      '2026-07-31', 'BERNARDO SERNA', 'MEDELLIN',
    ]);
  });

  it('con varias líneas, el número de viaje y el origen van solo en la primera', () => {
    // Viaje 08: tres destinatarios distintos en el mismo camión.
    const csv = cobroToCsv(cuenta([
      viaje(8, 'CUCUTA', 'DON LUIS', 10000, [
        linea('706001 BLK BLK', 64, 5719.6, 'PERALTEX', 'BOGOTA'),
        linea(undefined, 32, 3009.8, 'GERMAN BERNAL', 'BOGOTA'),
        linea(undefined, 35, 3049.1, 'CARLOS CASTRO', 'BOGOTA'),
      ]),
    ]));
    const [, f1, f2, f3] = csv.split('\r\n').map(celdas);
    expect(f1![0]).toBe('8');
    expect(f1![1]).toBe('CUCUTA DON LUIS');
    // Las siguientes repiten cliente y destino, pero no el viaje: es lo que
    // hace legible el papel, y repetirlo sugeriría tres viajes distintos.
    expect(f2![0]).toBe('');
    expect(f2![1]).toBe('');
    expect(f3![0]).toBe('');
    expect(f2![7]).toBe('GERMAN BERNAL');
    expect(f3![7]).toBe('CARLOS CASTRO');
  });

  it('el peso se anota UNA vez por viaje, en la última línea', () => {
    // El peso es del camión, no de la línea: repetirlo en cada fila haría que
    // quien sume la columna facture tres veces la misma carga.
    const csv = cobroToCsv(cuenta([
      viaje(8, 'CUCUTA', 'DON LUIS', 10000, [
        linea('A', 64, 5719.6, 'PERALTEX', 'BOGOTA'),
        linea('B', 32, 3009.8, 'GERMAN BERNAL', 'BOGOTA'),
        linea('C', 35, 3049.1, 'CARLOS CASTRO', 'BOGOTA'),
      ]),
    ]));
    const [, f1, f2, f3] = csv.split('\r\n').map(celdas);
    expect(f1![5]).toBe('');
    expect(f2![5]).toBe('');
    expect(f3![5]).toBe('10000');
  });

  it('el acarreo urbano sale sin rollos ni metros pero con su viaje', () => {
    // Viaje 03 del documento: la columna de peso dice URBANO y no lista carga.
    const csv = cobroToCsv(cuenta([
      viaje(3, 'BOGOTA', 'MADRID', undefined, [], true),
    ]));
    const f = celdas(csv.split('\r\n')[1]!);
    expect(f[0]).toBe('3');
    expect(f[2]).toBe('URBANO');
    expect(f[3]).toBe('');
    expect(f[4]).toBe('');
  });

  it('reproduce el viaje 14 completo: cinco referencias, un solo peso', () => {
    const csv = cobroToCsv(cuenta([
      viaje(14, 'BOGOTA', 'MADRID', 8000, [
        linea('318101', 6, 0, 'LUIS IZQUIERDO', 'BARRANQUILLA'),
        linea('LONA RIGIDA', 12, 1.3, 'LUIS IZQUIERDO', 'BARRANQUILLA'),
        linea('403101', 20, 2058, 'LUIS IZQUIERDO', 'BARRANQUILLA'),
        linea('406301', 59, 6483, 'LUIS IZQUIERDO', 'BARRANQUILLA'),
        linea('404001', 6, 573, 'LUIS IZQUIERDO', 'BARRANQUILLA'),
      ]),
    ]));
    const filas = csv.split('\r\n').slice(1).map(celdas);
    expect(filas).toHaveLength(5);
    expect(filas.map((f) => f[2])).toEqual(['318101', 'LONA RIGIDA', '403101', '406301', '404001']);
    // Los 103 rollos del papel.
    expect(filas.reduce((s, f) => s + Number(f[3]), 0)).toBe(103);
    expect(filas[4]![5]).toBe('8000');
  });

  it('escapa las comillas para no partir la fila', () => {
    const csv = cobroToCsv(cuenta([
      viaje(1, 'BOGOTA', undefined, undefined, [
        linea('REF "A"', 1, 10, 'Bodega "El Salado"', 'CUCUTA'),
      ]),
    ]));
    expect(csv).toContain('""A""');
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});
