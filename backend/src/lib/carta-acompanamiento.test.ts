/**
 * Lo que VIENE con el plato: la papa a la francesa que la carta no cobra.
 *
 * EL REPORTE: «no solucionamos lo que muchos restaurantes ofrecen,
 * acompañamiento de papa a la francesa como ejemplo». La carta del local
 * decía «Todos nuestros sándwiches van acompañados de vegetales frescos,
 * porción de papa a la francesa» —partida en dos renglones— y el lector la
 * convertía en una fila sin precio llamada «frescos, porción de papa a la
 * francesa». Y «Escoge tu acompañamiento: papa, patacón o arroz» no tenía
 * dónde caer: no es un producto, ni un adicional que se cobra, ni algo que
 * se ofrezca al pagar.
 *
 * Tres formas, tres destinos:
 *   - lo que TRAE el plato → su descripción (una nota de la sección);
 *   - lo que se ESCOGE con el plato → un grupo obligatorio «elige 1» a $0;
 *   - los ingredientes en el renglón de abajo → la descripción de ESE plato.
 */
import { describe, expect, it } from 'vitest';

import {
  continuaAlDeArriba,
  listaParaElegir,
  notaDeInclusion,
  parsearCarta,
} from './carta-foto';
import {
  agruparGuarniciones,
  destinoPorDefecto,
  grupoDeGuarnicion,
  rolDeLinea,
} from './carta-rol';

describe('lo que TRAEN los platos va a su descripción', () => {
  it('la carta del reporte, partida en dos renglones, sale entera y como nota', () => {
    const r = parsearCarta([
      'SÁNDWICHES',
      'Sandwich criollo $19.000',
      'Sandwich proteína $23.000',
      'Todos nuestros sándwiches van acompañados de vegetales',
      'frescos, porción de papa a la francesa',
    ].join('\n'));

    expect(r.notas).toEqual([{
      linea: 4,
      seccion: 'Sándwiches',
      texto: 'Acompañado de vegetales frescos, porción de papa a la francesa',
    }]);
    // Y NO como filas sin precio que el dueño tendría que borrar.
    expect(r.lineas.map((l) => l.nombre)).toEqual(['Sandwich criollo', 'Sandwich proteína']);
    expect(r.lineas.every((l) => !l.aviso)).toBe(true);
  });

  it.each([
    ['Incluye papa a la francesa y gaseosa', 'Incluye papa a la francesa y gaseosa'],
    ['Todos los platos incluyen sopa del día.', 'Incluye sopa del día'],
    ['Servidos con arroz y ensalada', 'Servido con arroz y ensalada'],
    ['ACOMPAÑADO DE PAPA A LA FRANCESA', 'ACOMPAÑADO DE PAPA A LA FRANCESA'],
    ['Las hamburguesas vienen con papas', 'Viene con papas'],
  ])('«%s» → «%s»', (texto, esperado) => {
    expect(notaDeInclusion(texto)).toBe(esperado);
  });

  it.each([
    'Arroz con pollo, ensalada y papas',
    'Bandeja paisa',
    'ACOMPAÑAMIENTOS',
    'Hamburguesas',
    'Con',
  ])('«%s» NO es una nota', (texto) => {
    expect(notaDeInclusion(texto)).toBeNull();
  });

  it('una nota GRITADA no se toma por título de sección', () => {
    // Sin esto, «ACOMPAÑADO DE PAPA» —corto y en mayúsculas— abría una
    // sección nueva y se llevaba los platos de debajo.
    const r = parsearCarta('PERROS\nPerro sencillo 9.000\nACOMPAÑADO DE PAPA\nPerro doble 13.000');
    expect(r.secciones).toEqual(['Perros']);
    expect(r.lineas.map((l) => l.seccion)).toEqual(['Perros', 'Perros']);
  });
});

describe('lo que se ESCOGE con el plato es un grupo, no filas sueltas', () => {
  it.each([
    ['Acompañamientos: papa a la francesa, patacón o arroz', 'Acompañamiento', ['Papa a la francesa', 'Patacón', 'Arroz']],
    ['Escoge tu acompañamiento: papa, yuca o arroz', 'Acompañamiento', ['Papa', 'Yuca', 'Arroz']],
    ['Elige tu proteína: pollo, res o cerdo', 'Proteína', ['Pollo', 'Res', 'Cerdo']],
    ['Escoge entre papa criolla, papa francesa o yuca', 'Acompañamiento', ['Papa criolla', 'Papa francesa', 'Yuca']],
    ['Acompañado de papa a la francesa o patacón', 'Acompañamiento', ['Papa a la francesa', 'Patacón']],
    ['Guarnición: arroz / ensalada / papa salada', 'Acompañamiento', ['Arroz', 'Ensalada', 'Papa salada']],
  ])('«%s»', (texto, grupo, opciones) => {
    expect(listaParaElegir(texto)).toEqual({ grupo, opciones });
  });

  it.each([
    // «papa Y ensalada» es lo que trae, no algo que se escoge.
    'Acompañado de papa a la francesa y ensalada',
    // Una sola opción no es escoger.
    'Acompañamiento: papa a la francesa',
    // Dos puntos que no hablan de escoger.
    'Al gusto: 3 huevos pochados, tocineta',
    'Nota: no hay domicilios los lunes, gracias',
    // Una «opción» larga es prosa.
    'Escoge: papa a la francesa con salsa de la casa y queso gratinado, o arroz',
  ])('«%s» NO es una lista para escoger', (texto) => {
    expect(listaParaElegir(texto)).toBeNull();
  });

  it('la lista sale como guarniciones SIN aviso de precio, en su sección', () => {
    const r = parsearCarta('PLATOS FUERTES\nBandeja paisa 28.000\nAcompañamientos: papa a la francesa, patacón o arroz');
    const g = r.lineas.filter((l) => l.rol === 'guarnicion');
    expect(g.map((l) => l.nombre)).toEqual(['Papa a la francesa', 'Patacón', 'Arroz']);
    expect(g.every((l) => l.seccion === 'Platos fuertes' && l.precio === null && !l.aviso)).toBe(true);
    // El plato sigue siendo plato.
    expect(r.lineas[0]).toMatchObject({ nombre: 'Bandeja paisa', precio: 28000, rol: 'plato' });
  });

  it('una SECCIÓN de acompañamientos sin precios: cada opción es una guarnición', () => {
    const r = parsearCarta('ACOMPAÑAMIENTOS\nPapa criolla\nYuca frita\nEnsalada\nPOSTRES\nFlan 6.000');
    // «Ensalada» y «Yuca frita» son cortas y sin precio: antes eran TÍTULOS.
    expect(r.secciones).toEqual(['Acompañamientos', 'Postres']);
    expect(r.lineas.map((l) => [l.nombre, l.rol])).toEqual([
      ['Papa criolla', 'guarnicion'],
      ['Yuca frita', 'guarnicion'],
      ['Ensalada', 'guarnicion'],
      ['Flan', 'plato'],
    ]);
  });

  it('pero un título en plural sigue cerrando la lista aunque vaya en minúscula', () => {
    const r = parsearCarta('Acompañamientos\nPapa criolla\nPostres\nFlan 6.000');
    expect(r.secciones).toEqual(['Acompañamientos', 'Postres']);
    expect(r.lineas.at(-1)).toMatchObject({ nombre: 'Flan', seccion: 'Postres', rol: 'plato' });
  });

  it('CON precio, la sección de acompañamientos sigue siendo lo que se vende aparte', () => {
    // «Papa a la francesa 6.000» bajo ACOMPAÑAMIENTOS es una porción que se
    // pide sola: ahí no se escoge nada, se compra.
    const r = parsearCarta('ACOMPAÑAMIENTOS\nPapa a la francesa 6.000\nPatacón 5.000');
    expect(r.lineas.map((l) => l.rol)).toEqual(['acompanamiento', 'acompanamiento']);
  });
});

describe('los ingredientes del renglón de abajo son de ESE plato', () => {
  it('con coma y el plato de arriba con precio y sin descripción', () => {
    const r = parsearCarta('Sandwich criollo 19.000\nPan argentino, jamón, queso');
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]).toMatchObject({ nombre: 'Sandwich criollo', descripcion: 'Pan argentino, jamón, queso' });
  });

  it('y lo que sigue en minúscula se le añade', () => {
    const r = parsearCarta('Hamburguesa doble 22.000\n(dos carnes, queso cheddar,\ntocineta y salsa de la casa)');
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]!.descripcion).toBe('dos carnes, queso cheddar, tocineta y salsa de la casa');
  });

  it('una línea suelta sin plato arriba sigue siendo una fila con aviso', () => {
    // Lo de siempre: no se esconde en silencio lo que no se entiende.
    const r = parsearCarta('Arroz con pollo, ensalada y papas');
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]!.aviso).toMatch(/precio/);
  });

  it('un renglón en blanco corta: lo de abajo es otra cosa', () => {
    const r = parsearCarta('Sandwich criollo 19.000\n\nPan argentino, jamón, queso');
    expect(r.lineas).toHaveLength(2);
    expect(r.lineas[0]!.descripcion).toBeUndefined();
  });

  it.each([
    ['frescos, porción de papa', true],
    [', porción de papa', true],
    ['(carne, queso)', true],
    ['Bandeja paisa', false],
    ['3 huevos', false],
    ['', false],
  ])('¿«%s» continúa al de arriba? %s', (texto, esperado) => {
    expect(continuaAlDeArriba(texto)).toBe(esperado);
  });
});

describe('el rol, con el precio a la vista', () => {
  it('sin precio en una sección de las que se escogen: guarnición', () => {
    for (const seccion of ['Acompañamientos', 'Escoge tu acompañamiento', 'Guarniciones', 'Principios']) {
      expect(rolDeLinea({ nombre: 'Papa criolla', seccion, precio: null }).rol, seccion).toBe('guarnicion');
    }
  });

  it('sin decir el precio (quien no lo sabe) no se afirma nada nuevo', () => {
    expect(rolDeLinea({ nombre: 'Papa criolla', seccion: 'Acompañamientos' }).rol).toBe('acompanamiento');
  });

  it('«ELIGE TU PROTEÍNA» con precios de plato es una lista de PLATOS', () => {
    expect(rolDeLinea({ nombre: 'Pechuga', seccion: 'Elige tu proteína', precio: 18000 }).rol).toBe('plato');
  });

  it('un adicional sigue ganando aunque no tenga precio', () => {
    expect(rolDeLinea({ nombre: '+ Queso', seccion: 'Acompañamientos', precio: null }).rol).toBe('adicional');
  });
});

describe('cómo se agrupan y a qué platos van', () => {
  const f = (nombre: string, precio: number | null, seccion: string, rol: 'plato' | 'guarnicion' = 'guarnicion') =>
    ({ nombre, precio, seccion, rol });

  it('sin precio es CERO: viene incluida; con precio, es el recargo', () => {
    const [g] = agruparGuarniciones([f('Papa', null, 'Acompañamientos'), f('Yuca', 2000, 'Acompañamientos')]);
    expect(g!.opciones).toEqual([{ nombre: 'Papa', precio: 0 }, { nombre: 'Yuca', precio: 2000 }]);
  });

  it('la sección propia le da el nombre al grupo', () => {
    const filas = [f('Papa', null, 'Escoge tu acompañamiento')];
    expect(grupoDeGuarnicion('Escoge tu acompañamiento', filas)).toBe('Escoge tu acompañamiento');
  });

  it('dos secciones de platos con su lista cada una NO se funden', () => {
    // La papa de los sándwiches y el arroz de las carnes son listas distintas:
    // fundirlas le ofrecería arroz a un sándwich.
    const grupos = agruparGuarniciones([
      f('Sandwich', 19000, 'Sándwiches', 'plato'), f('Papa', null, 'Sándwiches'),
      f('Churrasco', 32000, 'Carnes', 'plato'), f('Arroz', null, 'Carnes'),
    ]);
    expect(grupos.map((g) => g.nombre)).toEqual(['Acompañamiento de sándwiches', 'Acompañamiento de carnes']);
  });

  it('una sola lista dentro de una sección de platos se llama «Acompañamiento»', () => {
    const grupos = agruparGuarniciones([f('Bandeja', 28000, 'Platos fuertes', 'plato'), f('Arroz', null, 'Platos fuertes')]);
    expect(grupos[0]!.nombre).toBe('Acompañamiento');
  });

  it('va a SU sección si tiene platos; si es una sección propia, a todas', () => {
    expect(destinoPorDefecto(['Sándwiches'], ['Sándwiches', 'Carnes'])).toEqual(['Sándwiches']);
    expect(destinoPorDefecto(['Acompañamientos'], ['Sándwiches', 'Carnes'])).toEqual(['Sándwiches', 'Carnes']);
    expect(destinoPorDefecto([''], ['Sándwiches'])).toEqual(['Sándwiches']);
    expect(destinoPorDefecto(['Acompañamientos'], [])).toEqual([]);
  });
});
