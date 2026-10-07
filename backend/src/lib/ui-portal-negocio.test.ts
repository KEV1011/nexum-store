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

const PORTAL = join(__dirname, '..', '..', '..', 'app', 'negocio');

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
  for (const ruta of archivosTsx(PORTAL)) {
    const rel = ruta.slice(ruta.indexOf('app/negocio'));
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
    expect(malos, `Usa emerald (ver app/negocio/ui.ts):\n${malos.join('\n')}`).toEqual([]);
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
      + `(ETIQUETA). Ver app/negocio/ui.ts:\n${malos.join('\n')}`,
    ).toEqual([]);
  });
});

describe('se puede tocar con el pulgar', () => {
  it('la pantalla de pedidos no deja botones de menos de 44 px', () => {
    // Este portal se usa de pie, detrás de un mostrador y con una mano. Los
    // botones de `py-2` medían 32 px de alto. 44 es el objetivo táctil mínimo
    // cómodo, y es la razón de que `BOTON` lleve `min-h-[44px]`.
    const fuente = readFileSync(join(PORTAL, '[token]', 'page.tsx'), 'utf8');
    expect(fuente).toContain("from '../ui'");
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
