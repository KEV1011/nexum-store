import { describe, it, expect } from 'vitest';
import {
  resolverOpciones,
  sanearNota,
  OpcionInvalidaError,
  MAX_NOTA,
  type GrupoCatalogo,
} from './order-options';

// Una pizza como la armaría un restaurante de verdad: el tamaño es
// obligatorio y de selección única, las adiciones son libres hasta tres, y
// quitar ingredientes no cuesta nada.
const CARTA: GrupoCatalogo[] = [
  {
    id: 'g-tam', name: 'Tamaño', required: true, minSelect: 1, maxSelect: 1,
    options: [
      { id: 'personal', name: 'Personal', priceDelta: 0, isAvailable: true },
      { id: 'mediana', name: 'Mediana', priceDelta: 6000, isAvailable: true },
      { id: 'grande', name: 'Grande', priceDelta: 12000, isAvailable: true },
    ],
  },
  {
    id: 'g-adi', name: 'Adiciones', required: false, minSelect: 0, maxSelect: 3,
    options: [
      { id: 'queso', name: 'Extra queso', priceDelta: 4000, isAvailable: true },
      { id: 'peperoni', name: 'Peperoni', priceDelta: 5000, isAvailable: false },
      { id: 'champi', name: 'Champiñones', priceDelta: 3500, isAvailable: true },
      { id: 'tocineta', name: 'Tocineta', priceDelta: 4500, isAvailable: true },
      { id: 'maiz', name: 'Maíz', priceDelta: 2000, isAvailable: true },
    ],
  },
  {
    id: 'g-qui', name: 'Quitar', required: false, minSelect: 0, maxSelect: 5,
    options: [
      { id: 'sin-cebolla', name: 'Sin cebolla', priceDelta: 0, isAvailable: true },
      { id: 'sin-oregano', name: 'Sin orégano', priceDelta: 0, isAvailable: true },
    ],
  },
];

describe('resolverOpciones', () => {
  it('cobra la suma exacta de los recargos del catálogo', () => {
    const r = resolverOpciones(CARTA, ['grande', 'queso', 'champi'], 'Pizza');
    expect(r.recargo).toBe(12000 + 4000 + 3500);
  });

  it('compone el resumen en el orden de la carta, no en el que llegó', () => {
    // El cliente tocó adiciones antes que tamaño; la cocina debe leerlo igual
    // que cualquier otra vez para el mismo plato.
    const a = resolverOpciones(CARTA, ['queso', 'grande', 'sin-cebolla'], 'Pizza');
    const b = resolverOpciones(CARTA, ['sin-cebolla', 'grande', 'queso'], 'Pizza');
    expect(a.resumen).toBe('Grande · +Extra queso · Sin cebolla');
    expect(a.resumen).toBe(b.resumen);
  });

  it('marca con + solo lo que cuesta, para que la cocina distinga adición de quitar', () => {
    const r = resolverOpciones(CARTA, ['personal', 'sin-oregano'], 'Pizza');
    expect(r.resumen).toBe('Personal · Sin orégano');
  });

  it('rechaza una opción que el negocio acaba de agotar', () => {
    // El caso real: el dueño apaga el peperoni y el cliente tiene la carta
    // abierta desde hace diez minutos.
    expect(() => resolverOpciones(CARTA, ['grande', 'peperoni'], 'Pizza'))
      .toThrow(OpcionInvalidaError);
    expect(() => resolverOpciones(CARTA, ['grande', 'peperoni'], 'Pizza'))
      .toThrow(/Se acabó Peperoni/);
  });

  it('exige el grupo obligatorio', () => {
    expect(() => resolverOpciones(CARTA, ['queso'], 'Pizza'))
      .toThrow(/Elige tamaño para Pizza/);
  });

  it('trata required como mínimo 1 aunque minSelect venga en cero', () => {
    // El portal puede dejar esa combinación; obligatorio significa obligatorio.
    const raro: GrupoCatalogo[] = [{ ...CARTA[0]!, minSelect: 0 }];
    expect(() => resolverOpciones(raro, [], 'Pizza')).toThrow(/Elige tamaño/);
  });

  it('respeta el máximo de selecciones del grupo', () => {
    expect(() => resolverOpciones(CARTA, ['grande', 'queso', 'champi', 'tocineta', 'maiz'], 'Pizza'))
      .toThrow(/hasta 3/);
  });

  it('exige el mínimo cuando el grupo pide varios', () => {
    const combo: GrupoCatalogo[] = [{
      id: 'g', name: 'Elige 2 bebidas', required: true, minSelect: 2, maxSelect: 2,
      options: [
        { id: 'a', name: 'Gaseosa', priceDelta: 0, isAvailable: true },
        { id: 'b', name: 'Jugo', priceDelta: 0, isAvailable: true },
      ],
    }];
    expect(() => resolverOpciones(combo, ['a'], 'Combo')).toThrow(/al menos 2/);
    expect(resolverOpciones(combo, ['a', 'b'], 'Combo').recargo).toBe(0);
  });

  it('rechaza una opción que no pertenece al producto', () => {
    // Petición manipulada, o la carta cambió bajo los pies del cliente.
    expect(() => resolverOpciones(CARTA, ['grande', 'opcion-de-otro-plato'], 'Pizza'))
      .toThrow(/cambiaron/);
  });

  it('sin opciones elegidas ni grupos obligatorios, no cobra ni resume', () => {
    const sueltos: GrupoCatalogo[] = [CARTA[1]!];
    const r = resolverOpciones(sueltos, [], 'Gaseosa');
    expect(r).toEqual({ recargo: 0, resumen: null, ids: [] });
  });

  it('admite un recargo negativo: quitar puede descontar', () => {
    const conDescuento: GrupoCatalogo[] = [{
      id: 'g', name: 'Acompañamiento', required: false, minSelect: 0, maxSelect: 1,
      options: [{ id: 'sin-papas', name: 'Sin papas', priceDelta: -2000, isAvailable: true }],
    }];
    const r = resolverOpciones(conDescuento, ['sin-papas'], 'Hamburguesa');
    expect(r.recargo).toBe(-2000);
    expect(r.resumen).toBe('Sin papas');
  });

  it('ignora ids repetidos: elegir dos veces lo mismo no se cobra dos veces', () => {
    const r = resolverOpciones(CARTA, ['grande', 'queso', 'queso'], 'Pizza');
    expect(r.recargo).toBe(16000);
    expect(r.ids).toEqual(['grande', 'queso']);
  });
});

describe('sanearNota', () => {
  it('conserva lo que el cliente escribió', () => {
    expect(sanearNota('Sin cebolla, bien cocida')).toBe('Sin cebolla, bien cocida');
  });

  it('junta espacios y saltos de línea', () => {
    expect(sanearNota('  sin   cebolla\n\npor favor ')).toBe('sin cebolla por favor');
  });

  it('recorta en vez de rechazar: perder el pedido sería peor', () => {
    const larga = 'a'.repeat(MAX_NOTA + 60);
    expect(sanearNota(larga)).toHaveLength(MAX_NOTA);
  });

  it('devuelve null si no hay nada que decir', () => {
    expect(sanearNota('   ')).toBeNull();
    expect(sanearNota(undefined)).toBeNull();
    expect(sanearNota(42)).toBeNull();
  });
});
