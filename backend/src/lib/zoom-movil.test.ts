/**
 * El zoom que Safari no deshace.
 *
 * REPORTADO CON CAPTURAS de la carta del QR: «cuando se va a escribir se hace
 * más zoom y se distorsiona todo al escribir», y las dos capturas mostraban la
 * interfaz enorme, con media pantalla fuera.
 *
 * No eran dos defectos: era uno. **Safari en iOS hace zoom solo al enfocar un
 * campo cuya letra mide menos de 16 px, y al salir del campo NO vuelve al zoom
 * anterior.** La página se queda ampliada. El texto gigante de las capturas no
 * es el diseño: es el estado en el que quedó el navegador después de tocar el
 * buscador de la carta.
 *
 * Esto no lo caza nada más: `tsc` no mira CSS, el `next build` tampoco, y en
 * el navegador del escritorio NO OCURRE. Solo aparece en un teléfono, que es
 * la peor clase de defecto — y ya se había colado una vez.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..', 'app');
const CSS = readFileSync(join(RAIZ, 'globals.css'), 'utf8');

describe('escribir en un campo no amplía la página', () => {
  it('los campos miden 16 px en pantallas táctiles', () => {
    // La regla tiene que llevar `!important`: las utilidades de Tailwind
    // (`text-sm`) son CLASES y le ganan por especificidad a una regla por
    // elemento. Sin él, los 54 campos del portal que usan `text-sm` seguirían
    // provocando el zoom y esta prueba estaría dando por bueno un CSS inerte.
    const bloque = CSS.match(/@media\s*\(pointer:\s*coarse\)\s*\{[^}]*\{[^}]*\}[^}]*\}/);
    expect(bloque, 'falta el bloque @media (pointer: coarse) de globals.css').not.toBeNull();
    const texto = bloque![0];
    expect(texto).toMatch(/input[\s,]/);
    expect(texto).toMatch(/textarea/);
    expect(texto).toMatch(/select/);
    expect(texto).toMatch(/font-size:\s*16px\s*!important/);
  });

  it('NO se mata el pinch-zoom para arreglarlo', () => {
    // Es la primera «solución» que se encuentra buscando esto, y quita el
    // zoom a todo el mundo: incumple WCAG 1.4.4 y lo marca el informe previo
    // al lanzamiento de Play. El viewport deja el zoom libre a propósito.
    const layout = readFileSync(join(RAIZ, 'layout.tsx'), 'utf8');
    const sinComentarios = layout.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sinComentarios).not.toMatch(/maximumScale/);
    expect(sinComentarios).not.toMatch(/userScalable/);
  });

  it('quien pidió menos movimiento no recibe las animaciones', () => {
    // La entrada escalonada de las secciones de la carta es justo lo que le
    // provoca el mareo a quien activó ese ajuste del sistema.
    expect(CSS).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});

describe('ningún campo de la carta se escapa de la regla', () => {
  /**
   * Barrido de respaldo: la regla global cubre todo, pero un `font-size` en
   * línea dentro de un `style={{...}}` la ganaría igual, y eso sí hay que
   * verlo venir.
   */
  it('ningún input lleva un font-size en línea por debajo de 16', () => {
    const malos: string[] = [];
    for (const ruta of tsx(join(RAIZ, 'carta')).concat(tsx(join(RAIZ, 'negocio')))) {
      readFileSync(ruta, 'utf8').split('\n').forEach((linea, i) => {
        const m = linea.match(/fontSize:\s*'?(\d+)/);
        if (m && Number(m[1]) < 16) {
          malos.push(`${ruta.slice(ruta.indexOf('app/'))}:${i + 1}  ${linea.trim()}`);
        }
      });
    }
    expect(malos, `font-size en línea por debajo de 16 px:\n${malos.join('\n')}`).toEqual([]);
  });
});

function tsx(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out.push(...tsx(ruta));
    else if (nombre.endsWith('.tsx')) out.push(ruta);
  }
  return out;
}
