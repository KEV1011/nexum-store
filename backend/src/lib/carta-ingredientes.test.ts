/**
 * Los ingredientes de CADA plato, tal como los escribe una carta impresa.
 *
 * EL REPORTE: «ahora no está leyendo los ingredientes que trae cada plato».
 * Al enseñarle al lector lo que traen TODOS los platos de una sección («Todos
 * nuestros sándwiches van acompañados de…»), los renglones de un solo plato
 * que empiezan igual —«Acompañada de papa a la francesa y ensalada»,
 * «Incluye papa y gaseosa»— pasaron a ser notas de la sección y se le pegaban
 * a todos. Y otras formas comunes nunca se habían leído: los ingredientes sin
 * comas, con un punto en medio, entre el nombre y el precio, o tras un guion.
 */
import { describe, expect, it } from 'vitest';

import { parsearCarta, parsearCartaMedida } from './carta-foto';
import { sugerirVariantes } from './carta-variantes';
import { separarDescripcion } from './nombre-y-descripcion';

const platos = (texto: string) =>
  parsearCarta(texto).lineas.map((l) => ({ n: l.nombre, p: l.precio, d: l.descripcion ?? null }));

describe('el renglón de debajo es la descripción de ESE plato', () => {
  it.each([
    ['con comas', 'Carne de res, queso, lechuga y tomate'],
    ['sin comas', 'Carne de res 150 g con queso y vegetales'],
    ['con un punto en medio', 'Salchicha, cebolla, papa ripio. Salsas de la casa'],
    ['«Acompañada de …»', 'Acompañada de papa a la francesa y ensalada'],
    ['«Incluye …»', 'Incluye papa a la francesa y gaseosa'],
    ['«Servidas con …»', 'Servidas con papa criolla y ensalada'],
    ['«Con …»', 'Con carne, pollo, queso, tocineta y huevo'],
  ])('%s', (_caso, ingredientes) => {
    const r = parsearCarta(`ASADOS\nCostillas BBQ 26.000\n${ingredientes}\nPechuga 19.000`);
    expect(r.lineas.map((l) => ({ n: l.nombre, d: l.descripcion ?? null }))).toEqual([
      { n: 'Costillas BBQ', d: ingredientes },
      { n: 'Pechuga', d: null },
    ]);
    // Y NO como nota de la sección: eso se le pegaba también a la pechuga.
    expect(r.notas).toEqual([]);
    expect(r.lineas.every((l) => !l.aviso)).toBe(true);
  });

  it('cada plato se queda con los suyos', () => {
    expect(platos([
      'HAMBURGUESAS',
      'Hamburguesa sencilla 15.000',
      'Carne de res, queso, lechuga y tomate',
      'Hamburguesa ranchera 20.000',
      'Incluye papa a la francesa y gaseosa',
      'Hamburguesa doble 22.000',
      'Doble carne, doble queso, tocineta',
    ].join('\n'))).toEqual([
      { n: 'Hamburguesa sencilla', p: 15000, d: 'Carne de res, queso, lechuga y tomate' },
      { n: 'Hamburguesa ranchera', p: 20000, d: 'Incluye papa a la francesa y gaseosa' },
      { n: 'Hamburguesa doble', p: 22000, d: 'Doble carne, doble queso, tocineta' },
    ]);
  });

  it('lo que habla de TODA la sección sigue siendo una nota, aunque caiga bajo un plato', () => {
    const r = parsearCarta('SÁNDWICHES\nSandwich criollo 19.000\nTodos van acompañados de papa a la francesa');
    expect(r.lineas[0]!.descripcion).toBeUndefined();
    expect(r.notas.map((n) => n.texto)).toEqual(['Acompañado de papa a la francesa']);
  });
});

describe('lo que NO es la descripción del de arriba', () => {
  it('el siguiente plato sin precio (empieza igual) no se esconde como descripción', () => {
    const r = parsearCarta('HAMBURGUESAS\nHamburguesa sencilla 15.000\nHamburguesa doble con queso\nHamburguesa triple 25.000');
    expect(r.lineas[0]!.descripcion).toBeUndefined();
    // Sigue a la vista —como fila o como título— para que el dueño lo vea.
    expect([...r.secciones, ...r.lineas.map((l) => l.nombre)]).toContain('Hamburguesa doble con queso');
  });

  it.each([
    ['gritado', 'BEBIDAS'],
    ['con dos puntos', 'Bebidas:'],
    ['una sola palabra', 'Bebidas'],
    ['plural de sección', 'Jugos naturales en agua'],
  ])('el título de la siguiente sección (%s)', (_caso, titulo) => {
    const r = parsearCarta(`PERROS\nPerro sencillo 9.000\n${titulo}\nTinto 2.000`);
    expect(r.lineas[0]!.descripcion).toBeUndefined();
    expect(r.secciones).toHaveLength(2);
    expect(r.lineas[1]).toMatchObject({ nombre: 'Tinto', seccion: r.secciones[1] });
  });

  it('un renglón no se pega en cadena: el plato ya tiene descripción', () => {
    const r = parsearCarta('ASADOS\nPechuga 19.000\nAcompañada de papa y ensalada\nLomo de cerdo en salsa de la casa');
    expect(r.lineas[0]!.descripcion).toBe('Acompañada de papa y ensalada');
    expect(r.lineas[1]).toMatchObject({ nombre: 'Lomo de cerdo en salsa de la casa', precio: null });
  });
});

describe('nombre, ingredientes y precio en tres renglones', () => {
  it('el precio va al NOMBRE y los ingredientes a su descripción', () => {
    const r = parsearCarta([
      'PLATOS FUERTES',
      'Bandeja paisa',
      'Frijoles, arroz, carne molida, chicharrón, huevo, arepa y plátano',
      '28.000',
      'Churrasco',
      'Carne de res 300 g acompañado de papa a la francesa y ensalada',
      '32.000',
    ].join('\n'));
    // Antes: «Bandeja paisa» y «Churrasco» eran SECCIONES y los platos se
    // llamaban como sus ingredientes.
    expect(r.secciones).toEqual(['Platos fuertes']);
    expect(r.lineas.map((l) => ({ n: l.nombre, p: l.precio, d: l.descripcion }))).toEqual([
      { n: 'Bandeja paisa', p: 28000, d: 'Frijoles, arroz, carne molida, chicharrón, huevo, arepa y plátano' },
      { n: 'Churrasco', p: 32000, d: 'Carne de res 300 g acompañado de papa a la francesa y ensalada' },
    ]);
  });

  it('bajo un TÍTULO no se mueve el precio: el renglón con comas es el plato', () => {
    const r = parsearCarta('PLATOS FUERTES\nArroz con pollo, ensalada y papas\n18.000');
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]).toMatchObject({ precio: 18000, seccion: 'Platos fuertes' });
  });

  it('el nombre-precio de siempre (dos renglones) sigue igual', () => {
    expect(platos('ASADOS\nCarne asada\n21.000')).toEqual([{ n: 'Carne asada', p: 21000, d: null }]);
  });

  it('con la geometría: columnas distintas no se mezclan', () => {
    const r = parsearCartaMedida([
      { texto: 'Bandeja paisa', alto: 10, columna: 0 },
      { texto: 'Frijoles, arroz, chicharrón y huevo', alto: 8, columna: 0 },
      { texto: '28.000', alto: 10, columna: 1 },
    ], 10, (alto, cuerpo) => alto > cuerpo * 1.3);
    expect(r.lineas.find((l) => l.precio === 28000)).toBeUndefined();
  });

  it('con la geometría: la letra del cuerpo no se toma por título', () => {
    const r = parsearCartaMedida([
      { texto: 'ASADOS', alto: 16 },
      { texto: 'Pechuga a la plancha 19.000', alto: 10 },
      { texto: 'Pollo y papas', alto: 10 },
      { texto: 'Lomo 24.000', alto: 10 },
    ], 10, (alto, cuerpo) => alto > cuerpo * 1.3);
    expect(r.lineas[0]).toMatchObject({ nombre: 'Pechuga a la plancha', descripcion: 'Pollo y papas' });
  });
});

describe('ingredientes en el mismo renglón, tras un guion', () => {
  it.each([
    ['Sandwich de pollo - pollo desmechado, queso, lechuga', 'Sandwich de pollo', 'pollo desmechado, queso, lechuga'],
    ['Hamburguesa – carne de res con queso y tocineta', 'Hamburguesa', 'carne de res con queso y tocineta'],
  ])('«%s»', (crudo, nombre, descripcion) => {
    expect(separarDescripcion(crudo)).toEqual({ nombre, descripcion });
  });

  it.each(['Coca-Cola 400 ml', 'Pollo ají-limón', 'Picada - grande'])('«%s» no se parte', (crudo) => {
    expect(separarDescripcion(crudo).descripcion).toBeUndefined();
  });
});

describe('los tamaños del mismo plato conservan sus ingredientes', () => {
  it('la picada en dos tamaños sale con lo que trae', () => {
    const carta = parsearCarta([
      'PICADAS',
      'Picada pequeña 39.000',
      'Res, cerdo, chorizo, papa criolla y arepa',
      'Picada grande 80.000',
    ].join('\n'));
    const [v] = sugerirVariantes(carta.lineas);
    expect(v).toMatchObject({ nombre: 'Picada', descripcion: 'Res, cerdo, chorizo, papa criolla y arepa' });
  });
});

describe('la descripción que empieza como el plato (reporte del 20 de octubre)', () => {
  it('«ARROZ CON CAMARONES» y debajo «Arroz de la casa preparado…» es SU descripción', () => {
    const r = parsearCarta([
      'ESPAGUETI CON POLLO 39.000',
      'Pasta larga bañada en salsa con pollo. Acompañado de papas a la francesa.',
      'PAELLA DE LA CASA 72.000',
      'Arroz de la casa preparado con frutos del mar, langostino y mejillones, acompañado de papas a la francesa',
      'ARROZ CON CAMARONES 59.000',
      'Arroz de la casa preparado con vegetales y camarones',
      'ARROZ CON POLLO 45.000',
      'Arroz de la casa con pollo desmechado y vegetales',
    ].join('\n'));
    expect(r.lineas.map((l) => ({ n: l.nombre, p: l.precio, d: l.descripcion ?? null }))).toEqual([
      { n: 'ESPAGUETI CON POLLO', p: 39000, d: 'Pasta larga bañada en salsa con pollo. Acompañado de papas a la francesa.' },
      { n: 'PAELLA DE LA CASA', p: 72000, d: 'Arroz de la casa preparado con frutos del mar, langostino y mejillones, acompañado de papas a la francesa' },
      { n: 'ARROZ CON CAMARONES', p: 59000, d: 'Arroz de la casa preparado con vegetales y camarones' },
      { n: 'ARROZ CON POLLO', p: 45000, d: 'Arroz de la casa con pollo desmechado y vegetales' },
    ]);
    expect(r.lineas.every((l) => !l.aviso)).toBe(true);
  });

  it.each([
    ['escrita distinto que el nombre', 'ARROZ CON CAMARONES 59.000', 'Arroz con vegetales'],
    ['mucho más larga', 'Arroz con camarones 59.000', 'Arroz blanco con camarones y vegetales salteados'],
    ['con un verbo de preparación', 'Arroz marinero 59.000', 'Arroz preparado al wok'],
  ])('%s', (_caso, plato, debajo) => {
    const r = parsearCarta(`${plato}\n${debajo}\nCazuela 40.000`);
    expect(r.lineas[0]!.descripcion).toBe(debajo);
    expect(r.lineas.map((l) => l.nombre)).toHaveLength(2);
  });

  it('el siguiente plato con la MISMA forma sigue sin esconderse', () => {
    const r = parsearCarta('ARROCES\nArroz con pollo 45.000\nArroz con camarones\nArroz marinero 60.000');
    expect(r.lineas[0]!.descripcion).toBeUndefined();
    expect([...r.secciones, ...r.lineas.map((l) => l.nombre)]).toContain('Arroz con camarones');
  });
});
