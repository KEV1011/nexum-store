/**
 * Plato, adicional o acompañamiento: lo que el lector de cartas propone.
 *
 * El caso que motivó esto fue el de un local de arepas: sus ADICIONALES
 * («Queso 3.000», «Huevo 2.000») entraban como platos que se podían pedir
 * solos, y sus hamburguesas acababan ofrecidas en «Acompaña tu pedido».
 */
import { describe, it, expect } from 'vitest';

import {
  agruparAdicionales,
  grupoDeAdicional,
  GRUPO_ADICIONALES,
  nombreDeAdicional,
  rolDeLinea,
  rolDeSeccion,
  sanearRol,
  suenaAAcompanamiento,
} from './carta-rol';
import { parsearCarta } from './carta-foto';
import { sugerirVariantes } from './carta-variantes';

describe('qué dice el título de la sección', () => {
  it.each([
    ['ADICIONALES', 'adicional'],
    ['Adiciones', 'adicional'],
    ['Extras', 'adicional'],
    ['Toppings', 'adicional'],
    ['BEBIDAS', 'acompanamiento'],
    ['Jugos naturales', 'acompanamiento'],
    ['Porciones', 'acompanamiento'],
    ['Acompañamientos', 'acompanamiento'],
  ])('«%s» → %s', (seccion, rol) => {
    expect(rolDeSeccion(seccion)).toBe(rol);
  });

  it.each(['Arepas', 'Hamburguesas', 'Platos fuertes', 'Entradas', 'Postres', 'Platos calientes', ''])(
    '«%s» no dice nada: se decide por la línea',
    (seccion) => {
      expect(rolDeSeccion(seccion)).toBeNull();
    },
  );

  it('«Adiciones y bebidas» manda adicional: el dueño separa las bebidas', () => {
    expect(rolDeSeccion('Adiciones y bebidas')).toBe('adicional');
  });
});

describe('el rol de cada renglón', () => {
  it('la línea que EMPIEZA como adicional lo es, esté donde esté', () => {
    for (const nombre of ['+ Queso', '+Queso', 'Adición de huevo', 'Adicional tocineta', 'Extra queso']) {
      expect(rolDeLinea({ nombre, seccion: 'Hamburguesas' }).rol, nombre).toBe('adicional');
    }
  });

  it('una bebida suelta dentro de los platos es acompañamiento', () => {
    expect(rolDeLinea({ nombre: 'Gaseosa 350 ml', seccion: 'Arepas' }).rol).toBe('acompanamiento');
    expect(rolDeLinea({ nombre: 'Coca cola 1.5 lt', seccion: '' }).rol).toBe('acompanamiento');
  });

  it('ANTE LA DUDA, PLATO: lo que solo menciona un acompañamiento no lo es', () => {
    for (const nombre of [
      'Hamburguesa con papas',
      'Salchipapa',
      'Arepa rellena',
      // Empieza por «agua» como palabra entera, no como prefijo.
      'Aguacate relleno',
      // Va tan a menudo en entradas como en acompañamientos: decide la sección.
      'Patacón con hogao',
      'Papas criollas',
      'Tequeños',
    ]) {
      expect(rolDeLinea({ nombre, seccion: 'Entradas' }).rol, nombre).toBe('plato');
    }
  });

  it('dentro de una sección de adicionales, la sección manda sobre el nombre', () => {
    // «Gaseosa» como adicional de un combo: lo dice la carta.
    expect(rolDeLinea({ nombre: 'Gaseosa', seccion: 'Adicionales' }).rol).toBe('adicional');
  });

  it('siempre dice POR QUÉ, salvo el plato por defecto', () => {
    expect(rolDeLinea({ nombre: 'Queso', seccion: 'ADICIONALES' }).motivo).toContain('ADICIONALES');
    expect(rolDeLinea({ nombre: 'Arepa', seccion: 'Arepas' }).motivo).toBeUndefined();
  });

  it('lo que llega del navegador sin sentido es plato', () => {
    expect(sanearRol('acompanamiento')).toBe('acompanamiento');
    expect(sanearRol('adicional')).toBe('adicional');
    expect(sanearRol('PLATO')).toBe('plato');
    expect(sanearRol(undefined)).toBe('plato');
    expect(sanearRol({ rol: 'adicional' })).toBe('plato');
  });
});

describe('acompañamiento de un producto ya creado (solo orienta al portal)', () => {
  it('por la sección o por el nombre de una bebida', () => {
    expect(suenaAAcompanamiento('Gaseosa', '')).toBe(true);
    expect(suenaAAcompanamiento('Papas a la francesa', 'Porciones')).toBe(true);
    expect(suenaAAcompanamiento('Hamburguesa Costeña (Croqueta de carne)', 'Hamburguesas')).toBe(false);
    expect(suenaAAcompanamiento('Arepa rellena', 'Arepas')).toBe(false);
  });
});

describe('los adicionales van a UN grupo de la biblioteca, no a productos', () => {
  it('el nombre de la opción pierde el «+» y el «Adición de»', () => {
    expect(nombreDeAdicional('+ queso')).toBe('Queso');
    expect(nombreDeAdicional('Adición de huevo')).toBe('Huevo');
    expect(nombreDeAdicional('Extra tocineta')).toBe('Tocineta');
    expect(nombreDeAdicional('Aguacate')).toBe('Aguacate');
  });

  it('una sección ENTERA de adicionales es el grupo, con su nombre', () => {
    const filas = [
      { nombre: 'Queso', precio: 3000, seccion: 'ADICIONALES', rol: 'adicional' as const },
      { nombre: 'Huevo', precio: 2000, seccion: 'ADICIONALES', rol: 'adicional' as const },
      { nombre: 'Arepa rellena', precio: 20000, seccion: 'Arepas', rol: 'plato' as const },
    ];
    const { grupos } = agruparAdicionales(filas);
    expect(grupos).toEqual([
      { nombre: 'ADICIONALES', opciones: [{ nombre: 'Queso', precio: 3000 }, { nombre: 'Huevo', precio: 2000 }] },
    ]);
  });

  it('un adicional suelto entre platos va a «Adicionales», no a un grupo llamado como el plato', () => {
    const filas = [
      { nombre: '+ Tocineta', precio: 4000, seccion: 'Hamburguesas', rol: 'adicional' as const },
      { nombre: 'Hamburguesa sencilla', precio: 15000, seccion: 'Hamburguesas', rol: 'plato' as const },
    ];
    expect(grupoDeAdicional('Hamburguesas', filas)).toBe(GRUPO_ADICIONALES);
    expect(agruparAdicionales(filas).grupos[0]!.nombre).toBe(GRUPO_ADICIONALES);
  });

  it('dos listas distintas son dos grupos', () => {
    const filas = [
      { nombre: 'Queso', precio: 3000, seccion: 'Adiciones arepas', rol: 'adicional' as const },
      { nombre: 'Tocineta', precio: 4000, seccion: 'Adiciones hamburguesas', rol: 'adicional' as const },
    ];
    expect(agruparAdicionales(filas).grupos.map((g) => g.nombre)).toEqual([
      'Adiciones arepas', 'Adiciones hamburguesas',
    ]);
  });

  it('sin precio NO se crea en cero: «Queso» gratis es plata que pierde el local', () => {
    const r = agruparAdicionales([
      { nombre: 'Queso', precio: null, seccion: 'Adicionales', rol: 'adicional' },
      { nombre: 'Huevo', precio: 2000, seccion: 'Adicionales', rol: 'adicional' },
    ]);
    expect(r.sinPrecio).toBe(1);
    expect(r.grupos[0]!.opciones.map((o) => o.nombre)).toEqual(['Huevo']);
  });

  it('el repetido se queda con el primero y se cuenta', () => {
    const r = agruparAdicionales([
      { nombre: 'Queso', precio: 3000, seccion: 'Adicionales', rol: 'adicional' },
      { nombre: '+ queso', precio: 3500, seccion: 'Adicionales', rol: 'adicional' },
    ]);
    expect(r.repetidos).toBe(1);
    expect(r.grupos[0]!.opciones).toEqual([{ nombre: 'Queso', precio: 3000 }]);
  });
});

describe('la carta entera, como llega del lector', () => {
  const carta = parsearCarta([
    'AREPAS',
    'Arepa rellena 20.000',
    'Arepa sencilla 8.000',
    'HAMBURGUESAS',
    'Hamburguesa costeña (croqueta de carne, queso) 25.000',
    '+ Tocineta 4.000',
    'ADICIONALES',
    'Queso 3.000',
    'Huevo 2.000',
    'BEBIDAS',
    'Gaseosa 350 ml 3.500',
    'Jugo natural 5.000 / 7.000',
  ].join('\n'));
  const rol = (nombre: string) => carta.lineas.find((l) => l.nombre.startsWith(nombre))?.rol;

  it('cada renglón sale con su tipo', () => {
    expect(rol('Arepa rellena')).toBe('plato');
    expect(rol('Hamburguesa costeña')).toBe('plato');
    expect(rol('+ Tocineta')).toBe('adicional');
    expect(rol('Queso')).toBe('adicional');
    expect(rol('Huevo')).toBe('adicional');
    expect(rol('Gaseosa')).toBe('acompanamiento');
  });

  it('el jugo en dos tamaños se agrupa, y sigue siendo acompañamiento', () => {
    const jugo = sugerirVariantes(carta.lineas).find((v) => v.nombre.startsWith('Jugo'));
    expect(jugo?.rol).toBe('acompanamiento');
  });

  it('los adicionales NUNCA forman tamaños: son opciones de otro plato', () => {
    const lineas = parsearCarta(['ADICIONALES', 'Queso pequeño 2.000', 'Queso grande 3.000'].join('\n')).lineas;
    expect(lineas.every((l) => l.rol === 'adicional')).toBe(true);
    expect(sugerirVariantes(lineas)).toEqual([]);
  });
});
