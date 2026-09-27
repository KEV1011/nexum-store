import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La directiva `library;` de Dart tiene que ir ANTES de todo `import`.
 *
 * POR QUÉ ESTO VIVE EN EL BACKEND. No hay Flutter en el entorno de desarrollo,
 * así que un error de Dart solo se ve cuando el CI lo dice — y este en
 * concreto ya dejó el CI en rojo dos veces, con el agravante de que no es un
 * aviso de estilo: el archivo NO COMPILA. Poner la comprobación aquí, donde
 * `npm test` corre en segundos antes de cada commit, la caza en el sitio donde
 * todavía es barata. Es el mismo patrón que `dockerfiles.test.ts` (compara dos
 * ficheros de fuera de `src/`) y `estado-pedido.test.ts` (lee un enum de Dart).
 *
 * La confusión es fácil y por eso se repite: lo natural al escribir el archivo
 * es poner arriba el comentario que explica el módulo, después los imports, y
 * el `library;` se arrastra detrás del comentario. El analizador de Dart pide
 * justo lo contrario — el comentario, la directiva, y luego los imports.
 */
const RAIZ = join(__dirname, '..', '..', '..');
const APPS = ['AppCliente', 'AppTransport'];

function dartsDe(dir: string): string[] {
  let salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      salida = salida.concat(dartsDe(ruta));
    } else if (nombre.endsWith('.dart')) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** Las líneas de directiva, sin comentarios ni cadenas de por medio. */
function directivas(fuente: string): { tipo: string; linea: number }[] {
  const salida: { tipo: string; linea: number }[] = [];
  const lineas = fuente.split('\n');
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]!.trim();
    // Solo al principio de línea y con la forma exacta: así una mención en un
    // comentario («va antes de todo import») no cuenta como directiva.
    if (/^library\s*;/.test(l)) salida.push({ tipo: 'library', linea: i + 1 });
    else if (/^(import|export)\s+['"]/.test(l)) {
      salida.push({ tipo: 'import', linea: i + 1 });
    }
  }
  return salida;
}

describe('la directiva `library;` va antes de los imports', () => {
  for (const app of APPS) {
    it(`${app} no tiene ningún archivo con el orden invertido`, () => {
      const malos: string[] = [];
      for (const sub of ['lib', 'test']) {
        const base = join(RAIZ, app, sub);
        for (const ruta of dartsDe(base)) {
          const ds = directivas(readFileSync(ruta, 'utf8'));
          const lib = ds.find((d) => d.tipo === 'library');
          if (!lib) continue;
          const primerImport = ds.find((d) => d.tipo === 'import');
          if (primerImport && primerImport.linea < lib.linea) {
            malos.push(
              `${ruta.slice(RAIZ.length + 1)}: import en la línea ` +
                `${primerImport.linea}, library; en la ${lib.linea}`,
            );
          }
        }
      }
      expect(malos, malos.join('\n')).toEqual([]);
    });
  }

  it('el detector distingue una directiva de su mención en un comentario', () => {
    // Sin esto la prueba podría estar pasando por no encontrar nada nunca.
    const bueno = "/// doc\nlibrary;\n\nimport 'a.dart';\n";
    const malo = "/// doc\nimport 'a.dart';\n\nlibrary;\n";
    const soloComentario = "// library; va antes\nimport 'a.dart';\n";

    const orden = (s: string) => {
      const ds = directivas(s);
      const lib = ds.find((d) => d.tipo === 'library');
      const imp = ds.find((d) => d.tipo === 'import');
      if (!lib || !imp) return 'sin-pareja';
      return imp.linea < lib.linea ? 'invertido' : 'correcto';
    };

    expect(orden(bueno)).toBe('correcto');
    expect(orden(malo)).toBe('invertido');
    expect(orden(soloComentario)).toBe('sin-pareja');
  });
});
