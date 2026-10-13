// ── La dirección del backend vive en UN sitio del portal ──────────────────
//
// LO QUE SE MIDIÓ. Estaba escrita a mano en treinta ficheros de `app/`, y
// para cuando se contó ya habían divergido: veinticinco traían la rama de
// desarrollo (`localhost:3000` al trabajar en local) y CINCO no, así que
// esas cinco pantallas hablaban con PRODUCCIÓN mientras alguien probaba en
// su máquina — tocando datos de negocios reales sin un solo aviso. Tres de
// esas cinco se habían escrito en los dos últimos días.
//
// Es la tercera vez que pasa lo mismo en este repo: el formateador de moneda
// acabó en diecisiete copias con dos formatos distintos, y el correo de
// contacto en dos servicios que podían contradecirse. La lección ya está
// pagada: copiar tres líneas siempre será más rápido que buscar el ayudante,
// así que la única defensa es una prueba que barra el fuente.
//
// POR QUÉ ESTÁ EN EL BACKEND. `app/backend.ts` es TypeScript puro sin nada de
// Next, igual que `app/moneda.ts` y `app/contacto.ts`, y el portal no tiene
// corredor de pruebas propio. Mismo patrón que `moneda-portal.test.ts` y que
// `dockerfiles.test.ts`, que también leen fuera de `src/`.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const APP = join(__dirname, '../../../app');
const FUENTE_UNICA = 'backend.ts';

/** Todos los `.ts`/`.tsx` de `app/`, recursivo. */
function fuentes(dir = APP): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.next') continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (/\.tsx?$/.test(entrada)) salida.push(ruta);
  }
  return salida;
}

describe('la dirección del backend en el portal', () => {
  it('encuentra los ficheros del portal', () => {
    // Si el barrido no mira nada, las comprobaciones de abajo pasan solas —
    // que es justo como se cuela el defecto que vigilan.
    const todos = fuentes();
    expect(todos.length).toBeGreaterThan(30);
    expect(todos.some((f) => f.endsWith(FUENTE_UNICA))).toBe(true);
  });

  it('solo `app/backend.ts` escribe la dirección', () => {
    const culpables: string[] = [];
    for (const ruta of fuentes()) {
      if (ruta.endsWith(FUENTE_UNICA)) continue;
      const texto = readFileSync(ruta, 'utf8');
      if (/onrender\.com|\bzipa[\w-]*\.vercel\.app/.test(texto)) {
        culpables.push(relative(APP, ruta));
      }
    }
    expect(
      culpables,
      'La dirección del backend va en `app/backend.ts` y se importa desde '
        + 'ahí. Escrita a mano acaba divergiendo: ya pasó con treinta copias, '
        + 'de las que cinco apuntaban a producción estando en desarrollo.',
    ).toEqual([]);
  });

  it('la de WebSocket se DERIVA de la de HTTP, no se escribe aparte', () => {
    const texto = readFileSync(join(APP, FUENTE_UNICA), 'utf8');
    // Si se escribieran por separado, el día que una cambie el portal pediría
    // los datos a un servidor y abriría el socket contra otro.
    expect(/BACKEND_WS\s*=\s*BACKEND_URL\.replace/.test(texto)).toBe(true);
  });

  it('en desarrollo se habla con el backend local', () => {
    // Las cinco copias que perdieron esta rama son el defecto concreto que
    // se encontró: probar en local contra datos de negocios reales.
    const texto = readFileSync(join(APP, FUENTE_UNICA), 'utf8');
    expect(texto).toContain("NODE_ENV === 'development'");
    expect(texto).toContain('http://localhost:3000');
  });

  it('la raíz no lleva barra final', () => {
    // Todo el portal concatena `${BACKEND_URL}/business/...`: con barra final
    // saldría `//business` y el servidor devolvería 404 en TODAS las llamadas.
    const texto = readFileSync(join(APP, FUENTE_UNICA), 'utf8');
    expect(/\.replace\(\/\\\/\+\$\/, ''\)/.test(texto)).toBe(true);
  });
});
