// La evaluación del lector de cartas del 26 de octubre, convertida en pruebas.
//
// Cada bloque es una forma REAL de imprimir una carta en la que el lector se
// equivocaba. Varias eran de plata —un precio leído mal sin aviso—, que es la
// clase de error que este lector existe para no cometer.

import { describe, expect, it } from 'vitest';
import { parsearCarta, preciosDeLinea } from './carta-foto';
import { sugerirVariantes } from './carta-variantes';
import { correccionDePalabra, corregirErratas } from './erratas-carta';
import { revisarFilas, type FilaRevisable } from './carta-ia';

const fila = (texto: string) => parsearCarta(texto).lineas;

describe('los números de la línea', () => {
  it('no pega la cantidad al precio (era de plata)', () => {
    // Antes: $616.000 y $36.000, sin aviso, porque eran UN precio.
    expect(preciosDeLinea('Alitas BBQ x6 16.000')).toEqual([16000]);
    expect(preciosDeLinea('Empanadas x3 6.000')).toEqual([6000]);
    expect(preciosDeLinea('Alitas x 12 30.000')).toEqual([30000]);
  });

  it('cuatro precios seguidos son cuatro, no un número de veinte cifras', () => {
    expect(preciosDeLinea('Hawaiana 12.000 22.000 32.000 42.000'))
      .toEqual([12000, 22000, 32000, 42000]);
  });

  it('las medidas no son precios', () => {
    expect(preciosDeLinea('Agua 600ml 3.000')).toEqual([3000]);
    expect(preciosDeLinea('Chorizo 500 g 12.000')).toEqual([12000]);
    expect(preciosDeLinea('Gaseosa 1.5 L 7.000')).toEqual([7000]);
  });

  it('lee «8 mil» y los miles con espacio', () => {
    expect(preciosDeLinea('Caldo de costilla 8 mil')).toEqual([8000]);
    expect(preciosDeLinea('Churrasco 28 000')).toEqual([28000]);
  });

  it('un teléfono y una hora no son precios', () => {
    expect(preciosDeLinea('Domicilios 300 123 4567')).toEqual([]);
    expect(preciosDeLinea('Abrimos 11:30 am')).toEqual([]);
  });

  it('el nombre conserva la cantidad que trae el plato', () => {
    expect(fila('Alitas BBQ x6 16.000')[0]).toMatchObject({ nombre: 'Alitas BBQ x6', precio: 16000 });
    expect(fila('Agua 600ml 3.000')[0]).toMatchObject({ nombre: 'Agua 600ml', precio: 3000 });
  });
});

describe('lo que no es de la carta', () => {
  const carta = parsearCarta([
    'Domicilios 300 123 4567',
    'HAMBURGUESAS',
    'Lunes a sábado 11:00 am - 9:00 pm',
    'Calle 5 # 3-40 Pamplona',
    'Instagram @donpepe',
    'Hamburguesa sencilla 12.000',
    'Almuerzo ejecutivo de lunes a viernes 15.000',
  ].join('\n'));

  it('no sale como plato ni como sección', () => {
    expect(carta.secciones).toEqual(['Hamburguesas']);
    expect(carta.lineas.map((l) => l.nombre)).toEqual([
      'Hamburguesa sencilla', 'Almuerzo ejecutivo de lunes a viernes',
    ]);
    expect(carta.lineas[0]!.seccion).toBe('Hamburguesas');
  });

  it('se devuelve aparte, con su motivo', () => {
    expect(carta.ignoradas.map((r) => r.linea)).toEqual([1, 3, 4, 5]);
    expect(carta.ignoradas[0]!.motivo).toMatch(/teléfono/i);
  });

  it('un plato con precio NO se descarta por mencionar los días', () => {
    expect(carta.lineas[1]!.precio).toBe(15000);
  });
});

describe('cómo se llama cada precio', () => {
  it('el encabezado de la tabla nombra los tamaños de la pizza', () => {
    const lineas = fila('PIZZAS\nPersonal  Mediana  Grande  Familiar\nHawaiana 12.000 22.000 32.000 42.000');
    expect(lineas).toHaveLength(1);
    expect(lineas[0]!.tamanos).toEqual(['Personal', 'Mediana', 'Grande', 'Familiar']);
    const [v] = sugerirVariantes(lineas);
    expect(v).toMatchObject({ nombre: 'Hawaiana', precioBase: 12000, grupo: 'Tamaño', faltanNombres: false });
    expect(v!.opciones.map((o) => `${o.nombre}:${o.precio}`))
      .toEqual(['Personal:12000', 'Mediana:22000', 'Grande:32000', 'Familiar:42000']);
  });

  it('también con el título y los tamaños en el mismo renglón', () => {
    const carta = parsearCarta('PIZZAS  PERS.  MED.  GDE.  FAM.\nHawaiana 12.000 22.000 32.000 42.000');
    expect(carta.secciones).toEqual(['Pizzas']);
    expect(carta.lineas[0]!.tamanos).toEqual(['Pers', 'Med', 'Gde', 'Fam']);
  });

  it('el encabezado deja de valer en la siguiente sección', () => {
    const lineas = fila('PIZZAS\nPersonal Mediana\nHawaiana 12.000 22.000\nJUGOS\nMora 5.000 7.000');
    expect(lineas[1]!.tamanos).toBeUndefined();
  });

  it('el nombre lo dice: «en agua / en leche»', () => {
    const [l] = fila('Jugo en agua / en leche 5.000 / 7.000');
    expect(l).toMatchObject({ nombre: 'Jugo', tamanos: ['en agua', 'en leche'] });
    const [v] = sugerirVariantes([l!]);
    expect(v).toMatchObject({ grupo: 'Opción', faltanNombres: false });
  });

  it('sin encabezado ni nombres, los tamaños quedan por nombrar', () => {
    const [v] = sugerirVariantes(fila('Hawaiana 12.000 22.000 32.000 42.000'));
    expect(v!.faltanNombres).toBe(true);
  });

  it('los ingredientes de abajo son de la pizza de varios precios', () => {
    const [l] = fila('Hawaiana 12.000 22.000\njamón, piña y queso');
    expect(l!.descripcion).toBe('jamón, piña y queso');
  });
});

describe('combos', () => {
  const lineas = fila([
    'COMBOS',
    'Combo 1: Hamburguesa sencilla + papas + gaseosa 18.000',
    'Combo personal: perro + papas + jugo 15.000',
    'Combo familiar (4 hamburguesas, papas grandes, gaseosa) 65.000',
    'Hazlo combo +6.000',
    'Agrégale papas y gaseosa por 5.000',
  ].join('\n'));

  it('un combo es un plato y lo que trae va en su descripción', () => {
    expect(lineas[0]).toMatchObject({
      nombre: 'Combo 1', descripcion: 'Hamburguesa sencilla + papas + gaseosa', rol: 'plato',
    });
  });

  it('«Hazlo combo» y «Agrégale…» se le suman a un plato', () => {
    expect(lineas[3]).toMatchObject({ nombre: 'Hazlo combo', precio: 6000, rol: 'adicional' });
    expect(lineas[4]).toMatchObject({ nombre: 'Agrégale papas y gaseosa', precio: 5000, rol: 'adicional' });
  });

  it('dos combos distintos NO son tamaños del mismo', () => {
    expect(sugerirVariantes(lineas)).toEqual([]);
  });
});

describe('erratas', () => {
  it('corrige las de siempre, con plural y mayúsculas', () => {
    expect(correccionDePalabra('Hamburgesa')).toBe('hamburguesa');
    expect(corregirErratas('HAMBURGESAS').texto).toBe('HAMBURGUESAS');
    expect(corregirErratas('Salchipapa especail').texto).toBe('Salchipapa especial');
    expect(corregirErratas('Arepa rellana').texto).toBe('Arepa rellena');
  });

  it('no toca lo que está bien escrito ni los nombres de fantasía', () => {
    for (const bien of ['Bebidas frías', 'Pan francés', 'Pechugón', 'La Bestia', 'Ranchero',
      'Frutas', 'Chicharron', 'Pizza familiar', 'Papas criollas']) {
      expect(corregirErratas(bien).texto).toBe(bien);
    }
  });

  it('la fila dice qué se corrigió', () => {
    const [l] = fila('Hamburgesa doble 15.000');
    expect(l).toMatchObject({ nombre: 'Hamburguesa doble', precio: 15000 });
    expect(l!.aviso).toMatch(/«Hamburgesa» por «Hamburguesa»/);
  });
});

describe('el revisor con IA no puede dejar UN precio de varios', () => {
  const filas: FilaRevisable[] = [
    { linea: 2, nombre: 'Hawaiana', precio: null, descripcion: '', seccion: 'Pizzas', rol: 'plato' },
  ];
  const textoCrudo = 'PIZZAS\nHawaiana 12.000 22.000 32.000 42.000';

  it('se descarta, aunque el precio esté impreso', () => {
    const r = revisarFilas(filas, [{
      linea: 2, accion: 'precio', precio: 12000, confianza: 'alta', motivo: 'Es el precio.',
    }], { textoCrudo, secciones: ['Pizzas'], modo: 'revision' });
    expect(r.aplicadas).toEqual([]);
    expect(r.sugerencias).toEqual([]);
    expect(r.descartadas[0]!.razon).toMatch(/varios precios/);
  });

  it('un plato de un solo precio sí se corrige', () => {
    const r = revisarFilas(
      [{ linea: 2, nombre: 'Bandeja paisa', precio: null, descripcion: '', seccion: 'Platos', rol: 'plato' }],
      [{ linea: 2, accion: 'precio', precio: 25000, confianza: 'alta', motivo: 'Está impreso.' }],
      { textoCrudo: 'PLATOS\nBandeja paisa 25.000', secciones: ['Platos'], modo: 'revision' },
    );
    expect(r.aplicadas).toHaveLength(1);
  });
});
