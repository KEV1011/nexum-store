import { describe, it, expect } from 'vitest';
import { splitCsvLine, parseProductCsv, csvTemplate } from './product-csv';

const sinExistentes = new Map<string, { id: string; name: string }>();

describe('splitCsvLine', () => {
  it('separa por coma y por punto y coma (Excel en español usa ;)', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(splitCsvLine('a;b;c')).toEqual(['a', 'b', 'c']);
  });

  it('respeta las comas dentro de comillas', () => {
    expect(splitCsvLine('"Arroz, 500g",3500')).toEqual(['Arroz, 500g', '3500']);
  });

  it('entiende la comilla escapada', () => {
    expect(splitCsvLine('"Bolsa ""grande""",1000')).toEqual(['Bolsa "grande"', '1000']);
  });
});

describe('parseProductCsv — clasificación', () => {
  it('con cabecera, lee las filas de datos', () => {
    const csv = [
      'nombre,precio,seccion',
      'Arroz Diana,3500,Granos',
      'Aceite Girasol,12000,Aceites',
    ].join('\n');
    const r = parseProductCsv(csv, sinExistentes);
    expect(r.nuevos).toHaveLength(2);
    expect(r.errores).toHaveLength(0);
    expect(r.nuevos[0]!.nombre).toBe('Arroz Diana');
    expect(r.nuevos[0]!.precio).toBe(3500);
  });

  it('sin cabecera, asume el orden de la plantilla', () => {
    const r = parseProductCsv('Arroz Diana,3500,Granos', sinExistentes);
    expect(r.nuevos).toHaveLength(1);
    expect(r.nuevos[0]!.seccion).toBe('Granos');
  });

  it('separa lo que actualiza de lo que crea, por código de barras', () => {
    const existentes = new Map([['7702001', { id: 'p1', name: 'Arroz viejo' }]]);
    const csv = [
      'nombre,precio,seccion,descripcion,codigo_barras',
      'Arroz Diana,3500,Granos,,7702001',
      'Producto nuevo,1000,Otros,,9999999',
    ].join('\n');
    const r = parseProductCsv(csv, existentes);
    expect(r.actualizaciones).toHaveLength(1);
    expect(r.actualizaciones[0]!.productId).toBe('p1');
    expect(r.actualizaciones[0]!.nombreActual).toBe('Arroz viejo');
    expect(r.nuevos).toHaveLength(1);
  });
});

describe('parseProductCsv — lo que protege el catálogo', () => {
  it('descarta la fila sin nombre y dice en qué línea', () => {
    const csv = ['nombre,precio', ',3500'].join('\n');
    const r = parseProductCsv(csv, sinExistentes);
    expect(r.nuevos).toHaveLength(0);
    expect(r.errores[0]!.linea).toBe(1);
    expect(r.errores[0]!.motivo).toContain('nombre');
  });

  it('descarta precios inválidos en vez de guardar cero', () => {
    const csv = ['nombre,precio', 'Arroz,abc', 'Aceite,0', 'Sal,'].join('\n');
    const r = parseProductCsv(csv, sinExistentes);
    expect(r.nuevos).toHaveLength(0);
    expect(r.errores).toHaveLength(3);
  });

  it('acepta precios con separadores de miles (Excel en Colombia)', () => {
    const csv = ['nombre,precio', 'Arroz,"3.500"', 'Aceite,$12.000'].join('\n');
    const r = parseProductCsv(csv, sinExistentes);
    expect(r.nuevos.map((n) => n.precio)).toEqual([3500, 12000]);
  });

  it('rechaza un código repetido dentro del archivo', () => {
    // Dos filas con el mismo código se pisarían y el resultado dependería del
    // orden: mejor avisar que aplicar algo impredecible.
    const csv = [
      'nombre,precio,seccion,descripcion,codigo_barras',
      'Arroz A,3500,Granos,,7702001',
      'Arroz B,4000,Granos,,7702001',
    ].join('\n');
    const r = parseProductCsv(csv, sinExistentes);
    expect(r.nuevos).toHaveLength(1);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]!.motivo).toContain('repetido');
  });

  it('distingue existencias vacías (no controlar) de cero (agotado)', () => {
    const csv = [
      'nombre,precio,seccion,descripcion,codigo_barras,marca,unidad,existencias',
      'Sin control,1000,X,,,,,',
      'Agotado,1000,X,,,,,0',
    ].join('\n');
    const r = parseProductCsv(csv, sinExistentes);
    expect(r.nuevos[0]!.stock).toBeNull();
    expect(r.nuevos[1]!.stock).toBe(0);
  });

  it('avisa si faltan las columnas obligatorias en vez de importar basura', () => {
    const csv = ['marca,unidad', 'Diana,kg'].join('\n');
    const r = parseProductCsv(csv, sinExistentes);
    expect(r.nuevos).toHaveLength(0);
    expect(r.errores[0]!.motivo).toContain('obligatorias');
  });

  it('un archivo vacío no revienta', () => {
    const r = parseProductCsv('   \n  \n', sinExistentes);
    expect(r.errores).toHaveLength(1);
    expect(r.nuevos).toHaveLength(0);
  });

  it('una fila mala no arrastra a las buenas', () => {
    const csv = [
      'nombre,precio',
      'Bueno 1,1000',
      ',500',
      'Bueno 2,2000',
    ].join('\n');
    const r = parseProductCsv(csv, sinExistentes);
    expect(r.nuevos).toHaveLength(2);
    expect(r.errores).toHaveLength(1);
  });
});

describe('csvTemplate', () => {
  it('la plantilla que se descarga se puede volver a leer', () => {
    const r = parseProductCsv(csvTemplate(), sinExistentes);
    expect(r.errores).toHaveLength(0);
    expect(r.nuevos).toHaveLength(1);
    expect(r.nuevos[0]!.barcode).toBe('7702001234567');
    expect(r.nuevos[0]!.stock).toBe(40);
  });
});
