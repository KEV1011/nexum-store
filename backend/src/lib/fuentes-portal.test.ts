import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { globSync } from 'fs';

/**
 * Las fuentes del portal web se sirven desde el repositorio, no desde Google.
 *
 * Se prueba desde aquí, igual que `moneda-portal.test.ts` y
 * `dockerfiles.test.ts`, porque es donde corre vitest; lo que se revisa son
 * ficheros de `app/`, que nadie más mira.
 *
 * QUÉ PASÓ. `next/font/google` descarga el .woff2 de fonts.gstatic.com
 * DURANTE la compilación. Un `next build` del mismo commit falló con decenas
 * de «module not found» sobre un CSS generado y a la segunda salió verde: la
 * descarga se había caído. Nada estaba roto en el repositorio, y el error no
 * se parecía en nada a su causa — por eso es caro. En Vercel ese mismo
 * tropiezo tumba un despliegue.
 *
 * POR QUÉ UNA PRUEBA Y NO SOLO EL COMENTARIO. Volver a `next/font/google` es
 * una línea, se lee mejor que esto, y reintroduce el fallo sin que nada avise:
 * el build pasaría en verde durante meses hasta el día que Google tosa, que
 * será el día del despliegue que no puede esperar.
 */
describe('fuentes del portal', () => {
  const raizApp = join(__dirname, '..', '..', '..', 'app');

  it('ningún archivo del portal descarga fuentes al construir', () => {
    const archivos = globSync('**/*.{ts,tsx}', { cwd: raizApp }) as string[];
    const infractores: string[] = [];

    for (const rel of archivos) {
      const texto = readFileSync(join(raizApp, rel), 'utf8');
      texto.split('\n').forEach((linea, i) => {
        const limpia = linea.trim();
        // El comentario de layout.tsx explica el problema NOMBRANDO el módulo,
        // y esta prueba también: sin saltar comentarios se delatarían a sí
        // mismos. Es el mismo cuidado que ya tiene la regla de la moneda.
        if (limpia.startsWith('*') || limpia.startsWith('//')) return;
        if (/from\s+'next\/font\/google'/.test(linea)) {
          infractores.push(`${rel}:${i + 1}  ${limpia}`);
        }
      });
    }

    expect(
      infractores,
      'Usa `next/font/local` con los archivos de app/fonts/. Para\n'
        + 'actualizarlos: python3 tools/descargar-fuentes.py\n'
        + infractores.join('\n'),
    ).toEqual([]);
  });

  it('los archivos que el layout declara existen de verdad', () => {
    // Un `src` mal escrito en `next/font/local` SÍ rompe el build, así que
    // esto no caza un fallo silencioso: caza uno ruidoso antes de empujar, que
    // es la diferencia entre arreglarlo aquí y verlo en rojo en el CI.
    const layout = readFileSync(join(raizApp, 'layout.tsx'), 'utf8');
    const declarados = [...layout.matchAll(/src:\s*'\.\/(fonts\/[^']+)'/g)]
      .map((m) => m[1]!);

    expect(declarados.length, 'layout.tsx ya no declara ninguna fuente local')
      .toBeGreaterThan(0);

    for (const rel of declarados) {
      const ruta = join(raizApp, rel);
      expect(existsSync(ruta), `falta app/${rel}`).toBe(true);
      // Un fichero de cero bytes se commitea sin querer (una descarga a medias,
      // un LFS sin instalar) y pasa desapercibido hasta que el texto sale con
      // la fuente del sistema.
      expect(statSync(ruta).size, `app/${rel} está vacío`).toBeGreaterThan(1024);
    }
  });
});
