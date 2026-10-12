import { describe, expect, it } from 'vitest';

import { motivoParaNoAgrupar as enElServidor } from './carta-variantes';
import {
  MAX_TAMANOS as MAX_PORTAL,
  motivoParaNoAgrupar as enElPortal,
  varianteParaEnviar,
} from '../../../app/variantes-carta';
import { MAX_TAMANOS } from './carta-variantes';

/**
 * El portal y el servidor deciden lo MISMO sobre una variante.
 *
 * Por qué hay dos copias: el portal es otro servicio y no puede importar de
 * `backend/src`. Se prueba desde aquí porque es donde corre vitest y el fichero
 * de `app/` es TypeScript puro, igual que `moneda-portal.test.ts`.
 *
 * Lo que impide: que el botón «Crear» se habilite para algo que el servidor va
 * a rechazar. El dueño acaba de revisar cuarenta platos de su carta y lo
 * perdería en un error que no entiende.
 */
describe('el portal y el servidor dicen lo mismo', () => {
  const casos: Array<{ que: string; v: Parameters<typeof enElServidor>[0] }> = [
    {
      que: 'una variante completa',
      v: {
        nombre: 'Picada', grupo: 'Tamaño', precioBase: 39000,
        opciones: [
          { nombre: 'Pequeña', precioDelta: 0 },
          { nombre: 'Grande', precioDelta: 41000 },
        ],
      },
    },
    { que: 'sin nombre del plato', v: { nombre: '   ', grupo: 'Tamaño', precioBase: 1, opciones: [] } },
    {
      que: 'sin nombre del grupo',
      v: { nombre: 'Picada', grupo: '', precioBase: 39000, opciones: [
        { nombre: 'A', precioDelta: 0 }, { nombre: 'B', precioDelta: 1 }] },
    },
    {
      que: 'con un solo tamaño',
      v: { nombre: 'Picada', grupo: 'Tamaño', precioBase: 39000, opciones: [{ nombre: 'A', precioDelta: 0 }] },
    },
    {
      que: `con ${MAX_TAMANOS + 1} tamaños`,
      v: {
        nombre: 'Picada', grupo: 'Tamaño', precioBase: 1000,
        opciones: Array.from({ length: MAX_TAMANOS + 1 }, (_, i) => ({
          nombre: `T${i}`, precioDelta: i * 100,
        })),
      },
    },
    {
      que: 'sin precio base',
      v: { nombre: 'Picada', grupo: 'Tamaño', precioBase: 0, opciones: [
        { nombre: 'A', precioDelta: 0 }, { nombre: 'B', precioDelta: 1 }] },
    },
    {
      que: 'con un tamaño sin nombre',
      v: { nombre: 'Picada', grupo: 'Tamaño', precioBase: 39000, opciones: [
        { nombre: '', precioDelta: 0 }, { nombre: 'B', precioDelta: 1 }] },
    },
    {
      que: 'con dos tamaños que se llaman igual salvo tildes',
      v: { nombre: 'Picada', grupo: 'Tamaño', precioBase: 39000, opciones: [
        { nombre: 'Pequeña', precioDelta: 0 }, { nombre: 'PEQUENA', precioDelta: 1000 }] },
    },
    {
      que: 'con un recargo negativo',
      v: { nombre: 'Picada', grupo: 'Tamaño', precioBase: 39000, opciones: [
        { nombre: 'A', precioDelta: -1 }, { nombre: 'B', precioDelta: 0 }] },
    },
  ];

  for (const { que, v } of casos) {
    it(`coinciden: ${que}`, () => {
      expect(enElPortal(v)).toBe(enElServidor(v));
    });
  }

  it('el tope de tamaños es el mismo número en los dos lados', () => {
    expect(MAX_PORTAL).toBe(MAX_TAMANOS);
  });
});

describe('lo que el dueño teclea se convierte sin poder equivocarse', () => {
  it('el precio base sale del tamaño MÁS BARATO, lo teclee en el orden que lo teclee', () => {
    // El formulario pide el precio de cada tamaño, no «base + recargo»: así un
    // recargo negativo no se puede escribir.
    const salida = varianteParaEnviar({
      nombre: ' Picada ',
      seccion: 'Picadas',
      grupo: 'Tamaño',
      opciones: [
        { nombre: 'Grande', precio: '80.000' },
        { nombre: 'Pequeña', precio: '39000' },
        { nombre: 'Mediana', precio: '$46.000' },
      ],
    });
    expect(salida.nombre).toBe('Picada');
    expect(salida.precioBase).toBe(39000);
    expect(salida.opciones).toEqual([
      { nombre: 'Pequeña', precioDelta: 0 },
      { nombre: 'Mediana', precioDelta: 7000 },
      { nombre: 'Grande', precioDelta: 41000 },
    ]);
    expect(enElServidor(salida)).toBeNull();
  });

  it('un tamaño sin precio no viaja', () => {
    const salida = varianteParaEnviar({
      nombre: 'Jugo',
      seccion: 'Bebidas',
      grupo: 'Tamaño',
      opciones: [
        { nombre: 'Pequeño', precio: '5000' },
        { nombre: 'Grande', precio: '' },
      ],
    });
    // Queda con uno solo, y por eso el servidor la rechaza: el dueño ve que
    // le falta un precio en vez de crear un grupo con un único tamaño.
    expect(salida.opciones).toHaveLength(1);
    expect(enElServidor(salida)).toMatch(/al menos dos/i);
  });
});
