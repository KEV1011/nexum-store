import { describe, it, expect } from 'vitest';
import {
  motivoParaDescartar,
  parecido,
  revisarFilas,
  sanearCorrecciones,
  sanearFilas,
  type ContextoRevision,
  type CorreccionIA,
  type FilaRevisable,
} from './carta-ia';

const TEXTO = [
  'ARROCES',
  'ARROZ CON CAMARONES 59.000',
  'Arroz de la casa preparado con vegetales y camarones',
  'HAMBURGUESAS',
  'Hamburgesa sencilla 18.000',
  'Hamburguesa doble carne queso tocineta 24.000',
  'Gaseosa 3.500',
  'Tel 300 123 4567',
  'ADICIONALES',
  'Queso 3.000',
].join('\n');

const fila = (linea: number, nombre: string, precio: number | null, seccion: string, extra: Partial<FilaRevisable> = {}): FilaRevisable => ({
  linea, nombre, precio, descripcion: '', seccion, rol: 'plato', ...extra,
});

function carta(): FilaRevisable[] {
  return [
    fila(2, 'ARROZ CON CAMARONES', 59_000, 'Arroces'),
    fila(3, 'Arroz de la casa preparado con vegetales y camarones', null, 'Arroces'),
    fila(5, 'Hamburgesa sencilla', 18_000, 'Hamburguesas'),
    fila(6, 'Hamburguesa doble carne queso tocineta', 24_000, 'Hamburguesas'),
    fila(7, 'Gaseosa', 3_500, 'Hamburguesas'),
    fila(8, 'Tel', null, 'Hamburguesas'),
    fila(10, 'Queso', 3_000, 'Adicionales'),
  ];
}

const REVISION: ContextoRevision = { textoCrudo: TEXTO, secciones: ['Arroces', 'Hamburguesas', 'Adicionales'], modo: 'revision' };

const c = (x: Partial<CorreccionIA> & Pick<CorreccionIA, 'linea' | 'accion'>): CorreccionIA => ({
  confianza: 'alta', motivo: 'porque sí', ...x,
});

describe('la IA no puede inventar', () => {
  it('un precio que no está impreso en la carta se descarta', () => {
    const r = motivoParaDescartar(c({ linea: 3, accion: 'precio', precio: 77_777 }), carta(), REVISION);
    expect(r).toMatch(/no está impreso/);
  });

  it('un precio impreso sí vale', () => {
    expect(motivoParaDescartar(c({ linea: 3, accion: 'precio', precio: 59_000 }), carta(), REVISION)).toBeNull();
  });

  it('en una instrucción, el precio que escribe el dueño también vale', () => {
    const ctx: ContextoRevision = { ...REVISION, modo: 'instruccion', instruccion: 'la gaseosa cuesta 4.000' };
    expect(motivoParaDescartar(c({ linea: 7, accion: 'precio', precio: 4_000 }), carta(), ctx)).toBeNull();
    // Pero en una revisión por su cuenta, no: ese número no está en la carta.
    expect(motivoParaDescartar(c({ linea: 7, accion: 'precio', precio: 4_000 }), carta(), REVISION)).not.toBeNull();
  });

  it('separar ingredientes no puede añadir palabras', () => {
    const ok = c({ linea: 6, accion: 'separar_ingredientes', nombre: 'Hamburguesa doble', descripcion: 'Carne, queso y tocineta' });
    expect(motivoParaDescartar(ok, carta(), REVISION)).toBeNull();
    const inventa = c({ linea: 6, accion: 'separar_ingredientes', nombre: 'Hamburguesa doble', descripcion: 'Carne, queso, tocineta y aguacate' });
    expect(motivoParaDescartar(inventa, carta(), REVISION)).toMatch(/aguacate/);
  });

  it('corregir un nombre es arreglar letras, no rebautizar', () => {
    expect(parecido('Hamburgesa sencilla', 'Hamburguesa sencilla')).toBeGreaterThan(0.9);
    expect(motivoParaDescartar(c({ linea: 5, accion: 'nombre', nombre: 'Hamburguesa sencilla' }), carta(), REVISION)).toBeNull();
    expect(motivoParaDescartar(c({ linea: 5, accion: 'nombre', nombre: 'Perro caliente' }), carta(), REVISION)).toMatch(/no se parece/);
  });

  it('el dueño SÍ puede rebautizar si lo escribe en su instrucción', () => {
    const ctx: ContextoRevision = { ...REVISION, modo: 'instruccion', instruccion: 'la sencilla se llama La Clásica' };
    expect(motivoParaDescartar(c({ linea: 5, accion: 'nombre', nombre: 'La Clásica' }), carta(), ctx)).toBeNull();
  });

  it('una sección tiene que existir en la carta', () => {
    expect(motivoParaDescartar(c({ linea: 7, accion: 'seccion', seccion: 'Adicionales' }), carta(), REVISION)).toBeNull();
    expect(motivoParaDescartar(c({ linea: 7, accion: 'seccion', seccion: 'Bebidas frías' }), carta(), REVISION)).toMatch(/no aparece/);
  });

  it('a una fila CON precio no se la quita, ni se pega como ingredientes, ni se vuelve título', () => {
    for (const accion of ['quitar', 'es_titulo'] as const) {
      expect(motivoParaDescartar(c({ linea: 5, accion }), carta(), REVISION)).toMatch(/precio/);
    }
    expect(motivoParaDescartar(c({ linea: 5, accion: 'descripcion_de', lineaDestino: 2 }), carta(), REVISION)).toMatch(/precio/);
  });

  it('lo que no cambia nada no se propone', () => {
    expect(motivoParaDescartar(c({ linea: 10, accion: 'rol', rol: 'plato' }), carta(), REVISION)).toBe('no cambia nada');
  });
});

describe('lo que se aplica solo y lo que se pregunta', () => {
  it('confianza alta se aplica; media queda como sugerencia', () => {
    const r = revisarFilas(carta(), [
      c({ linea: 7, accion: 'rol', rol: 'acompanamiento', confianza: 'alta' }),
      c({ linea: 10, accion: 'rol', rol: 'adicional', confianza: 'media' }),
    ], REVISION);
    expect(r.aplicadas.map((x) => x.linea)).toEqual([7]);
    expect(r.sugerencias.map((x) => x.linea)).toEqual([10]);
    expect(r.filas.find((f) => f.linea === 7)!.rol).toBe('acompanamiento');
    // La sugerencia NO entra en las filas hasta que el dueño la acepte.
    expect(r.filas.find((f) => f.linea === 10)!.rol).toBe('plato');
  });

  it('un precio que sustituye a otro NUNCA se aplica solo, aunque venga con alta', () => {
    const r = revisarFilas(carta(), [c({ linea: 5, accion: 'precio', precio: 24_000, confianza: 'alta' })], REVISION);
    expect(r.aplicadas).toHaveLength(0);
    expect(r.sugerencias).toHaveLength(1);
  });

  it('un precio que faltaba sí se aplica solo con alta', () => {
    const filas = carta().map((f) => (f.linea === 5 ? { ...f, precio: null } : f));
    const r = revisarFilas(filas, [c({ linea: 5, accion: 'precio', precio: 18_000 })], REVISION);
    expect(r.aplicadas).toHaveLength(1);
  });

  it('en modo instrucción se aplica todo lo válido, aunque la confianza sea baja', () => {
    const ctx: ContextoRevision = { ...REVISION, modo: 'instruccion', instruccion: 'el queso es adicional' };
    const r = revisarFilas(carta(), [c({ linea: 10, accion: 'rol', rol: 'adicional', confianza: 'baja' })], ctx);
    expect(r.aplicadas).toHaveLength(1);
    expect(r.sugerencias).toHaveLength(0);
  });
});

describe('cada cambio trae su antes y su después', () => {
  it('los ingredientes sueltos se pegan al plato y la fila desaparece', () => {
    const r = revisarFilas(carta(), [c({ linea: 3, accion: 'descripcion_de', lineaDestino: 2 })], REVISION);
    const cambio = r.aplicadas[0]!;
    const destino = cambio.filas.find((f) => f.linea === 2)!;
    expect(destino.despues!.descripcion).toBe('Arroz de la casa preparado con vegetales y camarones');
    expect(cambio.filas.find((f) => f.linea === 3)!.despues).toBeNull();
    expect(r.filas.some((f) => f.linea === 3)).toBe(false);
    expect(cambio.titulo).toContain('ingredientes de «ARROZ CON CAMARONES»');
  });

  it('un falso plato que es título arrastra la sección de lo que venía debajo', () => {
    const filas = [
      fila(1, 'Bandeja paisa', 25_000, 'Platos'),
      fila(2, 'BEBIDAS', null, 'Platos'),
      fila(3, 'Gaseosa', 3_500, 'Platos'),
      fila(4, 'Jugo', 5_000, 'Platos'),
      fila(5, 'Torta', 6_000, 'Postres'),
    ];
    const r = revisarFilas(filas, [c({ linea: 2, accion: 'es_titulo' })], { ...REVISION, textoCrudo: 'BEBIDAS\nGaseosa 3.500' });
    expect(r.filas.map((f) => [f.linea, f.seccion])).toEqual([
      [1, 'Platos'], [3, 'Bebidas'], [4, 'Bebidas'], [5, 'Postres'],
    ]);
    // El cambio lista la fila quitada y las dos que se movieron.
    expect(r.aplicadas[0]!.filas.map((f) => f.linea)).toEqual([2, 3, 4]);
  });

  it('las aplicadas se encadenan: la segunda ve el resultado de la primera', () => {
    const r = revisarFilas(carta(), [
      c({ linea: 3, accion: 'descripcion_de', lineaDestino: 2 }),
      // Sobre una fila que la anterior ya quitó: se descarta, no revienta.
      c({ linea: 3, accion: 'quitar' }),
    ], REVISION);
    expect(r.aplicadas).toHaveLength(1);
    expect(r.descartadas.map((d) => d.razon)).toEqual(['la fila ya no existe']);
  });

  it('una corrección repetida se cuenta una vez', () => {
    const r = revisarFilas(carta(), [
      c({ linea: 7, accion: 'rol', rol: 'acompanamiento' }),
      c({ linea: 7, accion: 'rol', rol: 'adicional' }),
    ], REVISION);
    expect(r.aplicadas).toHaveLength(1);
    expect(r.descartadas[0]!.razon).toBe('repetida');
  });
});

describe('lo que llega de fuera se sanea sin tumbar lo demás', () => {
  it('una corrección malformada se cae sola', () => {
    const out = sanearCorrecciones({
      correcciones: [
        { linea: 7, accion: 'rol', rol: 'acompanamiento', confianza: 'alta', motivo: 'bebida' },
        { linea: 'x', accion: 'rol' },
        { linea: 3, accion: 'borrar_todo' },
        { linea: 5, accion: 'rol', rol: 'postre', confianza: 'alta', motivo: '' },
        null,
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[1]!.rol).toBeUndefined();
  });

  it('una confianza desconocida baja a «baja», nunca sube', () => {
    expect(sanearCorrecciones({ correcciones: [{ linea: 1, accion: 'quitar', confianza: 'segura' }] })[0]!.confianza).toBe('baja');
  });

  it('las filas del portal: una línea repetida se queda con la primera', () => {
    const f = sanearFilas([
      { linea: 1, nombre: 'A', precio: 1000, rol: 'plato' },
      { linea: 1, nombre: 'B', precio: 2000 },
      { linea: 2, nombre: 'C', precio: '', rol: 'inventado' },
    ]);
    expect(f.map((x) => x.nombre)).toEqual(['A', 'C']);
    expect(f[1]!.precio).toBeNull();
    expect(f[1]!.rol).toBe('plato');
  });
});
