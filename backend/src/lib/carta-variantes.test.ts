import { describe, expect, it } from 'vitest';
import type { LineaCarta } from './carta-foto';
import {
  GRUPO_TAMANO,
  MAX_TAMANOS,
  motivoParaNoAgrupar,
  sugerirVariantes,
  trocearTamano,
} from './carta-variantes';

/** Una línea de la carta, como la devuelve el lector. */
function fila(
  linea: number,
  nombre: string,
  precio: number | null,
  seccion = 'Picadas',
  precios?: number[],
): LineaCarta {
  return { linea, nombre, precio, seccion, ...(precios && { precios }) };
}

describe('separar el plato de su tamaño', () => {
  it('reconoce la palabra al final', () => {
    expect(trocearTamano('Picada grande')).toEqual({ base: 'Picada', etiqueta: 'grande' });
  });

  it('también al principio', () => {
    expect(trocearTamano('Media torta')).toEqual({ base: 'torta', etiqueta: 'Media' });
  });

  it('conserva la ñ y las tildes del tamaño', () => {
    // `tokenLimpio` las quita para poder comparar; si se usara ese valor para
    // mostrar, el tamaño saldría escrito «Pequena».
    expect(trocearTamano('Picada PEQUEÑA')?.etiqueta).toBe('PEQUEÑA');
  });

  it('entiende la medida con y sin espacio', () => {
    expect(trocearTamano('Jugo 350 ml')).toEqual({ base: 'Jugo', etiqueta: '350ml' });
    expect(trocearTamano('Jugo 350ml')).toEqual({ base: 'Jugo', etiqueta: '350ml' });
    expect(trocearTamano('Gaseosa 1.5 lt')?.etiqueta).toBe('1.5lt');
  });

  it('entiende las fracciones del asadero', () => {
    // «1/4 de pollo» tiene que acabar casando con «Pollo entero»: el «de» que
    // queda colgando se quita, o serían dos platos distintos.
    expect(trocearTamano('1/4 de pollo')).toEqual({ base: 'pollo', etiqueta: '1/4' });
    expect(trocearTamano('1/2 pollo')).toEqual({ base: 'pollo', etiqueta: '1/2' });
    expect(trocearTamano('Pollo entero')).toEqual({ base: 'Pollo', etiqueta: 'entero' });
  });

  it('quita los paréntesis que envolvían el tamaño', () => {
    expect(trocearTamano('Picada (grande)')).toEqual({ base: 'Picada', etiqueta: 'grande' });
  });

  it('sin palabra de tamaño devuelve null', () => {
    expect(trocearTamano('Hamburguesa con queso')).toBeNull();
    expect(trocearTamano('Cerveza Poker')).toBeNull();
  });

  it('si solo queda el tamaño, devuelve null', () => {
    // «Grande 8.000» no dice de qué. Agruparlo bautizaría el producto con el
    // nombre de la sección.
    expect(trocearTamano('Grande')).toBeNull();
    expect(trocearTamano('1/2')).toBeNull();
  });
});

describe('A — el mismo plato escrito varias veces', () => {
  const picadas = [
    fila(1, 'Picada pequeña', 39000),
    fila(2, 'Picada mediana', 46000),
    fila(3, 'Picada grande', 80000),
  ];

  it('las agrupa en un producto con sus tres tamaños', () => {
    const [v] = sugerirVariantes(picadas);
    expect(v?.nombre).toBe('Picada');
    expect(v?.grupo).toBe(GRUPO_TAMANO);
    expect(v?.lineas).toEqual([1, 2, 3]);
    expect(v?.faltanNombres).toBe(false);
    expect(v?.opciones.map((o) => o.nombre)).toEqual(['pequeña', 'mediana', 'grande']);
  });

  it('el precio base es el MENOR y los recargos salen de ahí', () => {
    const [v] = sugerirVariantes(picadas);
    expect(v?.precioBase).toBe(39000);
    expect(v?.opciones.map((o) => o.precioDelta)).toEqual([0, 7000, 41000]);
  });

  it('el precio base sigue siendo el menor aunque la carta liste la grande primero', () => {
    // LA REGLA QUE MÁS IMPORTA. Tomar «el primero que aparece» daría recargos
    // negativos: el precio de la lista sería el caro, la opción pequeña sería
    // un descuento y la app no diría «Desde».
    const alReves = [
      fila(1, 'Picada grande', 80000),
      fila(2, 'Picada pequeña', 39000),
    ];
    const [v] = sugerirVariantes(alReves);
    expect(v?.precioBase).toBe(39000);
    expect(v?.opciones.every((o) => o.precioDelta >= 0)).toBe(true);
    expect(v?.opciones.map((o) => o.nombre)).toEqual(['pequeña', 'grande']);
  });

  it('destapa el grito de la carta impresa', () => {
    const [v] = sugerirVariantes([
      fila(1, 'PICADA PEQUEÑA', 39000),
      fila(2, 'PICADA GRANDE', 80000),
    ]);
    expect(v?.nombre).toBe('Picada');
    expect(v?.opciones.map((o) => o.nombre)).toEqual(['Pequeña', 'Grande']);
  });

  it('agrupa por medida y por fracción', () => {
    const jugos = sugerirVariantes([
      fila(1, 'Jugo de mora 350 ml', 4000, 'Bebidas'),
      fila(2, 'Jugo de mora 1 lt', 9000, 'Bebidas'),
    ]);
    expect(jugos[0]?.nombre).toBe('Jugo de mora');
    expect(jugos[0]?.opciones.map((o) => o.nombre)).toEqual(['350ml', '1lt']);

    const pollos = sugerirVariantes([
      fila(1, '1/4 de pollo', 12000, 'Asados'),
      fila(2, '1/2 pollo', 22000, 'Asados'),
      fila(3, 'Pollo entero', 40000, 'Asados'),
    ]);
    expect(pollos[0]?.opciones.map((o) => o.nombre)).toEqual(['1/4', '1/2', 'entero']);
    expect(pollos[0]?.precioBase).toBe(12000);
  });

  it('NO agrupa platos de secciones distintas', () => {
    expect(
      sugerirVariantes([
        fila(1, 'Combo pequeño', 10000, 'Hamburguesas'),
        fila(2, 'Combo grande', 18000, 'Perros'),
      ]),
    ).toEqual([]);
  });

  it('NO agrupa dos filas con el mismo tamaño', () => {
    // O el lector repitió la línea, o son dos platos distintos: un grupo con
    // dos opciones «Grande» deja al cliente eligiendo entre dos idénticas.
    expect(
      sugerirVariantes([
        fila(1, 'Picada grande', 39000),
        fila(2, 'Picada GRANDE', 46000),
      ]),
    ).toEqual([]);
  });

  it('NO agrupa si todos cuestan lo mismo', () => {
    expect(
      sugerirVariantes([
        fila(1, 'Picada pequeña', 39000),
        fila(2, 'Picada grande', 39000),
      ]),
    ).toEqual([]);
  });

  it('NO agrupa cuando a una fila le falta la palabra de tamaño', () => {
    // Juntarlas obligaría a bautizar la primera («Normal»), y eso es
    // inventarle al dueño un tamaño que su carta no escribe.
    expect(
      sugerirVariantes([
        fila(1, 'Picada', 39000),
        fila(2, 'Picada familiar', 80000),
      ]),
    ).toEqual([]);
  });

  it('NO agrupa platos que solo comparten una palabra', () => {
    expect(
      sugerirVariantes([
        fila(1, 'Pizza personal hawaiana', 18000),
        fila(2, 'Pizza personal pepperoni', 19000),
      ]),
    ).toEqual([]);
  });

  it(`NO agrupa más de ${MAX_TAMANOS} tamaños`, () => {
    const muchas = ['pequeña', 'mediana', 'grande', 'familiar', 'jumbo', 'personal', 'mini']
      .map((t, i) => fila(i + 1, `Picada ${t}`, 10000 + i * 1000));
    expect(muchas).toHaveLength(MAX_TAMANOS + 1);
    expect(sugerirVariantes(muchas)).toEqual([]);
  });

  it('ignora las filas sin precio', () => {
    expect(
      sugerirVariantes([
        fila(1, 'Picada pequeña', null),
        fila(2, 'Picada grande', 80000),
      ]),
    ).toEqual([]);
  });

  it('devuelve las sugerencias en el orden del papel', () => {
    const v = sugerirVariantes([
      fila(1, 'Jugo 350 ml', 4000, 'Bebidas'),
      fila(2, 'Picada pequeña', 39000),
      fila(3, 'Jugo 1 lt', 9000, 'Bebidas'),
      fila(4, 'Picada grande', 80000),
    ]);
    expect(v.map((x) => x.nombre)).toEqual(['Jugo', 'Picada']);
  });
});

describe('B — una línea con varios precios', () => {
  it('propone el grupo con los tamaños SIN nombre', () => {
    // Los precios los dice la carta; cómo se llama cada tamaño, no. Nombrarlos
    // nosotros («Opción 1») sería inventar.
    const [v] = sugerirVariantes([fila(1, 'Picada', null, 'Picadas', [39000, 46000, 80000])]);
    expect(v?.nombre).toBe('Picada');
    expect(v?.faltanNombres).toBe(true);
    expect(v?.precioBase).toBe(39000);
    expect(v?.opciones.map((o) => o.nombre)).toEqual(['', '', '']);
    expect(v?.opciones.map((o) => o.precioDelta)).toEqual([0, 7000, 41000]);
  });

  it('ordena los precios de menor a mayor aunque la carta no', () => {
    const [v] = sugerirVariantes([fila(1, 'Jugo', null, 'Bebidas', [7000, 5000])]);
    expect(v?.opciones.map((o) => o.precio)).toEqual([5000, 7000]);
  });

  it('no propone nada si el mismo número está repetido', () => {
    expect(sugerirVariantes([fila(1, 'Jugo', null, 'Bebidas', [5000, 5000])])).toEqual([]);
  });

  it('no propone nada con una columna entera mal leída', () => {
    const muchos = [10000, 11000, 12000, 13000, 14000, 15000, 16000];
    expect(muchos.length).toBeGreaterThan(MAX_TAMANOS);
    expect(sugerirVariantes([fila(1, 'Picada', null, 'Picadas', muchos)])).toEqual([]);
  });

  it('no toca una fila que SÍ tiene precio', () => {
    const v = sugerirVariantes([fila(1, 'Picada', 39000, 'Picadas', [39000, 80000])]);
    expect(v).toEqual([]);
  });
});

describe('cuándo una variante no se puede crear', () => {
  const buena = {
    nombre: 'Picada',
    grupo: 'Tamaño',
    precioBase: 39000,
    opciones: [
      { nombre: 'Pequeña', precioDelta: 0 },
      { nombre: 'Grande', precioDelta: 41000 },
    ],
  };

  it('la buena pasa', () => {
    expect(motivoParaNoAgrupar(buena)).toBeNull();
  });

  it('sin nombre del plato', () => {
    expect(motivoParaNoAgrupar({ ...buena, nombre: '  ' })).toMatch(/cómo se llama el plato/i);
  });

  it('sin nombre del grupo', () => {
    expect(motivoParaNoAgrupar({ ...buena, grupo: '' })).toMatch(/grupo/i);
  });

  it('con un solo tamaño', () => {
    expect(motivoParaNoAgrupar({ ...buena, opciones: [buena.opciones[0]!] }))
      .toMatch(/al menos dos/i);
  });

  it('con un tamaño sin nombre', () => {
    expect(
      motivoParaNoAgrupar({
        ...buena,
        opciones: [{ nombre: '', precioDelta: 0 }, { nombre: 'Grande', precioDelta: 41000 }],
      }),
    ).toMatch(/nombre a cada tamaño/i);
  });

  it('con dos tamaños que se llaman igual', () => {
    expect(
      motivoParaNoAgrupar({
        ...buena,
        opciones: [{ nombre: 'Grande', precioDelta: 0 }, { nombre: 'GRANDE', precioDelta: 1000 }],
      }),
    ).toMatch(/se llaman igual/i);
  });

  it('con un recargo negativo', () => {
    // Es la forma en que llegaría un precio base que no es el más barato.
    expect(
      motivoParaNoAgrupar({
        ...buena,
        opciones: [{ nombre: 'Pequeña', precioDelta: -5000 }, { nombre: 'Grande', precioDelta: 0 }],
      }),
    ).toMatch(/más barato/i);
  });

  it('sin precio base', () => {
    expect(motivoParaNoAgrupar({ ...buena, precioBase: 0 })).toMatch(/precio/i);
  });
});
