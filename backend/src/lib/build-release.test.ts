import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Que las dos apps se publiquen OPTIMIZADAS, y que lo digan.
//
// LO QUE PASÓ. La app del conductor llevaba `isMinifyEnabled = false` desde
// que su `build.gradle` se convirtió a Kotlin: no era la corrección de nada,
// era el valor que quedó escrito. La del cliente no decía nada y heredaba el
// valor por defecto del plugin de Flutter, que SÍ enciende R8. Resultado en
// Play, medido: la del conductor publicó **15,9 MB de DEX con 2 % de
// ofuscación** («Optimización de código DEX: Baja») y la del cliente **2,81
// MB con 81 %**. Trece megas de más que descarga cada conductor, en una app
// que usa con datos móviles, y nadie había decidido esa diferencia.
//
// POR QUÉ UNA PRUEBA Y NO SOLO EL ARREGLO. Un `.gradle.kts` no lo compila
// nadie en este repo: ni `tsc`, ni el linter, ni `flutter analyze` lo miran.
// Solo se nota en la consola de Play, semanas después, y en una métrica que
// hay que ir a buscar. El valor por defecto de un plugin además puede cambiar
// con una actualización de Flutter y las dos apps volverían a divergir sin un
// solo error.
//
// Esta prueba vive en el backend por lo mismo que `dockerfiles.test.ts` y
// `google-services.test.ts`: es el único sitio del repo donde algo se ejecuta
// de verdad en CI y puede leer ficheros de fuera de `src/`.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(__dirname, '..', '..', '..');

const APPS = [
  { nombre: 'conductor', ruta: join(RAIZ, 'AppTransport', 'android', 'app', 'build.gradle.kts') },
  { nombre: 'cliente', ruta: join(RAIZ, 'AppCliente', 'android', 'app', 'build.gradle.kts') },
] as const;

/** El bloque `release { … }` de un build.gradle.kts. */
function bloqueRelease(gradle: string): string {
  const i = gradle.indexOf('release {');
  if (i === -1) return '';
  let nivel = 0;
  for (let j = gradle.indexOf('{', i); j < gradle.length; j++) {
    if (gradle[j] === '{') nivel++;
    else if (gradle[j] === '}') {
      nivel--;
      if (nivel === 0) return gradle.slice(i, j + 1);
    }
  }
  return gradle.slice(i);
}

describe('las dos apps se publican con R8 encendido', () => {
  for (const app of APPS) {
    it(`la app del ${app.nombre} minifica y reduce recursos`, () => {
      const release = bloqueRelease(readFileSync(app.ruta, 'utf8'));
      expect(release, `no se encontró el bloque release en ${app.ruta}`).not.toBe('');
      expect(release).toMatch(/isMinifyEnabled\s*=\s*true/);
      expect(release).toMatch(/isShrinkResources\s*=\s*true/);
    });

    it(`la app del ${app.nombre} no lo apaga en ninguna parte`, () => {
      // Lo que de verdad hay que impedir no es que falte la línea, es que
      // alguien escriba `false` «para depurar un crash» y se quede.
      const gradle = readFileSync(app.ruta, 'utf8');
      expect(gradle).not.toMatch(/isMinifyEnabled\s*=\s*false/);
      expect(gradle).not.toMatch(/isShrinkResources\s*=\s*false/);
    });
  }

  it('las dos dicen lo MISMO', () => {
    // Una optimizada y la otra no es exactamente el estado del que venimos, y
    // fue invisible durante meses porque cada fichero se leía por separado.
    const [a, b] = APPS.map((x) => {
      const r = bloqueRelease(readFileSync(x.ruta, 'utf8'));
      return {
        minify: /isMinifyEnabled\s*=\s*(\w+)/.exec(r)?.[1],
        shrink: /isShrinkResources\s*=\s*(\w+)/.exec(r)?.[1],
      };
    });
    expect(a).toEqual(b);
  });
});

describe('el borde a borde está declarado, no heredado', () => {
  // Desde Android 15 una app con targetSdk 35+ se dibuja de borde a borde
  // lo pida o no. Declararlo con `edgeToEdge` es lo que hace que se vea
  // IGUAL en Android 14 y en 15, en vez de depender de la versión del
  // teléfono — y es lo que Play pide comprobar.
  const MAINS = [
    { nombre: 'conductor', ruta: join(RAIZ, 'AppTransport', 'lib', 'main.dart') },
    { nombre: 'cliente', ruta: join(RAIZ, 'AppCliente', 'lib', 'main.dart') },
  ];

  for (const m of MAINS) {
    it(`la app del ${m.nombre} lo declara en main`, () => {
      const s = readFileSync(m.ruta, 'utf8');
      expect(s).toContain('SystemUiMode.edgeToEdge');
    });

    it(`la app del ${m.nombre} no pide colores que Android 15 ignora`, () => {
      // `statusBarColor` y `systemNavigationBarColor` están obsoletos y en
      // SDK 35+ no hacen NADA. Dejarlos no rompe nada; el daño es que se
      // leen como «el borde a borde ya está resuelto aquí» y nadie vuelve
      // a mirarlo. Eso ya pasó una vez.
      const s = readFileSync(m.ruta, 'utf8');
      expect(s).not.toContain('statusBarColor:');
      expect(s).not.toContain('systemNavigationBarColor:');
    });
  }

  it('el tema de arranque del conductor no pelea con el borde a borde', () => {
    // `windowFullscreen` es la bandera del modo inmersivo de antes de
    // Android 15, y estaba puesta justo en el tema que está vivo mientras
    // Flutter arranca — que es cuando se ve el salto.
    const styles = readFileSync(
      join(RAIZ, 'AppTransport', 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml'),
      'utf8',
    );
    expect(styles).not.toMatch(/<item name="android:windowFullscreen">\s*true/);
    expect(styles).not.toMatch(/<item name="android:windowDrawsSystemBarBackgrounds">\s*true/);
  });
});
