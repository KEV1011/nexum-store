/**
 * Las tres acciones nuevas del revisor de la carta y lo que NO las deja pasar.
 *
 * `precio_de_seccion`, `agrupar_tamanos` y `partir_fila` son las que escriben
 * precios en varias filas o crean filas nuevas, así que cada una tiene una
 * guarda que se puede comprobar contra la carta impresa — y ninguna se aplica
 * sola, ni con confianza alta: el dueño las ve y las acepta.
 */
import { describe, expect, it } from 'vitest';

import { revisarFilas, sanearCorrecciones, type ContextoRevision, type CorreccionIA, type FilaRevisable } from './carta-ia';

const fila = (linea: number, nombre: string, precio: number | null, seccion = 'Shots', extra: Partial<FilaRevisable> = {}): FilaRevisable => ({
  linea, nombre, precio, descripcion: '', seccion, rol: 'plato', ...extra,
});

const ctx = (textoCrudo: string, modo: ContextoRevision['modo'] = 'revision'): ContextoRevision => ({
  textoCrudo, secciones: ['Shots', 'Bebidas', 'Picadas'], modo,
});

const corr = (c: Partial<CorreccionIA> & { linea: number; accion: CorreccionIA['accion'] }): CorreccionIA => ({
  confianza: 'alta', motivo: 'Prueba.', ...c,
});

describe('precio_de_seccion', () => {
  const SHOTS = 'SHOTS\nTequila\nAguardiente\nRon\nBAJOS $8.000 / ALTOS $10.000';
  const filas = [fila(2, 'Tequila', null), fila(3, 'Aguardiente', null), fila(4, 'Ron', null), fila(5, 'BAJOS / ALTOS', null)];

  it('con dos precios, cada plato de la sección viene en esos dos tamaños', () => {
    const r = revisarFilas(filas, [corr({ linea: 5, accion: 'precio_de_seccion' })], ctx(SHOTS));
    // Nunca sola, aunque la IA diga «alta».
    expect(r.aplicadas).toHaveLength(0);
    const [s] = r.sugerencias;
    expect(s!.filas).toEqual([{ linea: 5, antes: filas[3], despues: null }]);
    expect(s!.variantes!.map((v) => [v.nombre, v.opciones.map((o) => [o.nombre, o.precio]), v.lineas])).toEqual([
      ['Tequila', [['Bajo', 8000], ['Alto', 10000]], [2]],
      ['Aguardiente', [['Bajo', 8000], ['Alto', 10000]], [3]],
      ['Ron', [['Bajo', 8000], ['Alto', 10000]], [4]],
    ]);
  });

  it('con un solo precio para todos, cada plato lo toma', () => {
    const r = revisarFilas(
      [fila(2, 'Tequila', null), fila(3, 'Ron', null), fila(4, 'Todos a', 8000)],
      [corr({ linea: 4, accion: 'precio_de_seccion' })],
      ctx('SHOTS\nTequila\nRon\nTodos a $8.000', 'instruccion'),
    );
    expect(r.filas.map((f) => [f.nombre, f.precio])).toEqual([['Tequila', 8000], ['Ron', 8000]]);
  });

  it('una fila que no es un precio de sección impreso se descarta', () => {
    const r = revisarFilas(
      [fila(2, 'Tequila', null), fila(3, 'Mojito', 18000)],
      [corr({ linea: 3, accion: 'precio_de_seccion' })],
      ctx('SHOTS\nTequila\nMojito 18.000'),
    );
    expect(r.sugerencias).toHaveLength(0);
    expect(r.descartadas[0]!.razon).toMatch(/no es el precio de una sección/);
  });
});

describe('agrupar_tamanos', () => {
  it('varias filas que son el mismo plato: cada tamaño escrito en su fila', () => {
    const filas = [fila(1, 'Picada pequeña', 39000, 'Picadas'), fila(2, 'Picada grande', 80000, 'Picadas')];
    const r = revisarFilas(filas, [corr({
      linea: 1, accion: 'agrupar_tamanos', lineas: [1, 2], tamanos: ['pequeña', 'grande'], nombre: 'Picada',
    })], ctx('PICADAS\nPicada pequeña 39.000\nPicada grande 80.000'));
    const v = r.sugerencias[0]!.variantes![0]!;
    expect(v).toMatchObject({ nombre: 'Picada', precioBase: 39000, lineas: [1, 2], faltanNombres: false });
    expect(v.opciones).toEqual([
      { nombre: 'Pequeña', precio: 39000, precioDelta: 0 },
      { nombre: 'Grande', precio: 80000, precioDelta: 41000 },
    ]);
    // Las filas no cambian: el portal las esconde dentro del grupo.
    expect(r.sugerencias[0]!.filas).toEqual([]);
  });

  it('un tamaño o un nombre que no está en las filas se descarta', () => {
    const filas = [fila(1, 'Picada pequeña', 39000, 'Picadas'), fila(2, 'Picada grande', 80000, 'Picadas')];
    const inventado = revisarFilas(filas, [corr({
      linea: 1, accion: 'agrupar_tamanos', lineas: [1, 2], tamanos: ['personal', 'grande'], nombre: 'Picada',
    })], ctx(''));
    expect(inventado.descartadas[0]!.razon).toMatch(/no está escrito en su fila/);
    const otroPlato = revisarFilas(filas, [corr({
      linea: 1, accion: 'agrupar_tamanos', lineas: [1, 2], tamanos: ['pequeña', 'grande'], nombre: 'Bandeja',
    })], ctx(''));
    expect(otroPlato.descartadas[0]!.razon).toMatch(/no está en todas las filas/);
  });

  it('filas de secciones distintas no son el mismo plato', () => {
    const r = revisarFilas(
      [fila(1, 'Jugo pequeño', 5000, 'Bebidas'), fila(2, 'Jugo grande', 7000, 'Picadas')],
      [corr({ linea: 1, accion: 'agrupar_tamanos', lineas: [1, 2], tamanos: ['pequeño', 'grande'], nombre: 'Jugo' })],
      ctx(''),
    );
    expect(r.descartadas[0]!.razon).toMatch(/secciones distintas/);
  });

  it('una fila con varios precios: los precios son los IMPRESOS y los nombres tienen que estarlo', () => {
    const texto = 'PIZZAS Personal Mediana Grande\nHawaiana 12.000 22.000 32.000';
    const filas = [fila(4, 'Hawaiana', null, 'Pizzas')];
    const bien = revisarFilas(filas, [corr({ linea: 4, accion: 'agrupar_tamanos', tamanos: ['Personal', 'Mediana', 'Grande'] })], ctx(texto));
    expect(bien.sugerencias[0]!.variantes![0]!.opciones.map((o) => o.precio)).toEqual([12000, 22000, 32000]);
    const mal = revisarFilas(filas, [corr({ linea: 4, accion: 'agrupar_tamanos', tamanos: ['Personal', 'Mediana', 'Familiar'] })], ctx(texto));
    expect(mal.descartadas[0]!.razon).toMatch(/no está escrito en la carta/);
  });

  it('una fila no queda en dos grupos', () => {
    const filas = [fila(1, 'Picada pequeña', 39000, 'Picadas'), fila(2, 'Picada grande', 80000, 'Picadas'), fila(3, 'Picada mediana', 55000, 'Picadas')];
    const r = revisarFilas(filas, [
      corr({ linea: 1, accion: 'agrupar_tamanos', lineas: [1, 2], tamanos: ['pequeña', 'grande'], nombre: 'Picada' }),
      corr({ linea: 3, accion: 'agrupar_tamanos', lineas: [3, 2], tamanos: ['mediana', 'grande'], nombre: 'Picada' }),
    ], ctx(''));
    expect(r.sugerencias).toHaveLength(1);
    expect(r.descartadas.map((d) => d.razon)).toContain('esa fila ya está en otro grupo de tamaños');
  });
});

describe('partir_fila', () => {
  const texto = 'BEBIDAS\nGaseosa 3.500 Jugo 5.000\nLimonada 4.000';
  const filas = [fila(5, 'Gaseosa Jugo', null, 'Bebidas'), fila(6, 'Limonada', 4000, 'Bebidas')];

  it('dos platos pegados en una fila se separan, con los precios de SU renglón', () => {
    const r = revisarFilas(filas, [corr({
      linea: 5, accion: 'partir_fila', partes: [{ nombre: 'Gaseosa', precio: 3500 }, { nombre: 'Jugo', precio: 5000 }],
    })], ctx(texto, 'instruccion'));
    expect(r.filas.map((f) => [f.linea, f.nombre, f.precio])).toEqual([
      [5, 'Gaseosa', 3500],
      [5.1, 'Jugo', 5000],
      [6, 'Limonada', 4000],
    ]);
    // La fila nueva va con «antes: null»: deshacer la quita.
    expect(r.aplicadas[0]!.filas.find((c) => c.linea === 5.1)?.antes).toBeNull();
  });

  it('un precio de OTRO renglón de la carta no se acepta', () => {
    const r = revisarFilas(filas, [corr({
      linea: 5, accion: 'partir_fila', partes: [{ nombre: 'Gaseosa', precio: 3500 }, { nombre: 'Jugo', precio: 4000 }],
    })], ctx(texto));
    expect(r.descartadas[0]!.razon).toMatch(/no están juntos en un renglón/);
  });

  it('ni una palabra que la fila no traía, ni partir un plato que ya tiene precio', () => {
    const inventa = revisarFilas(filas, [corr({
      linea: 5, accion: 'partir_fila', partes: [{ nombre: 'Gaseosa', precio: 3500 }, { nombre: 'Jugo de mora', precio: 5000 }],
    })], ctx(texto));
    expect(inventa.descartadas[0]!.razon).toMatch(/añade palabras/);
    const conPrecio = revisarFilas(filas, [corr({
      linea: 6, accion: 'partir_fila', partes: [{ nombre: 'Limonada', precio: 4000 }, { nombre: 'Jugo', precio: 5000 }],
    })], ctx(texto));
    expect(conPrecio.descartadas[0]!.razon).toMatch(/ya tiene un precio/);
  });

  it('se lee de la salida del modelo, con el número de línea con decimal', () => {
    const [c] = sanearCorrecciones({
      correcciones: [{ linea: '5.1', accion: 'partir_fila', confianza: 'media', motivo: 'x', partes: [{ nombre: 'Jugo', precio: 5000 }, { nombre: 'x' }] }],
    });
    expect(c).toMatchObject({ linea: 5.1, partes: [{ nombre: 'Jugo', precio: 5000 }] });
  });
});
