// ── Que las dos apps se publiquen con la MISMA optimización ───────────────
//
// LO QUE PASÓ. El conductor publicaba 15,9 MB de DEX con un 2 % de
// ofuscación mientras el cliente iba con 2,81 MB y un 81 %. La causa no fue
// una decisión: `isMinifyEnabled = false` se quedó escrito al convertir ese
// `build.gradle` a Kotlin, sin motivo y sin que nada dependiera de ello,
// mientras el cliente no decía nada y heredaba el valor del plugin de
// Flutter, que sí enciende R8. O sea: una app iba optimizada y la otra no,
// y la diferencia no la había decidido nadie.
//
// Eso son trece megas que descarga cada conductor con datos móviles, y Play
// lo marca en el informe de optimización con fecha límite. Nadie se entera
// mirando el código: los dos ficheros están en carpetas distintas, nadie los
// lee a la vez, y el APK se construye igual de bien con R8 apagado.
//
// Es el mismo tipo de guarda que `dockerfiles.test.ts`, que vigila que los
// dos Dockerfile no se separen: la rotura no es que un valor esté mal, es
// que DOS valores que deben decir lo mismo dejen de decirlo.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '../../..');
const GRADLES = {
  conductor: join(RAIZ, 'AppTransport/android/app/build.gradle.kts'),
  cliente: join(RAIZ, 'AppCliente/android/app/build.gradle.kts'),
};

/** El bloque `release { … }` de un `build.gradle.kts`. */
function bloqueRelease(texto: string): string {
  const i = texto.indexOf('release {');
  if (i === -1) return '';
  // Se cuenta el anidamiento en vez de buscar la primera llave de cierre:
  // dentro hay `signingConfig = if (…) … else …` con sus propias llaves.
  let nivel = 0;
  for (let j = i; j < texto.length; j++) {
    if (texto[j] === '{') nivel++;
    else if (texto[j] === '}') {
      nivel--;
      if (nivel === 0) return texto.slice(i, j + 1);
    }
  }
  return texto.slice(i);
}

/** `true`/`false` de una propiedad dentro del bloque, o `null` si no está. */
function valor(bloque: string, prop: string): boolean | null {
  const m = bloque.match(new RegExp(`${prop}\\s*=\\s*(true|false)`));
  return m ? m[1] === 'true' : null;
}

describe('la publicación de Android', () => {
  it('encuentra los dos build.gradle y su bloque de release', () => {
    // Si esto fallara, las comprobaciones de abajo estarían pasando por no
    // mirar nada — que es como se cuela justo el defecto que vigilan.
    for (const [app, ruta] of Object.entries(GRADLES)) {
      expect(existsSync(ruta), `falta el gradle de ${app}`).toBe(true);
      const bloque = bloqueRelease(readFileSync(ruta, 'utf8'));
      expect(bloque.length, `sin bloque release en ${app}`).toBeGreaterThan(20);
    }
  });

  it('las dos encienden R8 de forma EXPLÍCITA', () => {
    // Explícita y no heredada: el cliente funcionaba por el valor por
    // defecto del plugin, así que el día que ese valor cambiara se habría
    // apagado sin que nadie tocara nada.
    for (const [app, ruta] of Object.entries(GRADLES)) {
      const bloque = bloqueRelease(readFileSync(ruta, 'utf8'));
      expect(valor(bloque, 'isMinifyEnabled'), `${app}: isMinifyEnabled`).toBe(true);
      expect(valor(bloque, 'isShrinkResources'), `${app}: isShrinkResources`).toBe(true);
    }
  });

  it('las dos apps declaran lo mismo, sin divergir', () => {
    const conductor = bloqueRelease(readFileSync(GRADLES.conductor, 'utf8'));
    const cliente = bloqueRelease(readFileSync(GRADLES.cliente, 'utf8'));
    for (const prop of ['isMinifyEnabled', 'isShrinkResources']) {
      expect(
        valor(conductor, prop),
        `${prop} no dice lo mismo en las dos apps: una se publicaría `
          + 'optimizada y la otra no, y la diferencia no la habría decidido nadie.',
      ).toBe(valor(cliente, prop));
    }
  });

  it('el borde a borde se declara en los dos `main`', () => {
    // Desde Android 15 una app con targetSdk 35+ se dibuja de borde a borde
    // lo pida o no; `edgeToEdge` es la forma soportada por Flutter de
    // declararlo y lo que hace que se vea igual en Android 14 y en 15.
    for (const [app, main] of Object.entries({
      conductor: join(RAIZ, 'AppTransport/lib/main.dart'),
      cliente: join(RAIZ, 'AppCliente/lib/main.dart'),
    })) {
      const texto = readFileSync(main, 'utf8');
      expect(
        /SystemChrome\.setEnabledSystemUIMode\(\s*SystemUiMode\.edgeToEdge/.test(texto),
        `${app}: falta SystemUiMode.edgeToEdge en main.dart`,
      ).toBe(true);
    }
  });

  it('nadie vuelve a poner los colores de barra que Android 15 ignora', () => {
    // `statusBarColor` y `systemNavigationBarColor` están obsoletos y
    // Android 15 los IGNORA. No rompen nada; el daño es que se leen como
    // «el borde a borde ya está resuelto aquí» y nadie vuelve a mirarlo.
    for (const [app, main] of Object.entries({
      conductor: join(RAIZ, 'AppTransport/lib/main.dart'),
      cliente: join(RAIZ, 'AppCliente/lib/main.dart'),
    })) {
      const sinComentarios = readFileSync(main, 'utf8').replace(/\/\/[^\n]*/g, '');
      expect(/\bstatusBarColor\s*:/.test(sinComentarios), `${app}: statusBarColor`).toBe(false);
      expect(
        /\bsystemNavigationBarColor\s*:/.test(sinComentarios),
        `${app}: systemNavigationBarColor`,
      ).toBe(false);
    }
  });
});
