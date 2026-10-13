// ── Que no se vuelva a apilar una clase de ancho sobre un campo `w-full` ───
//
// POR QUÉ ESTA PRUEBA VIVE AQUÍ. El editor de adiciones del portal tenía los
// campos del nombre de la opción aplastados a unos treinta píxeles: un
// cuadradito donde no se podía escribir nada, y por tanto ninguna adición que
// crear. La causa era `className={`${INPUT} w-24`}` — `INPUT` ya trae
// `w-full`, así que el elemento salía con DOS utilidades de `width` y gana la
// que esté más abajo en la hoja de Tailwind, no la que se escriba después en
// el `className`. Ganaba `w-full`, el campo del PRECIO se estiraba a todo el
// ancho y el del NOMBRE se quedaba con las sobras.
//
// Nada lo caza: `tsc` ve una cadena, el linter ve una cadena, `next build`
// compila, y el defecto solo existe delante de alguien con el portal abierto.
// Es el mismo tipo de agujero que el panel `/admin` (HTML dentro de una
// cadena de TypeScript) y se vigila igual: leyendo el fuente.
//
// La regla NO es «prohibido `w-` en el catálogo»: un ancho sobre un `<div>`
// es correcto y hay decenas. Lo que se prohíbe es la CO-OCURRENCIA concreta
// —una clase de ancho apilada sobre un token que ya trae `w-full`— que es
// donde el navegador se queda eligiendo.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const CATALOGO = join(__dirname, '../../../app/negocio/[token]/catalogo');

/** Los ficheros del catálogo del portal, que es donde vive el editor. */
function fuentesDelCatalogo(): Array<{ archivo: string; texto: string }> {
  return readdirSync(CATALOGO)
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => ({ archivo: f, texto: readFileSync(join(CATALOGO, f), 'utf8') }));
}

/**
 * Los tokens que ya traen `w-full` y por tanto no admiten un ancho encima.
 *
 * Se descubren leyendo el fuente en vez de escribirlos aquí: si mañana
 * alguien renombra `INPUT` o añade otro token con `w-full`, la prueba lo
 * cubre sola. Copiar la lista la dejaría vigilando un nombre que ya no es.
 */
function tokensAnchoCompleto(texto: string): string[] {
  const nombres: string[] = [];
  // `const NOMBRE = '…w-full…'`, incluida la forma partida en varias líneas
  // con `+` que usan los dos ficheros.
  const re = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*((?:'[^']*'\s*\+?\s*)+)/g;
  for (const m of texto.matchAll(re)) {
    if (/\bw-full\b/.test(m[2]!)) nombres.push(m[1]!);
  }
  return nombres;
}

describe('el ancho de un campo lo fija su contenedor', () => {
  it('encuentra los ficheros del catálogo y algún token con w-full', () => {
    const fuentes = fuentesDelCatalogo();
    expect(fuentes.length).toBeGreaterThan(0);
    // Si esto fallara, el barrido de abajo estaría pasando por no mirar nada.
    const conToken = fuentes.filter((f) => tokensAnchoCompleto(f.texto).length > 0);
    expect(conToken.length).toBeGreaterThan(0);
  });

  it('ningún token w-full lleva una clase de ancho apilada encima', () => {
    const culpables: string[] = [];

    for (const { archivo, texto } of fuentesDelCatalogo()) {
      const tokens = tokensAnchoCompleto(texto);
      if (tokens.length === 0) continue;

      const lineas = texto.split('\n');
      lineas.forEach((linea, i) => {
        // Los comentarios no son código, y aquí hace falta decirlo porque el
        // comentario que explica este mismo defecto CITA la forma mala
        // (`${INPUT} w-24`) para que se entienda qué no hacer. Sin esta
        // línea, la prueba se acusa a sí misma. Cubre `//`, los bloques
        // `/* … */` y los comentarios de JSX `{/* … */}`.
        if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(linea)) return;
        for (const token of tokens) {
          // `${TOKEN} …` dentro de una plantilla, seguido de una clase de
          // ancho: `w-24`, `w-14`, `w-1/2`, `w-[120px]`, `max-w-…`, `min-w-…`.
          const re = new RegExp(
            `\\$\\{${token}\\}[^\`]*\\b(?:max-|min-)?w-(?!full\\b)[\\w./[\\]%-]+`,
          );
          if (re.test(linea)) {
            culpables.push(`${archivo}:${i + 1} → ${linea.trim()}`);
          }
        }
      });
    }

    expect(
      culpables,
      'Un token que ya trae `w-full` no admite otra clase de ancho encima: ' +
        'el navegador elige por el orden de la hoja de Tailwind y el campo ' +
        'puede quedar aplastado. Envuelve el campo en un contenedor con el ' +
        'ancho (ANCHO_NUMERO / ANCHO_PRECIO / ANCHO_FLEXIBLE).',
    ).toEqual([]);
  });

  it('caza el defecto real que tenía el editor', () => {
    // La línea exacta que dejó el campo del nombre en treinta píxeles.
    const texto = [
      "const INPUT = 'w-full rounded-lg border px-3'",
      '<input className={`${INPUT} w-24`} />',
    ].join('\n');

    const tokens = tokensAnchoCompleto(texto);
    expect(tokens).toEqual(['INPUT']);

    const re = new RegExp(`\\$\\{INPUT\\}[^\`]*\\b(?:max-|min-)?w-(?!full\\b)[\\w./[\\]%-]+`);
    expect(re.test(texto.split('\n')[1]!)).toBe(true);
  });

  it('no marca un ancho puesto donde sí corresponde', () => {
    const re = new RegExp(`\\$\\{INPUT\\}[^\`]*\\b(?:max-|min-)?w-(?!full\\b)[\\w./[\\]%-]+`);
    // El ancho en el contenedor, que es la forma correcta.
    expect(re.test('<span className="w-24"><input className={INPUT} /></span>')).toBe(false);
    // Otras utilidades encima del token son legítimas: lo que rompe es el ancho.
    expect(re.test('<input className={`${INPUT} text-right font-mono`} />')).toBe(false);
  });
});
