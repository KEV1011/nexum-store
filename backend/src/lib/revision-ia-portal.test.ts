import { describe, it, expect } from 'vitest';
import { revisarFilas, type ContextoRevision, type CorreccionIA, type FilaRevisable } from './carta-ia';
import {
  aplicarCambio,
  deshacerCambio,
  filaParaRevisar,
  type FilaDePantalla,
} from '../../../app/negocio/[token]/catalogo/revision-ia';

/**
 * El servidor DECIDE los cambios y el portal los EJECUTA. Son dos programas y
 * esta prueba los ata: si el portal aplicara un cambio de forma distinta a como
 * lo calculó el servidor, el dueño vería una lista y crearía otra.
 */

const TEXTO = 'ARROCES\nARROZ CON CAMARONES 59.000\nArroz de la casa con camarones\nBEBIDAS\nGaseosa 3.500\nJugo 5.000';

const pantalla = (): FilaDePantalla[] => [
  { id: 0, linea: 2, nombre: 'ARROZ CON CAMARONES', precio: '59000', descripcion: '', seccion: 'Arroces', rol: 'plato' },
  { id: 1, linea: 3, nombre: 'Arroz de la casa con camarones', precio: '', descripcion: '', seccion: 'Arroces', rol: 'plato', aviso: 'Sin precio' },
  { id: 2, linea: 4, nombre: 'BEBIDAS', precio: '', descripcion: '', seccion: 'Arroces', rol: 'plato' },
  { id: 3, linea: 5, nombre: 'Gaseosa', precio: '3.500', descripcion: '', seccion: 'Arroces', rol: 'plato' },
  { id: 4, linea: 6, nombre: 'Jugo', precio: '5000', descripcion: '', seccion: 'Arroces', rol: 'plato' },
];

const CTX: ContextoRevision = { textoCrudo: TEXTO, secciones: ['Arroces'], modo: 'revision' };

const CORRECCIONES: CorreccionIA[] = [
  { linea: 3, accion: 'descripcion_de', lineaDestino: 2, confianza: 'alta', motivo: 'Va debajo del arroz.' },
  { linea: 4, accion: 'es_titulo', confianza: 'alta', motivo: 'Es un título.' },
  { linea: 5, accion: 'rol', rol: 'acompanamiento', confianza: 'alta', motivo: 'Bebida.' },
];

function enServidor(): ReturnType<typeof revisarFilas> {
  return revisarFilas(pantalla().map(filaParaRevisar), CORRECCIONES, CTX);
}

const comoRevisable = (f: FilaDePantalla[]): FilaRevisable[] => f.map(filaParaRevisar);

describe('el portal aplica exactamente lo que el servidor calculó', () => {
  it('aplicadas en orden, las filas del portal quedan iguales a las del servidor', () => {
    const r = enServidor();
    expect(r.aplicadas).toHaveLength(3);
    let filas = pantalla();
    for (const c of r.aplicadas) {
      const x = aplicarCambio(filas, c);
      expect(x.ok).toBe(true);
      filas = x.filas;
    }
    expect(comoRevisable(filas)).toEqual(r.filas);
  });

  it('deshacer todo en orden inverso deja la pantalla como estaba (y en su sitio)', () => {
    const r = enServidor();
    let filas = pantalla();
    for (const c of r.aplicadas) filas = aplicarCambio(filas, c).filas;
    for (const c of r.aplicadas.slice().reverse()) {
      const x = deshacerCambio(filas, c);
      expect(x.ok).toBe(true);
      filas = x.filas;
    }
    expect(comoRevisable(filas)).toEqual(comoRevisable(pantalla()));
    expect(filas.map((f) => f.linea)).toEqual([2, 3, 4, 5, 6]);
  });

  it('el aviso del lector se va cuando la IA arregla la fila', () => {
    const r = enServidor();
    const x = aplicarCambio(pantalla(), r.aplicadas[0]!);
    expect(x.filas.find((f) => f.linea === 2)!.aviso).toBeUndefined();
  });
});

describe('lo que el dueño escribió no se pisa', () => {
  it('si cambió la fila mientras la IA revisaba, el cambio no se aplica', () => {
    const r = enServidor();
    const editada = pantalla().map((f) => (f.linea === 5 ? { ...f, nombre: 'Gaseosa 400 ml' } : f));
    const x = aplicarCambio(editada, r.aplicadas[2]!);
    expect(x.ok).toBe(false);
    expect(x.filas.find((f) => f.linea === 5)!.nombre).toBe('Gaseosa 400 ml');
  });

  it('si la tocó después de aplicarlo, deshacer no le borra lo que escribió', () => {
    const r = enServidor();
    const tras = aplicarCambio(pantalla(), r.aplicadas[2]!).filas
      .map((f) => (f.linea === 5 ? { ...f, precio: '4.000' } : f));
    const x = deshacerCambio(tras, r.aplicadas[2]!);
    expect(x.ok).toBe(false);
    expect(x.filas.find((f) => f.linea === 5)!.precio).toBe('4.000');
  });

  it('todo o nada: un cambio de dos filas no se aplica a medias', () => {
    const r = enServidor();
    // El dueño borró la fila de destino: pegar los ingredientes ya no tiene a dónde.
    const sinDestino = pantalla().filter((f) => f.linea !== 2);
    const x = aplicarCambio(sinDestino, r.aplicadas[0]!);
    expect(x.ok).toBe(false);
    expect(x.filas.some((f) => f.linea === 3)).toBe(true);
  });
});

describe('partir una fila: la nueva entra en su sitio y deshacer la quita', () => {
  const texto = 'BEBIDAS\nGaseosa 3.500 Jugo 5.000\nLimonada 4.000';
  const pantallaBebidas = (): FilaDePantalla[] => [
    { id: 0, linea: 5, nombre: 'Gaseosa Jugo', precio: '', descripcion: '', seccion: 'Bebidas', rol: 'plato', aviso: 'Sin precio' },
    { id: 1, linea: 6, nombre: 'Limonada', precio: '4000', descripcion: '', seccion: 'Bebidas', rol: 'plato' },
  ];
  const ctxB: ContextoRevision = { textoCrudo: texto, secciones: ['Bebidas'], modo: 'instruccion', instruccion: 'separa la gaseosa y el jugo' };

  it('portal y servidor quedan iguales, y vuelve a como estaba', () => {
    const r = revisarFilas(pantallaBebidas().map(filaParaRevisar), [{
      linea: 5, accion: 'partir_fila', confianza: 'alta', motivo: 'Dos platos.',
      partes: [{ nombre: 'Gaseosa', precio: 3500 }, { nombre: 'Jugo', precio: 5000 }],
    }], ctxB);
    expect(r.aplicadas).toHaveLength(1);
    const x = aplicarCambio(pantallaBebidas(), r.aplicadas[0]!);
    expect(x.ok).toBe(true);
    expect(comoRevisable(x.filas)).toEqual(r.filas);
    const y = deshacerCambio(x.filas, r.aplicadas[0]!);
    expect(y.ok).toBe(true);
    expect(comoRevisable(y.filas)).toEqual(pantallaBebidas().map(filaParaRevisar));
  });
});
