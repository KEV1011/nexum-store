import { describe, expect, it } from 'vitest';
import { revisarFilas, type CorreccionIA } from './carta-ia';
import {
  claveDeSeccion,
  conflictoConActual,
  datosDeCambio,
  enEscrituraNormal,
  filasParaRevisor,
  incorporarRevisionIA,
  revisarCatalogo,
  revisarConReglas,
  sanearCambiosPedidos,
  seccionesDelTrabajo,
  terminarRevision,
  type ProductoRevisable,
} from './revision-catalogo';

let n = 0;
const prod = (over: Partial<ProductoRevisable>): ProductoRevisable => ({
  id: `p${++n}`,
  name: 'Plato',
  description: '',
  category: 'General',
  price: 10_000,
  suggestAsAddon: false,
  isAvailable: true,
  ...over,
});

describe('el nombre del plato', () => {
  it('separa los ingredientes, quita el grito y corrige la errata de una vez', () => {
    const p = prod({ name: 'HAMBURGESA SENCILLA (carne, queso, tocineta)' });
    const r = revisarCatalogo([p]);
    expect(r.propuestas).toHaveLength(1);
    const [pr] = r.propuestas;
    expect(pr!.despues).toEqual({ name: 'Hamburguesa sencilla', description: 'carne, queso, tocineta' });
    expect(pr!.antes).toEqual({ name: 'HAMBURGESA SENCILLA (carne, queso, tocineta)', description: '' });
    expect(pr!.razones.join(' | ')).toMatch(/ingredientes estaban dentro del nombre/);
    expect(pr!.razones.join(' | ')).toMatch(/mayúsculas/);
    expect(pr!.razones.join(' | ')).toMatch(/«Hamburgesa» por «Hamburguesa»/);
    // Con una errata dentro, el grupo nace SIN MARCAR: antes nacía marcado,
    // y una palabra de verdad a una letra de otra («cereza» → «cerveza») se
    // aplicaba con un «Aplicar» distraído. Lo demás del grupo se ve igual.
    expect(pr!.marcada).toBe(false);
    expect(pr!.origen).toEqual(['reglas']);
  });

  it('sin errata, lo seguro sí nace marcado', () => {
    const r = revisarCatalogo([prod({ name: 'HAMBURGUESA SENCILLA (carne, queso, tocineta)' })]);
    expect(r.propuestas[0]!.marcada).toBe(true);
  });

  it('la errata sola nace sin marcar, y una palabra de verdad no se toca', () => {
    const r = revisarCatalogo([
      prod({ name: 'Hamburgesa doble' }),
      prod({ name: 'Michelada de cereza', description: 'Cereza macerada, maracuyá salteada' }),
    ]);
    expect(r.propuestas).toHaveLength(1);
    expect(r.propuestas[0]!.despues.name).toBe('Hamburguesa doble');
    expect(r.propuestas[0]!.marcada).toBe(false);
  });

  it('la descripción que escribió el dueño manda: no separa', () => {
    const p = prod({ name: 'Picada (para dos)', description: 'Carne, chorizo y papa criolla' });
    expect(revisarCatalogo([p]).propuestas).toEqual([]);
  });

  it('quita viñetas y espacios de sobra', () => {
    const [pr] = revisarCatalogo([prod({ name: '● Carne  asada' })]).propuestas;
    expect(pr!.despues.name).toBe('Carne asada');
  });

  it('respeta las siglas y lo que lleva números', () => {
    expect(enEscrituraNormal('ALITAS BBQ X6')).toBe('Alitas BBQ X6');
    expect(enEscrituraNormal('JUGO 350ML')).toBe('Jugo 350ML');
    expect(enEscrituraNormal('Alitas BBQ')).toBeNull();
    expect(enEscrituraNormal('BBQ')).toBeNull();
  });

  it('no toca lo que ya está bien escrito', () => {
    const r = revisarCatalogo([
      prod({ name: 'La Bestia' }),
      prod({ name: 'Pechugón', description: 'Pechuga apanada, papas' }),
      prod({ name: 'Empanadas (3)' }),
    ]);
    expect(r.propuestas).toEqual([]);
  });

  it('corrige también los ingredientes', () => {
    const [pr] = revisarCatalogo([prod({ name: 'Salchipapa', description: 'Papas, salchicha y tocineta especail' })]).propuestas;
    expect(pr!.despues.description).toBe('Papas, salchicha y tocineta especial');
  });
});

describe('las secciones', () => {
  it('la misma sección escrita de varias formas queda en una', () => {
    const ps = [
      prod({ category: 'Bebidas' }), prod({ category: 'Bebidas' }), prod({ category: 'Bebidas' }),
      prod({ category: 'BEBIDAS' }), prod({ category: 'bebida ' }),
    ];
    const r = revisarCatalogo(ps);
    const sec = r.propuestas.filter((p) => p.grupo === 'seccion');
    expect(sec.map((p) => p.despues.category)).toEqual(['Bebidas', 'Bebidas']);
    expect(sec[0]!.razones[0]).toMatch(/3 formas/);
  });

  it('una sección toda en mayúsculas se escribe normal', () => {
    const r = revisarCatalogo([prod({ category: 'HAMBURGUESAS' }), prod({ category: 'HAMBURGUESAS' })]);
    expect(r.propuestas.map((p) => p.despues.category)).toEqual(['Hamburguesas', 'Hamburguesas']);
  });

  it('el plural no hace otra sección', () => {
    expect(claveDeSeccion('Hamburguesa')).toBe(claveDeSeccion('HAMBURGUESAS '));
    expect(claveDeSeccion('Jugos')).not.toBe(claveDeSeccion('Bebidas'));
  });
});

describe('el precio nunca se cambia, se avisa', () => {
  const bebidas = (precio: number, name = 'Jugo') => prod({ name, category: 'Bebidas', price: precio });

  it('un precio que no cuadra con su sección', () => {
    const r = revisarCatalogo([
      bebidas(4000, 'Limonada'), bebidas(3500, 'Gaseosa'), bebidas(5000, 'Jugo de mora'),
      bebidas(4500, 'Agua'), bebidas(35_000, 'Cerveza'),
    ]);
    const a = r.avisos.find((x) => x.tipo === 'precio_atipico');
    expect(a!.texto).toMatch(/Cerveza.*\$35\.000.*sobra un cero/);
    expect(r.propuestas.every((p) => !('price' in p.despues))).toBe(true);
  });

  it('una sección variada de verdad no salta', () => {
    const combos = [15_000, 22_000, 35_000, 48_000, 65_000].map((price, i) =>
      prod({ name: `Combo ${i + 1}`, category: 'Combos', price }));
    expect(revisarCatalogo(combos).avisos).toEqual([]);
  });

  it('con pocos platos en la sección no se compara', () => {
    const r = revisarCatalogo([bebidas(4000), bebidas(40_000, 'Otro')]);
    expect(r.avisos.filter((x) => x.tipo === 'precio_atipico')).toEqual([]);
  });

  it('en $0, sin ceros o con un precio raro', () => {
    const r = revisarCatalogo([
      prod({ name: 'Gratis', price: 0 }), prod({ name: 'Corto', price: 25 }), prod({ name: 'Raro', price: 12_345 }),
      prod({ name: 'Oculto', price: 0, isAvailable: false }),
    ]);
    expect(r.avisos.map((a) => a.tipo).sort()).toEqual(['precio_raro', 'precio_raro', 'sin_precio']);
  });

  it('un plato repetido con precios distintos sugiere tamaños', () => {
    const r = revisarCatalogo([prod({ name: 'Picada', price: 39_000 }), prod({ name: 'picada ', price: 46_000 })]);
    const a = r.avisos.find((x) => x.tipo === 'duplicado')!;
    expect(a.productIds).toHaveLength(2);
    expect(a.texto).toMatch(/tamaños/);
  });
});

describe('la IA trabaja encima de las reglas, con sus guardas', () => {
  const productos = [
    prod({ id: 'h', name: 'Hamburguesa sencilla', category: 'Hamburguesas', price: 12_000 }),
    prod({ id: 'g', name: 'Gaseosa', category: 'Hamburguesas', price: 3_500 }),
    prod({ id: 'q', name: 'Queso extra', category: 'Hamburguesas', price: 3_000 }),
    prod({ id: 'b', name: 'Agua', category: 'Bebidas', price: 3_000 }),
  ];

  function conIA(correcciones: CorreccionIA[]) {
    const t = revisarConReglas(productos);
    const filas = filasParaRevisor(t);
    const revision = revisarFilas(filas, correcciones, {
      textoCrudo: '', secciones: seccionesDelTrabajo(t), modo: 'revision',
    });
    incorporarRevisionIA(t, revision);
    return terminarRevision(t);
  }

  it('lo seguro nace marcado; lo dudoso, no', () => {
    const r = conIA([
      { linea: 2, accion: 'rol', rol: 'acompanamiento', confianza: 'alta', motivo: 'Es una bebida.' },
      { linea: 2, accion: 'seccion', seccion: 'Bebidas', confianza: 'media', motivo: 'Va con las bebidas.' },
    ]);
    const tipo = r.propuestas.find((p) => p.grupo === 'tipo')!;
    expect(tipo).toMatchObject({ productId: 'g', despues: { suggestAsAddon: true }, marcada: true, origen: ['ia'] });
    const sec = r.propuestas.find((p) => p.grupo === 'seccion')!;
    expect(sec).toMatchObject({ productId: 'g', despues: { category: 'Bebidas' }, marcada: false });
  });

  it('no puede cambiar un precio: no hay carta impresa', () => {
    const r = conIA([{ linea: 1, accion: 'precio', precio: 13_000, confianza: 'alta', motivo: 'x' }]);
    expect(r.propuestas).toEqual([]);
  });

  it('no puede inventar una sección', () => {
    const r = conIA([{ linea: 1, accion: 'seccion', seccion: 'Especiales', confianza: 'alta', motivo: 'x' }]);
    expect(r.propuestas).toEqual([]);
  });

  it('no puede quitar un producto', () => {
    const r = conIA([{ linea: 3, accion: 'quitar', confianza: 'alta', motivo: 'x' }]);
    expect(r.propuestas).toEqual([]);
  });

  it('un adicional no se convierte solo: queda como aviso', () => {
    const r = conIA([{ linea: 3, accion: 'rol', rol: 'adicional', confianza: 'alta', motivo: 'Se suma a un plato.' }]);
    expect(r.propuestas).toEqual([]);
    expect(r.avisos.find((a) => a.tipo === 'parece_adicional')!.productIds).toEqual(['q']);
  });

  it('una errata que el vocabulario no conoce', () => {
    const r = conIA([{ linea: 1, accion: 'nombre', nombre: 'Hamburguesa sencila', confianza: 'alta', motivo: 'x' }]);
    // «sencila» se parece: pasa la guarda (es una corrección de letras).
    expect(r.propuestas[0]!.despues.name).toBe('Hamburguesa sencila');
  });

  it('reglas e IA dudosa en el mismo campo: el grupo nace sin marcar', () => {
    const t = revisarConReglas([prod({ id: 'x', name: 'HAMBURGUESA CAMARON', category: 'Hamburguesas' })]);
    const revision = revisarFilas(filasParaRevisor(t), [
      { linea: 1, accion: 'nombre', nombre: 'Hamburguesa camarón', confianza: 'media', motivo: 'Lleva tilde.' },
    ], { textoCrudo: '', secciones: seccionesDelTrabajo(t), modo: 'revision' });
    incorporarRevisionIA(t, revision);
    const [pr] = terminarRevision(t).propuestas;
    expect(pr).toMatchObject({ despues: { name: 'Hamburguesa camarón' }, marcada: false });
    expect(pr!.origen.sort()).toEqual(['ia', 'reglas']);
    expect(pr!.antes.name).toBe('HAMBURGUESA CAMARON');
  });
});

describe('aplicar lo aprobado', () => {
  it('el precio no pasa, se mande lo que se mande', () => {
    const [c] = sanearCambiosPedidos([{
      productId: 'p', antes: { name: 'a', price: 1 }, despues: { name: 'b', price: 99_999 },
    }]);
    expect(c!.despues).toEqual({ name: 'b' });
  });

  it('un campo sin su «antes» no se aplica', () => {
    expect(sanearCambiosPedidos([{ productId: 'p', antes: {}, despues: { name: 'b' } }])).toEqual([]);
  });

  it('si el dueño lo cambió mientras tanto, no se pisa', () => {
    const actual = prod({ name: 'Hamburguesa doble' });
    const c = { productId: actual.id, antes: { name: 'Hamburgesa doble' }, despues: { name: 'Hamburguesa doble!' } };
    expect(conflictoConActual(actual, c)).toMatch(/Cambió/);
    expect(conflictoConActual(prod({ name: 'Hamburgesa doble' }), c)).toBeNull();
  });

  it('un nombre que queda vacío se rechaza diciendo por qué', () => {
    expect(() => datosDeCambio({ productId: 'p', antes: { name: 'a' }, despues: { name: '🍔' } })).toThrow(/emoji/);
  });

  it('una descripción vacía se guarda como vacía', () => {
    expect(datosDeCambio({ productId: 'p', antes: { description: 'x' }, despues: { description: '  ' } }))
      .toEqual({ description: null });
  });
});
