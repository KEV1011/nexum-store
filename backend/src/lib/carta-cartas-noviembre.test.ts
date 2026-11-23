/**
 * Las cuatro cartas del reporte del 23 de noviembre, leídas de punta a punta,
 * y las guardas de lo que NO debe cambiar con lo que se añadió para leerlas.
 *
 * LO QUE SALÍA, medido antes de tocar nada:
 *   - Pizzería: las tres columnas en una (los ingredientes de tres pizzas en
 *     el mismo renglón), cada celda de la cabecera como sección («Pequeña»,
 *     «8 porciones») con un producto llamado «$25.000», cada sabor como una
 *     sección y sus ingredientes como platos sin precio.
 *   - Postres: «Mousse • Brownie» sin precio y «$16.000 $9.000» como
 *     producto; «pistachos $16.000» con «Croissant de» suelto; el tercer
 *     croissant en la columna de otra lista.
 *   - Panes: «(6 - 8 porciones)» se quedaba con el precio y el nombre sin él.
 *   - Pastas: el plato grande como sección y su último renglón de
 *     descripción como producto; la presentación de la sección como plato;
 *     «Espagueti | Fettuccine» como un plato; «Bolognesa» y «Calentao»
 *     «corregidos».
 */
import { describe, expect, it } from 'vitest';

import { altoDelCuerpo, bandasDeColumna, esTituloPorTamano, lineasDeLaFoto, palabrasDeRespuestaVision } from './carta-geometria';
import { celdasDeTamano, parsearCarta, parsearCartaMedida, unirNombresPartidos, type CartaLeida } from './carta-foto';
import { sugerirVariantes } from './carta-variantes';
import {
  CARTA_CASA_PIZZA,
  CARTA_SABLEE_PANES,
  CARTA_SABLEE_PASTAS,
  CARTA_SABLEE_POSTRES,
} from './carta-cartas-noviembre.test-util';
import { respuestaDeVision, type FraseFalsa } from './carta-vision-falsa.test-util';

function leer(frases: FraseFalsa[], inclinacion = 0): CartaLeida {
  const medidas = lineasDeLaFoto(palabrasDeRespuestaVision(respuestaDeVision(frases, inclinacion)));
  return parsearCartaMedida(medidas, altoDelCuerpo(medidas), esTituloPorTamano);
}

const fila = (c: CartaLeida, nombre: string) => c.lineas.find((l) => l.nombre === nombre);
const SABORES = [
  'PEPPERONI', 'MARGARITA', 'HAWAIANA', 'NONA', 'MARIANA', 'BBQ', 'NAPOLITANA',
  'ITALIANA', 'PRIMAVERA', 'COLOMBIANA', 'GIMENA', 'PAMPLONESA', 'GLORIA', 'SEBAS',
  'JUAN BIMBA', 'JALAPEÑA', 'MEXICANA', 'VEGETARIANA', 'BOCADILLA', 'SUPREMA', 'CRIOLLA',
];
const TAMANOS = ['Pequeña (8 porciones)', 'Mediana (10 porciones)', 'Grande (12 porciones)'];

describe('La Casa de la Pizza: la cabecera de tamaños y los sabores sin precio', () => {
  // La misma carta con el sabor del tamaño de los ingredientes: según la
  // tipografía, Vision puede medir la mayúscula igual o más pequeña.
  const saborDelCuerpo = CARTA_CASA_PIZZA.map((f) => (f.alto === 20 && /^[A-ZÑ ]+$/.test(f.texto)
    && !/PORCIONES|PEQUEÑA|MEDIANA|GRANDE/.test(f.texto) ? { ...f, alto: 16 } : f));

  for (const [nombre, frases, inclinacion] of [
    ['sabor en letra más grande', CARTA_CASA_PIZZA, 0],
    ['sabor en letra más grande, foto torcida', CARTA_CASA_PIZZA, 4],
    ['sabor del tamaño del cuerpo', saborDelCuerpo, 0],
    ['sabor del tamaño del cuerpo, foto torcida', saborDelCuerpo, -3],
  ] as const) {
    it(`cada pizza con sus ingredientes y los tres tamaños (${nombre})`, () => {
      const c = leer(frases, inclinacion);
      for (const s of SABORES) {
        const l = fila(c, s);
        expect(l, s).toBeDefined();
        expect(l!.precios, s).toEqual([25000, 31000, 39000]);
        expect(l!.tamanos, s).toEqual(TAMANOS);
        expect(l!.descripcion, s).toMatch(/^Salsa, Queso/);
        expect(l!.seccion, s).toBe('La casa de la pizza');
      }
      // La cabecera no es un plato: va a lo ignorado, diciendo qué se hizo.
      expect(c.lineas.some((l) => /porciones|\$/i.test(l.nombre))).toBe(false);
      expect(c.ignoradas.some((i) => /precios de cada tamaño/.test(i.motivo))).toBe(true);
    });
  }

  it('los renglones de ingredientes partidos se unen al sabor', () => {
    const c = leer(CARTA_CASA_PIZZA);
    expect(fila(c, 'PEPPERONI')!.descripcion).toBe('Salsa, Queso, Orégano, Pepperoni.');
    // Sin coma al final, «Tocineta.» cierra la lista de arriba.
    expect(fila(c, 'PRIMAVERA')!.descripcion).toBe('Salsa, Queso, Jamón, Maíz Tocineta.');
    expect(fila(c, 'GLORIA')!.descripcion).toBe('Salsa, Queso, Jamón, Pollo, Champiñones, Tocineta.');
    expect(c.lineas.some((l) => l.nombre.startsWith('Salsa,'))).toBe(false);
  });

  it('«COLOMBIANA» con ingredientes es una pizza, no la gaseosa', () => {
    expect(fila(leer(CARTA_CASA_PIZZA), 'COLOMBIANA')!.rol).toBe('plato');
  });

  it('lo que tiene su propio precio se queda con él, y sus opciones no toman los tamaños', () => {
    const c = leer(CARTA_CASA_PIZZA);
    expect(fila(c, 'PANZEROTTI')!.precio).toBe(17000);
    expect(fila(c, 'LASAGNA')!.precio).toBe(17000);
    // «HAWAIANO» y «MIXTO» van debajo del panzerotti: son sus sabores.
    expect(fila(c, 'HAWAIANO')!.precios).toBeUndefined();
    expect(fila(c, 'MIXTO')!.precios).toBeUndefined();
  });

  it('si el OCR pierde el nombre del sabor, sus ingredientes NO reciben los precios', () => {
    const sinNombres = CARTA_CASA_PIZZA.filter((f) => !['MARGARITA', 'NONA'].includes(f.texto));
    const c = leer(sinNombres);
    expect(c.lineas.filter((l) => l.nombre.startsWith('Salsa,')).every((l) => !l.precios)).toBe(true);
    expect(fila(c, 'HAWAIANA')!.precios).toEqual([25000, 31000, 39000]);
  });

  it('se proponen los tamaños de cada pizza ya nombrados', () => {
    const v = sugerirVariantes(leer(CARTA_CASA_PIZZA).lineas);
    const margarita = v.find((x) => x.nombre === 'Margarita');
    expect(margarita?.opciones.map((o) => [o.nombre, o.precio])).toEqual([
      ['Pequeña (8 porciones)', 25000], ['Mediana (10 porciones)', 31000], ['Grande (12 porciones)', 39000],
    ]);
    expect(v.filter((x) => x.opciones.length === 3)).toHaveLength(SABORES.length);
  });
});

describe('La Sablée, postres: viñetas, precio debajo y nombres partidos', () => {
  const ESPERADO: Array<[string, number]> = [
    ['Macarron', 8000], ['Pie limón /maracuyá', 12000], ['Tiramisu', 12000],
    ['Philadelphia de moras', 12000], ['Rolls de canela', 12000], ['Flan de caramelo', 12000],
    ['Cheesecake', 12000], ['Eclair', 14000], ['Tartaleta de croissant', 14000],
    ['Opera de chocolate', 14000], ['Torta vasca de pistachos', 14000], ['Croquembouche', 16000],
    ['Mousse', 16000], ['Milhojas', 16000], ['Brownie', 9000], ['Brownie con helado', 16000],
    ['Copa de helado', 9000], ['Dietética de almendras', 10000], ['Red velvet', 10000],
    ['Chocolate', 10000], ['Zanahoria', 10000], ['Coco', 10000], ['Croissant red velvet', 16000],
    ['Croissant de pistachos', 16000], ['Guanábana', 10000], ['Yogurt griego', 10000],
    ['Vasca de queso', 10000], ['Ahuyama', 10000], ['Genovesa', 10000], ['Croissant de nutella', 16000],
  ];

  for (const inclinacion of [0, 4, -3]) {
    it(`cada postre con su precio (foto a ${inclinacion}°)`, () => {
      const c = leer(CARTA_SABLEE_POSTRES, inclinacion);
      for (const [nombre, precio] of ESPERADO) expect(fila(c, nombre)?.precio, nombre).toBe(precio);
      expect(fila(c, 'Cheesecake')!.descripcion).toBe('frutos rojos /oreo');
      expect(c.lineas.filter((l) => l.precio != null)).toHaveLength(ESPERADO.length);
      // Ni productos llamados como un precio ni dos postres pegados.
      expect(c.lineas.some((l) => /^\$|•/.test(l.nombre))).toBe(false);
    });
  }
});

describe('La Sablée, encargos y panes: porciones y título partido', () => {
  it('el precio va al nombre; las porciones, a la descripción', () => {
    const c = leer(CARTA_SABLEE_PANES);
    expect(fila(c, 'Torta cuarto de libra')).toMatchObject({ precio: 45000, descripcion: '6 - 8 porciones' });
    expect(fila(c, 'Torta media libra')).toMatchObject({ precio: 80000, descripcion: '12 - 16 porciones' });
    expect(fila(c, 'Postre rectangular')).toMatchObject({ precio: 72000 });
    expect(fila(c, 'Cheesecake')).toMatchObject({ precio: 96000, descripcion: '12 a 16 porciones' });
    expect(c.lineas.some((l) => /porciones/.test(l.nombre))).toBe(false);
  });

  it('el título en varios renglones es una sola sección', () => {
    const c = leer(CARTA_SABLEE_PANES);
    expect(fila(c, 'Pan brioche')).toMatchObject({ precio: 14000, seccion: 'Pan artesanal & de masa madre' });
    expect(fila(c, 'Merengues')!.precio).toBe(9000);
  });
});

describe('La Sablée, pastas: el plato grande, la presentación y la pasta a escoger', () => {
  const c = leer(CARTA_SABLEE_PASTAS);

  it('el plato grande se queda con su párrafo y su precio', () => {
    expect(fila(c, 'Canelones de pollo stroganoff')).toMatchObject({
      precio: 32000,
      seccion: 'Pastas artesanales',
      descripcion: 'Tubos de pasta fresca rellena de pechuga de pollo, bañados en salsa bolognesa y topping de queso parmesano',
    });
    expect(fila(c, 'Calentao antioqueño')).toMatchObject({ precio: 26000, seccion: 'Cacerolas' });
    expect(fila(c, 'Cacerola de morrillo')!.precio).toBe(30000);
    expect(fila(c, 'Cacerola de chicharrón')!.precio).toBe(30000);
    expect(c.lineas.some((l) => /^(y|queso|guacamole) /.test(l.nombre))).toBe(false);
  });

  it('la presentación de la sección es una nota, no un plato', () => {
    expect(c.notas.map((n) => n.texto)).toContain(
      'Se elaboran desde cero utilizando ingredientes 100% naturales, sin conservantes ni colorantes artificiales.',
    );
    expect(c.lineas.some((l) => l.nombre.startsWith('Se elaboran'))).toBe(false);
  });

  it('«Espagueti | Fettuccine» es lo que el cliente escoge en «Pasta larga»', () => {
    for (const opcion of ['Espagueti', 'Fettuccine']) {
      expect(fila(c, opcion)).toMatchObject({ rol: 'guarnicion', seccion: 'Pasta larga', precio: null });
    }
    expect(fila(c, 'Bolognesa')).toMatchObject({ precio: 26000, seccion: 'Pasta larga' });
  });

  it('«Bolognesa» y «Calentao» son como los escribe la carta: no se corrigen', () => {
    expect(c.lineas.some((l) => /Boloñesa|Calentado/.test(l.nombre))).toBe(false);
    expect(c.lineas.some((l) => /Corregimos/.test(l.aviso ?? ''))).toBe(false);
  });
});

// ── Lo que NO cambia ──────────────────────────────────────────────────────────

describe('las columnas apretadas de la pizzería', () => {
  it('tres columnas con un hueco MENOR que el umbral general se separan', () => {
    // Medidas de la foto real: columnas de un cuarto de página y un hueco del
    // 4 % del ancho entre ellas, más que el triple de la letra pero menos
    // que el 6 % del ancho (el umbral de siempre).
    const p = (texto: string, x: number, y: number, ancho: number) => ({ texto, x0: x, x1: x + ancho, y0: y, y1: y + 10 });
    // Cada columna corre a su ritmo: arriba van parejas y, según cuántos
    // renglones de ingredientes lleve cada pizza, se desfasan.
    const columna = (x: number, renglones: number, desfaseDesde: number) => Array.from({ length: renglones }, (_, k) => {
      const y = 100 + k * 18 + (k >= desfaseDesde ? 9 : 0);
      return [
        p(k % 3 === 0 ? 'SABOR' : 'Salsa,', x, y, k % 3 === 0 ? 60 : 50),
        p('Queso,', x + 58, y, 50), p('Tocineta,', x + 116, y, 80),
        p('Maíz,', x + 204, y, 40), p('Pollo,', x + 252, y, 48),
      ];
    }).flat();
    const palabras = [...columna(0, 12, 99), ...columna(345, 10, 4), ...columna(690, 11, 6)];
    expect(bandasDeColumna(palabras)).toHaveLength(3);
    const lineas = lineasDeLaFoto(palabras);
    expect(lineas.every((l) => l.texto.split(' ').length <= 5)).toBe(true);
  });
});

describe('guardas: lo que ya funcionaba sigue igual', () => {
  const p = (texto: string, x: number, y: number, ancho: number, alto = 20) => ({ texto, x0: x, x1: x + ancho, y0: y, y1: y + alto });

  it('una TABLA «nombre · descripción» no se parte en dos columnas', () => {
    // Cada renglón tiene su pareja al otro lado: no son dos columnas que corren
    // cada una a su ritmo, es una tabla.
    const palabras = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) => [
      p(`Plato${k}`, 40, 100 + k * 40, 90),
      p('frijoles,', 175, 100 + k * 40, 70), p('arroz', 250, 100 + k * 40, 50),
      p(`${k + 1}2.000`, 600, 100 + k * 40, 70),
    ]);
    expect(bandasDeColumna(palabras)).toHaveLength(1);
  });

  it('los ingredientes en minúscula siguen siendo descripción, no parte del nombre', () => {
    const c = parsearCarta('Bandeja paisa\nfrijoles arroz y carne\n28.000');
    expect(fila(c, 'Bandeja paisa')).toMatchObject({ precio: 28000, descripcion: 'frijoles arroz y carne' });
    expect(unirNombresPartidos([{ texto: 'Bandeja paisa' }, { texto: 'con frijoles' }]).map((f) => f.texto))
      .toEqual(['Bandeja paisa', 'con frijoles']);
  });

  it('una sola celda de tamaño no es una cabecera (puede ser un plato)', () => {
    const filas = [{ texto: 'GRANDE' }, { texto: '$39.000' }, { texto: 'Hawaiana' }];
    expect(celdasDeTamano(filas)).toBe(filas);
  });

  it('una sección en plural con su lista debajo sigue siendo una sección', () => {
    const c = parsearCarta('BEBIDAS\nCoca-Cola, Pepsi, Sprite\nJugo natural 5.000');
    expect(c.secciones).toContain('Bebidas');
    expect(fila(c, 'BEBIDAS')).toBeUndefined();
  });
});
