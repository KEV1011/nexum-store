/**
 * Las cartas reales que mandó el dueño, leídas de punta a punta.
 *
 * EL REPORTE: «el agente no reconoce aún diferentes tipos de menús», con dos
 * fotos. SHOTS: dos columnas de tragos sin precio, la etiqueta «SHOTS» de
 * lado, y al pie el precio de toda la sección («BAJOS $8.000 / ALTOS
 * $10.000»). MICHELADAS: nombre y precio en el mismo renglón, los
 * ingredientes debajo con rayas, la etiqueta «MICHELADAS» de lado y una nota
 * entre paréntesis.
 *
 * LO QUE SALÍA, medido antes de tocar nada: la etiqueta vertical torcía la
 * lectura entera (los tragos de las dos columnas intercalados), los precios de
 * la michelada eran «otra columna» leída al final —cada uno un producto
 * llamado «$12.000»—, el pie se volvía un plato «BAJOS / ALTOS», la nota se
 * pegaba a los ingredientes, y «cereza» se «corregía» a «cerveza».
 */
import { describe, expect, it } from 'vitest';

import {
  altoDelCuerpo,
  anguloDeLectura,
  bandasDeColumna,
  esTituloPorTamano,
  lineasDeLaFoto,
  palabrasDeRespuestaVision,
} from './carta-geometria';
import { bloqueDePrecios, indicacionDeLaCarta, parsearCarta, parsearCartaMedida } from './carta-foto';
import { sugerirVariantes } from './carta-variantes';
import {
  CARTA_MICHELADAS,
  CARTA_SHOTS,
  respuestaDeVision,
  type FraseFalsa,
} from './carta-vision-falsa.test-util';

function leer(frases: FraseFalsa[], inclinacion = 0) {
  const medidas = lineasDeLaFoto(palabrasDeRespuestaVision(respuestaDeVision(frases, inclinacion)));
  return parsearCartaMedida(medidas, altoDelCuerpo(medidas), esTituloPorTamano);
}

const TRAGOS = ['Tequila', 'Aguardiente', 'Ron blanco', 'Ginebra', 'Whisky', 'Vodka', 'Jagermeister', 'Brandy'];

describe('SHOTS: dos columnas, etiqueta de lado y el precio de la sección al pie', () => {
  it.each([0, 1.5, -3, 90])('girada %s°', (grados) => {
    const c = leer(CARTA_SHOTS, grados);
    // Los ocho tragos, cada uno una vez, en su sección.
    expect(c.lineas.map((l) => l.nombre).sort()).toEqual([...TRAGOS].sort());
    for (const l of c.lineas) {
      expect(l.seccion).toBe('Shots');
      expect(l.precio).toBeNull();
      expect(l.precios).toEqual([8000, 10000]);
      expect(l.tamanos).toEqual(['Bajo', 'Alto']);
    }
    // El pie NO es un plato: se dice que se repartió.
    expect(c.ignoradas.map((i) => i.texto)).toEqual(['BAJOS $8.000 / ALTOS $10.000']);
  });

  it('las columnas se leen enteras, no intercaladas', () => {
    const c = leer(CARTA_SHOTS, 1.5);
    expect(c.lineas.map((l) => l.nombre)).toEqual(TRAGOS);
  });

  it('cada trago se propone en «Bajo» y «Alto», listo para crear', () => {
    const v = sugerirVariantes(leer(CARTA_SHOTS).lineas);
    expect(v).toHaveLength(8);
    expect(v[0]).toMatchObject({
      nombre: 'Tequila',
      precioBase: 8000,
      faltanNombres: false,
      opciones: [{ nombre: 'Bajo', precio: 8000 }, { nombre: 'Alto', precio: 10000 }],
    });
  });

  it('el pie partido en las dos columnas es el MISMO precio de sección', () => {
    const partida = CARTA_SHOTS
      .filter((f) => !f.texto.startsWith('BAJOS'))
      .concat([
        { texto: 'BAJOS $8.000', x: 0, y: 270 },
        { texto: 'ALTOS $10.000', x: 560, y: 270 },
      ]);
    const c = leer(partida);
    expect(c.lineas).toHaveLength(8);
    for (const l of c.lineas) expect(l.precios).toEqual([8000, 10000]);
    expect(c.ignoradas).toHaveLength(2);
  });
});

describe('MICHELADAS: precio a la derecha, ingredientes con rayas y una nota', () => {
  it.each([0, 1.5, -2])('girada %s°', (grados) => {
    const c = leer(CARTA_MICHELADAS, grados);
    expect(c.secciones).toEqual(['Micheladas']);
    expect(c.lineas.map((l) => [l.nombre, l.precio])).toEqual([
      ['Michelada clásica', 12000],
      ['Michelada de mango', 14000],
      ['Michelada de cereza', 15000],
      ['Michelada maracuyá', 14000],
    ]);
    const desc = (n: string) => c.lineas.find((l) => l.nombre === n)?.descripcion;
    expect(desc('Michelada clásica')).toBe('Limón, sal y hielo');
    // Partida en dos renglones, y el segundo sigue la palabra de arriba.
    expect(desc('Michelada de mango')).toBe('Mango biche - sal - limón - zumo de naranja - tajín - chamoy');
    expect(desc('Michelada maracuyá')).toBe('Maracuyá salteada en azúcar - limón');
    // La nota no se pegó a los ingredientes de nadie.
    expect(c.notas.map((n) => n.texto)).toEqual(['No olvides sumar esta michelada a tu soda o cerveza preferida']);
    expect(c.lineas.every((l) => !/olvides/.test(l.descripcion ?? ''))).toBe(true);
  });

  it('cereza, macerada y salteada son palabras de verdad: no se «corrigen»', () => {
    const c = leer(CARTA_MICHELADAS);
    expect(c.lineas.find((l) => l.precio === 15000)?.nombre).toBe('Michelada de cereza');
    expect(c.lineas.every((l) => !l.aviso)).toBe(true);
    // Igual en el texto plano.
    const plano = parsearCarta('Michelada de cereza 15.000\nMaracuyá salteada 14.000');
    expect(plano.lineas.map((l) => l.nombre)).toEqual(['Michelada de cereza', 'Maracuyá salteada']);
  });

  it('un precio algo más bajo que su plato no se va a los ingredientes', () => {
    // El precio en letra más grande baja hasta el renglón de los ingredientes:
    // se solapa MÁS con ellos que con el nombre.
    const corrido = CARTA_MICHELADAS.map((f) => (f.texto === '$12.000' ? { ...f, y: 20, alto: 26 } : f));
    const c = leer(corrido);
    expect(c.lineas[0]).toMatchObject({ nombre: 'Michelada clásica', precio: 12000, descripcion: 'Limón, sal y hielo' });
    // Y uno que cae justo debajo del nombre, solo sobre los ingredientes.
    const debajo = CARTA_MICHELADAS.map((f) => (f.texto === '$12.000' ? { ...f, y: 34 } : f));
    expect(leer(debajo).lineas[0]).toMatchObject({ nombre: 'Michelada clásica', precio: 12000 });
  });

  it('el segundo renglón de la lista con raya delante, o en mayúscula, también es suyo', () => {
    for (const segundo of ['- tajín - chamoy', 'Tajín - chamoy']) {
      const c = parsearCarta(`Michelada de mango 14.000\nMango biche - sal - limón\n${segundo}`);
      expect(c.lineas).toHaveLength(1);
      expect(c.lineas[0]!.descripcion).toBe('Mango biche - sal - limón - tajín - chamoy'.replace('tajín', segundo.startsWith('T') ? 'Tajín' : 'tajín'));
    }
  });
});

describe('el ángulo es el de la carta, no el de la etiqueta', () => {
  const vertices = (frases: FraseFalsa[], inc: number) => {
    const r = respuestaDeVision(frases, inc).responses[0]!.fullTextAnnotation.pages[0]!.blocks[0]!.paragraphs[0]!.words;
    return r.map((w) => ({ texto: w.symbols.map((x) => x.text).join(''), v: w.boundingBox.vertices }));
  };

  it('una carta derecha con su etiqueta vertical NO se gira', () => {
    const palabras = palabrasDeRespuestaVision(respuestaDeVision(CARTA_MICHELADAS, 0));
    expect(anguloDeLectura(vertices(CARTA_MICHELADAS, 0))).toBeCloseTo(0, 6);
    // El rectángulo de una palabra normal es el que mandó Vision, sin tocar.
    const clasica = palabras.find((p) => p.texto === 'Michelada')!;
    expect([clasica.x0, clasica.y0]).toEqual([3000, 3000]);
    expect(palabras.find((p) => p.texto === 'MICHELADAS')?.giro).toBe(-90);
  });

  it('con la foto torcida, el ángulo es el de la carta', () => {
    // (Los vértices de Vision son enteros: unas milésimas de grado de redondeo.)
    expect((anguloDeLectura(vertices(CARTA_MICHELADAS, 2)) * 180) / Math.PI).toBeCloseTo(2, 1);
  });

  it('lo torcido que no es una etiqueta (un sello a 45°) se descarta', () => {
    const conSello = [...CARTA_MICHELADAS, { texto: 'NUEVO', x: 400, y: 150, alto: 30, angulo: -45 }];
    const c = leer(conSello);
    expect(c.lineas).toHaveLength(4);
    expect(JSON.stringify(c)).not.toMatch(/NUEVO/);
  });
});

describe('las columnas con un renglón que cruza', () => {
  it('el nombre del restaurante arriba no funde las dos columnas', () => {
    const c = leer([
      { texto: 'RESTAURANTE EL BUEN SABOR', x: 150, y: -80, alto: 30 },
      { texto: 'HAMBURGUESAS', x: 0, y: 0, alto: 30 },
      { texto: 'Sencilla 12.000', x: 0, y: 50 },
      { texto: 'Doble 15.000', x: 0, y: 90 },
      { texto: 'Especial 18.000', x: 0, y: 130 },
      { texto: 'BEBIDAS', x: 620, y: 0, alto: 30 },
      { texto: 'Gaseosa 4.000', x: 620, y: 50 },
      { texto: 'Jugo natural 6.000', x: 620, y: 90 },
      { texto: 'Limonada 5.000', x: 620, y: 130 },
    ]);
    const plato = (n: string) => c.lineas.find((l) => l.nombre === n);
    expect(plato('Gaseosa')).toMatchObject({ precio: 4000, seccion: 'Bebidas' });
    expect(plato('Sencilla')).toMatchObject({ precio: 12000, seccion: 'Hamburguesas' });
  });

  it('una columna de solo precios se queda con sus platos', () => {
    const palabras = [
      { texto: 'Churrasco', x0: 40, x1: 190, y0: 100, y1: 120 },
      { texto: '25.000', x0: 600, x1: 670, y0: 100, y1: 120 },
      { texto: 'Pechuga', x0: 40, x1: 160, y0: 140, y1: 160 },
      { texto: '19.000', x0: 600, x1: 670, y0: 140, y1: 160 },
      { texto: 'Mojarra', x0: 40, x1: 160, y0: 180, y1: 200 },
      { texto: '28.000', x0: 600, x1: 670, y0: 180, y1: 200 },
    ];
    expect(bandasDeColumna(palabras)).toHaveLength(1);
    expect(lineasDeLaFoto(palabras).map((l) => l.texto)).toEqual(['Churrasco 25.000', 'Pechuga 19.000', 'Mojarra 28.000']);
  });
});

describe('el precio de la sección', () => {
  it('reconoce el renglón que es solo el precio', () => {
    expect(bloqueDePrecios('BAJOS $8.000 / ALTOS $10.000')).toEqual({ etiquetas: ['Bajo', 'Alto'], precios: [8000, 10000] });
    expect(bloqueDePrecios('Todos a $8.000')).toEqual({ etiquetas: [], precios: [8000] });
    expect(bloqueDePrecios('Copa 12.000 Botella 60.000')).toEqual({ etiquetas: ['Copa', 'Botella'], precios: [12000, 60000] });
    // Un plato no es un precio de sección.
    expect(bloqueDePrecios('Tequila 8.000')).toBeNull();
    expect(bloqueDePrecios('Hamburguesa doble 15.000')).toBeNull();
    expect(bloqueDePrecios('BAJOS $8.000 con hielo')).toBeNull();
  });

  // Con la geometría de la foto: en el texto plano un renglón corto sin precio
  // se toma por título, y la foto es la que dice que va en la letra del cuerpo.
  const lista = (renglones: string[]) => leer([
    { texto: 'TRAGOS', x: 0, y: -60, alto: 34 },
    ...renglones.map((texto, k) => ({ texto, x: 0, y: k * 40 })),
  ]);

  it('un solo precio para todos: cada plato lo toma', () => {
    const c = lista(['Tequila', 'Aguardiente', 'Ron', 'Todos a $8.000']);
    expect(c.lineas.map((l) => [l.nombre, l.precio])).toEqual([['Tequila', 8000], ['Aguardiente', 8000], ['Ron', 8000]]);
  });

  it('los tamaños que se repiten son de los platos que tienen encima', () => {
    const c = lista([
      'Hamburguesa clásica',
      'Sencilla 12.000',
      'Doble 15.000',
      'Hamburguesa BBQ',
      'Sencilla 14.000',
      'Doble 17.000',
    ]);
    expect(c.lineas.map((l) => [l.nombre, l.precios, l.tamanos])).toEqual([
      ['Hamburguesa clásica', [12000, 15000], ['Sencilla', 'Doble']],
      ['Hamburguesa BBQ', [14000, 17000], ['Sencilla', 'Doble']],
    ]);
  });

  it('sin platos sin precio en la sección, el renglón se queda como estaba', () => {
    const c = parsearCarta('PIZZAS\nHawaiana 22.000\nPersonal 12.000');
    expect(c.lineas.map((l) => l.nombre)).toEqual(['Hawaiana', 'Personal']);
    expect(c.ignoradas).toHaveLength(0);
  });

  it('un solo tamaño suelto con un único plato encima no se reparte', () => {
    const c = lista(['Sopa del día', 'Grande 9.000']);
    expect(c.lineas.map((l) => [l.nombre, l.precio])).toEqual([['Sopa del día', null], ['Grande', 9000]]);
  });
});

describe('las indicaciones al cliente van a las notas', () => {
  it.each([
    ['(No olvides sumar esta michelada a tu soda o cerveza preferida)', 'No olvides sumar esta michelada a tu soda o cerveza preferida'],
    ['Pregunta por nuestros sabores del día', 'Pregunta por nuestros sabores del día'],
    ['(carne, queso, tomate)', null],
    ['Arroz con pollo', null],
  ])('«%s»', (texto, esperado) => {
    expect(indicacionDeLaCarta(texto)).toBe(esperado);
  });
});

describe('las erratas solo en lo que el OCR leyó con duda', () => {
  const con = (confianza: number) => leer([
    { texto: 'Hamburgesa doble 15.000', x: 0, y: 0, confianza },
    { texto: 'Perro caliente 9.000', x: 0, y: 50, confianza: 0.99 },
  ]);

  it('leída con duda, se corrige y se dice', () => {
    const c = con(0.6);
    expect(c.lineas[0]!.nombre).toBe('Hamburguesa doble');
    expect(c.lineas[0]!.aviso).toMatch(/Corregimos/);
  });

  it('leída con seguridad, se deja como está', () => {
    const c = con(0.98);
    expect(c.lineas[0]!.nombre).toBe('Hamburgesa doble');
    expect(c.lineas[0]!.aviso).toBeUndefined();
  });

  it('sin confianza (texto plano), se corrige con el vocabulario como siempre', () => {
    expect(parsearCarta('Hamburgesa doble 15.000').lineas[0]!.nombre).toBe('Hamburguesa doble');
  });
});
