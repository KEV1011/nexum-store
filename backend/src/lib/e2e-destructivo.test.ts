import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { esBaseLocal } from '../../e2e/_base-de-pruebas';

// ─────────────────────────────────────────────────────────────────────────────
// Los E2E que BORRAN SIN FILTRO.
//
// Tres de ellos hacen `deleteMany({})` sobre `trips` y `users`, y está bien
// que lo hagan: miden cifras globales y cualquier fila previa las contamina.
// Lo que no había era nada que comprobara contra QUÉ base corren. Se invocan
// con `DATABASE_URL=... npx tsx e2e/x.ts`, así que una terminal con la
// variable de producción todavía exportada borraba todos los viajes y todos
// los usuarios de verdad. No hace falta equivocarse al escribir: basta no
// acordarse de que la variable sigue puesta.
//
// Esta comprobación no revisa los tres de hoy: BARRE el directorio. Un script
// nuevo que borre en global y no pase por la guarda falla aquí, que es el
// único momento en que alguien lo va a mirar — `e2e/` no entra en el
// typecheck ni lo corre el CI.
const E2E = join(__dirname, '..', '..', 'e2e');

/** `deleteMany()` o `deleteMany({})`: sin `where`, o sea sobre toda la tabla. */
const SIN_FILTRO = /\.deleteMany\(\s*(\{\s*\})?\s*\)/;

describe('los E2E que borran en global exigen una base local', () => {
  const ficheros = readdirSync(E2E)
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
    .map((f) => ({ f, src: readFileSync(join(E2E, f), 'utf8') }))
    .filter(({ src }) => SIN_FILTRO.test(src));

  it('hay al menos uno (si no, esta comprobación no vigila nada)', () => {
    expect(ficheros.length).toBeGreaterThan(0);
  });

  for (const { f, src } of ficheros) {
    it(`${f} llama a exigirBaseLocal antes de borrar`, () => {
      expect(src).toContain("from './_base-de-pruebas'");
      // Llamada de verdad, no solo el import: importarla y no usarla deja el
      // script igual de desprotegido y el `import` solo ya haría pasar una
      // comprobación perezosa.
      expect(src).toMatch(/exigirBaseLocal\(/);
      // Y antes del primer borrado: la gracia es no llegar a tocar nada.
      const guarda = src.search(/exigirBaseLocal\(/);
      const borrado = src.search(SIN_FILTRO);
      expect(guarda).toBeGreaterThan(-1);
      expect(guarda).toBeLessThan(borrado);
    });
  }
});

describe('qué cuenta como «esta máquina»', () => {
  it('localhost y 127.0.0.1 sí', () => {
    expect(esBaseLocal('postgresql://u@localhost:5432/zipa').local).toBe(true);
    expect(esBaseLocal('postgres://u:p@127.0.0.1:5438/zipa').local).toBe(true);
  });

  it('un socket de UNIX también: no sale de la máquina', () => {
    // Es como corren los E2E aquí; el host de la URL está solo para que la
    // cadena sea válida.
    const v = esBaseLocal('postgresql://postgres@localhost:5438/zipa?host=/tmp');
    expect(v.local).toBe(true);
    expect(v.host).toBe('/tmp');
  });

  it('un host remoto NO, y dice cuál', () => {
    const v = esBaseLocal('postgresql://u:p@dpg-abc123.oregon-postgres.render.com/zipa');
    expect(v.local).toBe(false);
    expect(v.motivo).toContain('dpg-abc123.oregon-postgres.render.com');
  });

  it('falla CERRADO: sin variable, vacía o ilegible', () => {
    // Preferir «no corre la prueba» a «corre contra lo que sea». Lo peor que
    // pasa es que alguien añada su host a la lista.
    expect(esBaseLocal(undefined).local).toBe(false);
    expect(esBaseLocal('').local).toBe(false);
    expect(esBaseLocal('   ').local).toBe(false);
    expect(esBaseLocal('esto no es una url').local).toBe(false);
    expect(esBaseLocal('mysql://localhost/zipa').local).toBe(false);
  });

  it('un host que SE PARECE a localhost no cuela', () => {
    // `localhost.algo.com` es un dominio de internet con «localhost» dentro;
    // compararlo por «contiene» lo daría por bueno.
    expect(esBaseLocal('postgresql://u@localhost.atacante.com/zipa').local).toBe(false);
    expect(esBaseLocal('postgresql://u@notlocalhost/zipa').local).toBe(false);
  });
});
