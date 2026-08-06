import { describe, it, expect } from 'vitest';
import { emitirTilePase, verificarTilePase, TILE_TICKET_TTL_S } from './tile-ticket';

const SECRETO = 'secreto-de-pruebas-no-usar-en-produccion';
const AHORA = Date.parse('2026-08-06T12:00:00.000Z');

describe('tile pase', () => {
  it('el pase que emite es válido', () => {
    const pase = emitirTilePase(SECRETO, AHORA);
    expect(verificarTilePase(SECRETO, pase, AHORA)).toBe(true);
  });

  it('no contiene datos de nadie: solo caducidad y firma', () => {
    const pase = emitirTilePase(SECRETO, AHORA);
    const [exp, firma] = pase.split('.');
    expect(Number(exp)).toBe(Math.floor(AHORA / 1000) + TILE_TICKET_TTL_S);
    expect(firma).toMatch(/^[0-9a-f]{32}$/);
    expect(pase.split('.')).toHaveLength(2);
  });

  it('caduca', () => {
    const pase = emitirTilePase(SECRETO, AHORA);
    const despues = AHORA + (TILE_TICKET_TTL_S + 1) * 1000;
    expect(verificarTilePase(SECRETO, pase, despues)).toBe(false);
  });

  it('sigue vigente justo antes de caducar', () => {
    const pase = emitirTilePase(SECRETO, AHORA);
    expect(verificarTilePase(SECRETO, pase, AHORA + (TILE_TICKET_TTL_S - 1) * 1000)).toBe(true);
  });

  it('no vale con otro secreto', () => {
    const pase = emitirTilePase(SECRETO, AHORA);
    expect(verificarTilePase('otro-secreto', pase, AHORA)).toBe(false);
  });

  it('estirar la caducidad invalida la firma', () => {
    const pase = emitirTilePase(SECRETO, AHORA);
    const exp = Number(pase.split('.')[0]);
    const falso = `${exp + 100000}.${pase.split('.')[1]}`;
    expect(verificarTilePase(SECRETO, falso, AHORA)).toBe(false);
  });

  it.each([
    ['vacío', ''],
    ['sin punto', 'abcdef'],
    ['sin caducidad', '.abcdef'],
    ['caducidad no numérica', 'mañana.abcdef'],
    ['firma vacía', `${Math.floor(AHORA / 1000) + 100}.`],
    ['un JWT (lo que iba antes en la URL)', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma'],
  ])('rechaza un pase %s', (_caso, pase) => {
    expect(verificarTilePase(SECRETO, pase, AHORA)).toBe(false);
  });

  it('rechaza undefined sin reventar', () => {
    expect(verificarTilePase(SECRETO, undefined, AHORA)).toBe(false);
  });
});
