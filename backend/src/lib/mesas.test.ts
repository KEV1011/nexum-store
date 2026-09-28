import { describe, expect, it } from 'vitest';
import {
  codigoDeCarta,
  enlaceDeMesa,
  esCodigoDeCarta,
  ETIQUETA_MAX,
  MESAS_MAX,
  mesaDelCatalogo,
  normalizaEtiqueta,
  saneaMesas,
} from './mesas';

describe('el catálogo de mesas que declara el dueño', () => {
  it('limpia espacios y deja la etiqueta como la escribió', () => {
    // No se «normaliza» lo que el dueño quiso: si pintó «05» en la mesa, la
    // comanda tiene que decir «05».
    expect(saneaMesas([' 1 ', '05', 'Terraza  2'])).toEqual(['1', '05', 'Terraza 2']);
  });

  it('acepta números, que es como se llenan las mesas', () => {
    expect(saneaMesas([1, 2, 3])).toEqual(['1', '2', '3']);
  });

  it('las filas vacías del formulario no son un error', () => {
    expect(saneaMesas(['1', '', '   ', '2'])).toEqual(['1', '2']);
  });

  it('nada declarado es una lista vacía, no un fallo', () => {
    expect(saneaMesas(null)).toEqual([]);
    expect(saneaMesas(undefined)).toEqual([]);
    expect(saneaMesas([])).toEqual([]);
  });

  it('la misma mesa escrita de dos formas se RECHAZA nombrando las dos', () => {
    // Si pasara, esa mesa tendría DOS códigos QR y sus pedidos saldrían
    // repartidos entre los dos: la cocina vería dos mesas donde hay una.
    expect(() => saneaMesas(['Terraza 1', 'terraza 1'])).toThrow(/misma mesa/i);
    expect(() => saneaMesas(['Terraza 1', 'terraza 1'])).toThrow(/Terraza 1/);
    expect(() => saneaMesas(['Salón', 'salon'])).toThrow(/misma mesa/i);
    expect(() => saneaMesas(['3', '3'])).toThrow(/repetida/i);
  });

  it('una etiqueta que no cabe en el individual se rechaza diciéndolo', () => {
    const larga = 'Mesa de la ventana junto a la entrada';
    expect(larga.length).toBeGreaterThan(ETIQUETA_MAX);
    expect(() => saneaMesas([larga])).toThrow(new RegExp(String(ETIQUETA_MAX)));
  });

  it('hay un tope de cordura de mesas', () => {
    const muchas = Array.from({ length: MESAS_MAX + 1 }, (_, i) => String(i + 1));
    expect(() => saneaMesas(muchas)).toThrow(/demasiadas/i);
    expect(saneaMesas(muchas.slice(0, MESAS_MAX))).toHaveLength(MESAS_MAX);
  });

  it('lo que no es una lista de nombres se rechaza', () => {
    expect(() => saneaMesas('1,2,3')).toThrow(/lista/i);
    expect(() => saneaMesas([{ mesa: 1 }])).toThrow(/nombre o un número/i);
  });
});

describe('a qué mesa va el pedido', () => {
  const catalogo = ['1', '2', 'Terraza 1', 'Salón privado'];

  it('devuelve la etiqueta EXACTA del dueño, no la que llegó', () => {
    // El QR puede traer la mesa en minúsculas o sin tilde; la comanda tiene
    // que decir lo que dice el individual.
    expect(mesaDelCatalogo(catalogo, 'terraza 1')).toBe('Terraza 1');
    expect(mesaDelCatalogo(catalogo, 'salon privado')).toBe('Salón privado');
    expect(mesaDelCatalogo(catalogo, 2)).toBe('2');
  });

  it('una mesa QUE NO EXISTE no puede pedir', () => {
    // La guarda que sostiene todo: sin ella basta cambiar ?mesa=5 por ?mesa=99
    // en un local de ocho mesas para meterle a la cocina un plato que nadie
    // sabe a dónde llevar.
    expect(mesaDelCatalogo(catalogo, '99')).toBeNull();
    expect(mesaDelCatalogo(catalogo, 'Barra')).toBeNull();
  });

  it('sin mesa no hay pedido en mesa', () => {
    expect(mesaDelCatalogo(catalogo, '')).toBeNull();
    expect(mesaDelCatalogo(catalogo, '   ')).toBeNull();
    expect(mesaDelCatalogo(catalogo, null)).toBeNull();
    expect(mesaDelCatalogo(catalogo, undefined)).toBeNull();
    expect(mesaDelCatalogo(catalogo, { mesa: 1 })).toBeNull();
  });

  it('un local sin mesas declaradas no acepta ninguna', () => {
    expect(mesaDelCatalogo([], '1')).toBeNull();
  });
});

describe('el código público de la carta', () => {
  it('no lleva caracteres que se confundan al leerlos de un papel', () => {
    // El código va impreso y alguien lo va a teclear cuando la cámara no lea
    // el QR: un 0 que parece O manda a otro local o a ninguno.
    for (let i = 0; i < 200; i++) {
      expect(codigoDeCarta()).not.toMatch(/[01OIl]/);
    }
  });

  it('tiene largo fijo y se reconoce escrito en minúsculas', () => {
    const c = codigoDeCarta();
    expect(c).toHaveLength(10);
    expect(esCodigoDeCarta(c)).toBe(true);
    expect(esCodigoDeCarta(c.toLowerCase())).toBe(true);
  });

  it('lo que no tiene su forma no se reconoce', () => {
    expect(esCodigoDeCarta('')).toBe(false);
    expect(esCodigoDeCarta('ABC')).toBe(false);
    expect(esCodigoDeCarta('ABCDEFGHJK0')).toBe(false);
    expect(esCodigoDeCarta(null)).toBe(false);
    // Un cuid de token del dueño NO pasa por código de carta.
    expect(esCodigoDeCarta('clz1a2b3c4d5e6f7g8h9')).toBe(false);
  });

  it('dos códigos seguidos no son el mismo', () => {
    const vistos = new Set(Array.from({ length: 50 }, () => codigoDeCarta()));
    expect(vistos.size).toBe(50);
  });
});

describe('el enlace del QR de la mesa', () => {
  it('lleva el código en la ruta y la mesa como parámetro', () => {
    // Un código por mesa obligaría a reimprimir todos los individuales al
    // añadir una mesa.
    expect(enlaceDeMesa('https://zipa.app', 'ABCDEFGHJK', '5'))
      .toBe('https://zipa.app/carta/ABCDEFGHJK?mesa=5');
  });

  it('la barra final de la base no duplica la del enlace', () => {
    expect(enlaceDeMesa('https://zipa.app/', 'ABCDEFGHJK', '5'))
      .toBe('https://zipa.app/carta/ABCDEFGHJK?mesa=5');
  });

  it('una mesa con espacios o tildes sobrevive el viaje', () => {
    const url = enlaceDeMesa('https://zipa.app', 'ABCDEFGHJK', 'Salón privado');
    expect(url).toContain('mesa=Sal%C3%B3n%20privado');
    const leida = new URL(url).searchParams.get('mesa');
    expect(leida).toBe('Salón privado');
    expect(normalizaEtiqueta(leida!)).toBe('salon privado');
  });
});
