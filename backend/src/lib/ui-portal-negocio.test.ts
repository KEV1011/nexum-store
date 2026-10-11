/**
 * La guarda del sistema visual del portal del negocio.
 *
 * Vive en el backend por lo mismo que `moneda-portal.test.ts` y
 * `dockerfiles.test.ts`: el portal Next.js **no tiene una sola prueba** —18.725
 * líneas verificadas solo con `tsc` y `next build`, que cazan un tipo mal
 * puesto y no que una pantalla se vea como una plantilla a medio terminar—.
 * Esto lee sus archivos desde aquí, que es donde hay un corredor de pruebas.
 *
 * POR QUÉ. Antes de esta tanda el portal usaba DIEZ familias de color, y dos de
 * ellas —`teal` y `emerald`— convivían como si fueran el mismo verde: el chip
 * del logo era esmeralda y los acentos teal. 153 usos. Nadie lo decidió; se fue
 * acumulando de archivo en archivo, que es exactamente como se acumularon las
 * diecisiete copias del formateador de moneda.
 *
 * La regla se vigila en vez de escribirse en un comentario porque escribir
 * `bg-teal-50` siempre será más rápido que abrir `ui.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..', 'app');
const PORTAL = join(RAIZ, 'negocio');

/**
 * Las DOS superficies que el sistema visual cubre.
 *
 * `app/carta` entra desde esta tanda. Estaba fuera, y el resultado fue el
 * esperable: dos primarios en el mismo flujo (el botón «Agregar» en negro y
 * «Enviar a la cocina» en esmeralda), una píldora en `violet` y botones de
 * 28 px. El dueño del local juzga el producto por esa pantalla —es la que ve su
 * cliente sentado en la mesa—, así que dejarla fuera de la guarda era dejar
 * fuera justo la que más se mira.
 */
const CUBIERTOS = [PORTAL, join(RAIZ, 'carta')];

function archivosTsx(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out.push(...archivosTsx(ruta));
    else if (nombre.endsWith('.tsx')) out.push(ruta);
  }
  return out;
}

function infracciones(patron: RegExp): string[] {
  const malos: string[] = [];
  for (const ruta of CUBIERTOS.flatMap(archivosTsx)) {
    const rel = ruta.slice(ruta.indexOf('app/'));
    readFileSync(ruta, 'utf8').split('\n').forEach((linea, i) => {
      // Los comentarios quedan fuera: ahí se documenta justo lo que se retiró.
      if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;
      if (patron.test(linea)) malos.push(`${rel}:${i + 1}  ${linea.trim()}`);
    });
  }
  return malos;
}

describe('el portal del negocio tiene UN verde', () => {
  it('ni un solo `teal-`: el verde de ZIPA es esmeralda', () => {
    // Teal y emerald cumplían el mismo papel y son dos hues distintos; juntos
    // se leen como un trabajo sin terminar. El verde ya estaba fijado en
    // `/empresa` y `/admin`, y el portal del negocio se había quedado fuera.
    const malos = infracciones(/\bteal-\d/);
    expect(malos, `Usa emerald (ver app/ui.ts):\n${malos.join('\n')}`).toEqual([]);
  });
});

describe('el color significa algo', () => {
  /**
   * Las familias que solo decoraban.
   *
   * No están prohibidas por feas: están prohibidas porque no querían decir
   * nada. La fila de estadísticas tenía naranja, violeta, teal, esmeralda y
   * celeste, y entre ellas no había ninguna jerarquía — un pedido entregado
   * gritaba igual que uno recién llegado. `ui.ts` las sustituye por cuatro
   * estados que sí dicen algo.
   *
   * `amber`, `red` y `slate` NO están aquí: son los estados «nuevo»,
   * «problema» y «listo».
   */
  const DECORATIVAS = /\b(violet|sky|orange|rose|blue|indigo|fuchsia|lime|cyan)-\d/;

  // Ya NO hay lista de pendientes, y es la diferencia que importa: la primera
  // versión de esta prueba llevaba una lista de archivos exentos porque el
  // portal estaba a medio migrar. Las cuatro pantallas ya están, así que la
  // regla vale para TODO el portal sin excepciones — y una excepción que no
  // existe no se puede ampliar «solo por este archivo».
  it('ninguna pantalla del portal usa color decorativo', () => {
    const malos = infracciones(DECORATIVAS);
    expect(
      malos,
      'El color tiene que significar un estado (ESTADO) o ser una etiqueta '
      + `(ETIQUETA). Ver app/ui.ts:\n${malos.join('\n')}`,
    ).toEqual([]);
  });
});

describe('se puede tocar con el pulgar', () => {
  it('la pantalla de pedidos no deja botones de menos de 44 px', () => {
    // Este portal se usa de pie, detrás de un mostrador y con una mano. Los
    // botones de `py-2` medían 32 px de alto. 44 es el objetivo táctil mínimo
    // cómodo, y es la razón de que `BOTON` lleve `min-h-[44px]`.
    const fuente = readFileSync(join(PORTAL, '[token]', 'page.tsx'), 'utf8');
    expect(fuente).toContain("from '../../ui'");
    expect(fuente).toContain('BOTON.icono');
  });

  it('el contador de pedidos activos se ve también en el teléfono', () => {
    // Estaba `hidden sm:flex`: en el celular —que es como se usa este portal
    // casi siempre— desaparecía justo el número que el dueño quiere de un
    // vistazo. Es el mismo defecto que ya había escondido Catálogo y Ajustes.
    const fuente = readFileSync(join(PORTAL, '[token]', 'page.tsx'), 'utf8');
    const activos = fuente.indexOf('activeDeliveryCount + preparingCount) > 0');
    expect(activos).toBeGreaterThan(0);
    const bloque = fuente.slice(activos, activos + 400);
    expect(bloque).not.toMatch(/hidden sm:flex/);
  });
});

describe('la carta del QR es parte del sistema, no una pantalla aparte', () => {
  const CARTA = readFileSync(
    join(RAIZ, 'carta', '[codigo]', 'page.tsx'), 'utf8');

  it('no hay un SEGUNDO primario: ningun boton de accion en negro', () => {
    // `bg-slate-900` en un boton era el defecto de fondo: «Agregar» iba en
    // negro y «Enviar a la cocina», en la misma pantalla y a dos toques de
    // distancia, en esmeralda. Dos primarios no se leen como una decision.
    //
    // Se busca el negro pegado a un `px-`/`py-`/`rounded-`, que es como se
    // escribe un boton: `bg-slate-900` como fondo de una cabecera o de un
    // degradado es legitimo y no se toca.
    //
    // La regla vale para TODA la superficie y no solo para la pantalla
    // principal: el boton «Imprimir» de la hoja de codigos tambien iba en
    // negro, y lo caza esta prueba al ampliarla.
    const malos: string[] = [];
    for (const ruta of archivosTsx(join(RAIZ, 'carta'))) {
      const rel = ruta.slice(ruta.indexOf('app/'));
      readFileSync(ruta, 'utf8').split('\n').forEach((linea, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;
        if (/bg-slate-900[^"'`]*\b(px-|py-|rounded-)/.test(linea)
            || /\b(px-|py-|rounded-)[^"'`]*bg-slate-900/.test(linea)) {
          malos.push(`${rel}:${i + 1}  ${linea.trim()}`);
        }
      });
    }
    expect(
      malos,
      'El boton principal es BOTON.principal (esmeralda). Ver app/ui.ts:\n'
      + malos.join('\n'),
    ).toEqual([]);
  });

  it('se toca con el pulgar: los objetivos vienen de los tokens', () => {
    // POR QUE SE MIDE ASI Y NO BUSCANDO `h-7 w-7` EN EL FUENTE: lo intente, y
    // la prueba senalaba `h-5 w-5` —el icono `Plus` DENTRO del boton de 44 px—
    // y `h-6 w-6` —el punto del riel de la linea de tiempo—. Una clase de
    // tamano no dice si es el boton o lo que va dentro, y una prueba que marca
    // usos correctos acaba desactivada. Es la misma razon por la que no existe
    // una regla que prohiba `.rating.toFixed(`.
    //
    // Se exige, en su lugar, que los tres sitios donde se toca usen el token:
    // asi el tamano se decide UNA vez, en `app/ui.ts`.
    // El boton de anadir un plato: 44 px. Median 32.
    expect(CARTA).toContain('h-11 w-11');

    // Los pasos de cantidad del carrito: median 28 px, los dos pegados en una
    // fila estrecha. Ahora salen de `PASO` y no de clases escritas a mano.
    const pasos = [...CARTA.matchAll(/className=\{PASO\}/g)].length;
    expect(pasos, 'Los dos pasos del carrito (− y +) usan PASO').toBe(2);

    // Las estrellas: el boton era `p-1` sobre un icono de 28 px = 36.
    const estrellas = CARTA.indexOf("aria-label={`${n} estrella");
    expect(estrellas).toBeGreaterThan(0);
    expect(CARTA.slice(estrellas, estrellas + 400)).toMatch(/min-h-\[44px\]|h-11/);
  });

  it('la barra de enviar respeta la muesca del telefono', () => {
    // Sin `env(safe-area-inset-bottom)` el boton principal queda medio tapado
    // por la barra de gestos de cualquier iPhone, y el pulgar arrastra la
    // pagina en vez de pulsar. En el navegador del escritorio se ve perfecto,
    // que es lo que hace a este defecto dificil de ver.
    // OJO: `toContain('BARRA_FIJA')` a secas PASA aunque se quite de la barra,
    // porque encuentra la linea del `import`. Comprobado rompiendolo: hay que
    // exigir que este USADO como clase. Es la misma trampa que ya hizo pasar
    // por buena la guarda de orden del webhook de WhatsApp.
    expect(CARTA).toContain('className={BARRA_FIJA}');
    expect(readFileSync(join(RAIZ, 'ui.ts'), 'utf8'))
      .toContain('env(safe-area-inset-bottom)');
  });

  it('con mas de una seccion se puede saltar entre ellas', () => {
    // Las secciones eran etiquetas grises de 10 px. Con ocho secciones y
    // cincuenta platos, llegar a las bebidas era recorrer la carta entera.
    expect(CARTA).toContain('irASeccion');
    expect(CARTA).toContain('idDeSeccion');

    // La DECISIÓN de agrupar vive en `app/carta/reglas.ts`, que es TypeScript
    // puro y tiene sus propias pruebas (`carta-reglas.test.ts`). Aquí solo se
    // exige que la página la USE y no vuelva a decidirlo a mano.
    //
    // Esta comprobación pedía antes el texto literal `porSeccion.length >= 2`,
    // y falló —correctamente— al sacar la regla a su fichero: una guarda atada
    // a una EXPRESIÓN concreta estorba al primer refactor y no dice nada sobre
    // lo que de verdad importa, que es que la decisión esté tomada en un solo
    // sitio y probada.
    expect(CARTA).toContain("from '../reglas'");
    expect(CARTA).toContain('agruparVale(');
    expect(CARTA).toMatch(/\{agrupar &&/);
  });
});
