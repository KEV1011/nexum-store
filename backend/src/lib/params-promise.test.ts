// ── En Next 16, `params` de una página es una PROMISE ──────────────────────
//
// LO QUE PASÓ. La pantalla de la cocina salió a producción con
// `{ params: { token: string } }` escrito como objeto plano. En Next 16 eso
// no es lo que llega: `params` es una Promise, así que `token` salía
// `undefined`, la página pedía `/business/undefined/cocina` y el portal
// mostraba «Business not found for token: undefined». Las otras cinco páginas
// del portal ya lo hacían bien; esa se escribió sin mirarlas.
//
// Y NO LO CAZA NADIE. `{ token: string }` es un tipo perfectamente válido en
// TypeScript —solo que no coincide con lo que Next entrega en tiempo de
// ejecución—, así que `tsc` pasa, `next build` compila y la ruta se genera.
// Es la misma familia que `portal-tipos.test.ts`: un tipo que miente es
// indistinguible de uno correcto hasta que alguien abre la página.
//
// La regla vale para TODA página bajo una carpeta `[algo]`, que es justo
// donde se nota: sin parámetro, la página pide datos de un recurso que no
// existe y el error que sale no se parece en nada a la causa.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const APP = join(__dirname, '../../../app');

/** Las páginas que viven bajo una ruta dinámica (`[token]`, `[id]`…). */
function paginasDinamicas(dir = APP, dentroDeDinamica = false): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.next') continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...paginasDinamicas(ruta, dentroDeDinamica || /^\[.+\]$/.test(entrada)));
    } else if (entrada === 'page.tsx' && dentroDeDinamica) {
      salida.push(ruta);
    }
  }
  return salida;
}

describe('params de una página dinámica', () => {
  it('encuentra las páginas dinámicas del portal', () => {
    // Sin esto, las comprobaciones de abajo pasarían por no mirar nada.
    const paginas = paginasDinamicas();
    expect(paginas.length).toBeGreaterThan(5);
    expect(paginas.some((p) => p.includes('cocina'))).toBe(true);
  });

  it('todas lo declaran como Promise', () => {
    const culpables: string[] = [];
    for (const ruta of paginasDinamicas()) {
      const texto = readFileSync(ruta, 'utf8');
      // Solo mira la firma del componente de página, no cualquier `params`.
      const firma = texto.match(/export default function \w+\(\s*\{\s*params\s*\}\s*:\s*\{[^}]*\}/s);
      if (!firma) continue; // La página no recibe params: nada que comprobar.
      if (!/params\s*:\s*Promise</.test(firma[0])) {
        culpables.push(relative(APP, ruta));
      }
    }
    expect(
      culpables,
      'En Next 16 `params` llega como Promise. Declararlo como objeto plano '
        + 'compila y pasa el build, pero en el navegador el parámetro sale '
        + '`undefined` y la página pide un recurso que no existe. '
        + 'Usa `params: Promise<{…}>` y desenvuélvelo con `use(params)`.',
    ).toEqual([]);
  });

  it('y la desenvuelven con use()', () => {
    const culpables: string[] = [];
    for (const ruta of paginasDinamicas()) {
      const texto = readFileSync(ruta, 'utf8');
      if (!/params\s*:\s*Promise</.test(texto)) continue;
      // Declararla como Promise y después leerla como objeto es el mismo
      // defecto con otra cara: `params.token` sobre una Promise es undefined.
      if (!/\buse\(\s*params\s*\)/.test(texto)) {
        culpables.push(relative(APP, ruta));
      }
    }
    expect(culpables, 'Falta `use(params)` para desenvolver la Promise.').toEqual([]);
  });

  it('caza el defecto real que salió a producción', () => {
    const malo = 'export default function CocinaPage({ params }: { params: { token: string } }) {';
    const firma = malo.match(/export default function \w+\(\s*\{\s*params\s*\}\s*:\s*\{[^}]*\}/s);
    expect(firma).not.toBeNull();
    expect(/params\s*:\s*Promise</.test(firma![0])).toBe(false);
  });
});
