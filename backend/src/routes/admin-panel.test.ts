/**
 * El panel de administración es HTML y JavaScript dentro de una cadena de
 * TypeScript (`PANEL_HTML` en admin.routes.ts). Para el compilador es texto:
 * ni tsc, ni el linter, ni ninguna prueba lo miran. Un paréntesis de más, un
 * botón que llama a una función que se renombró o una pestaña sin cargador
 * llegan a producción intactos y solo se descubren cuando un administrador
 * abre la pestaña y se encuentra la pantalla en blanco, sin mensaje.
 *
 * Estas pruebas extraen ese código de la cadena y lo revisan de verdad.
 * No comprueban estética: comprueban las tres formas en que el panel se ha
 * roto o se puede romper en silencio.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Extracción ────────────────────────────────────────────────────────────────

/**
 * Deshace los escapes que introduce la plantilla de TypeScript, y SOLO esos.
 *
 * Importa el detalle: dentro del panel hay cadenas JavaScript con comillas
 * escapadas (`onclick="f(\'id\')"`), que en el fichero se escriben `\\'`. Leer
 * el fuente engaña — ahí `\\'` es lo correcto — y desescaparlo mal produce un
 * "Unexpected string" que parece un fallo del panel y no lo es.
 */
function desescapar(plantilla: string): string {
  let out = '';
  for (let i = 0; i < plantilla.length; i++) {
    const c = plantilla[i];
    if (c !== '\\') { out += c; continue; }
    const sig = plantilla[++i];
    if (sig === 'n') out += '\n';
    else if (sig === 't') out += '\t';
    else if (sig === 'r') out += '\r';
    else out += sig; // \\ → \ , \` → ` , \$ → $ , \' → '
  }
  return out;
}

function leerPanel(): { html: string; js: string } {
  const fuente = readFileSync(join(__dirname, 'admin.routes.ts'), 'utf8');
  const inicio = fuente.indexOf('const PANEL_HTML = `');
  expect(inicio, 'PANEL_HTML dejó de existir en admin.routes.ts').toBeGreaterThan(-1);
  const desde = inicio + 'const PANEL_HTML = `'.length;
  // Cierre: la primera comilla invertida no escapada.
  let fin = desde;
  while (fin < fuente.length) {
    if (fuente[fin] === '`' && fuente[fin - 1] !== '\\') break;
    fin++;
  }
  const html = desescapar(fuente.slice(desde, fin));
  const script = /<script>([\s\S]*?)<\/script>/.exec(html);
  expect(script, 'el panel ya no tiene bloque <script>').not.toBeNull();
  return { html, js: script![1]! };
}

const { html: PANEL, js: PANEL_JS } = leerPanel();

// ── Pruebas ───────────────────────────────────────────────────────────────────

describe('panel de administración (HTML embebido)', () => {
  it('su JavaScript es sintácticamente válido', () => {
    // Un error de sintaxis aquí deja el panel entero muerto: ni login. Como el
    // código vive en una cadena, hoy nadie lo detectaría antes del despliegue.
    expect(() => new Function(PANEL_JS)).not.toThrow();
  });

  it('cada botón llama a una función que existe', () => {
    const definidas = new Set(
      [...PANEL_JS.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]!),
    );
    const usadas = new Set<string>();
    // Manejadores del HTML estático…
    for (const m of PANEL.matchAll(/on(?:click|submit|change|input|keydown)="([a-zA-Z_]\w*)\s*\(/g)) {
      usadas.add(m[1]!);
    }
    // …y los que el propio JavaScript escribe dentro de las filas de las tablas.
    for (const m of PANEL_JS.matchAll(/onclick=\\?["']?([a-zA-Z_]\w*)\s*\(/g)) {
      usadas.add(m[1]!);
    }
    const huerfanas = [...usadas].filter((f) => !definidas.has(f));
    expect(huerfanas, `botones que no hacen nada: ${huerfanas.join(', ')}`).toEqual([]);
    // Si esto baja de golpe, la expresión de arriba dejó de encontrar los
    // manejadores y la prueba pasaría vacía sin comprobar nada.
    expect(usadas.size).toBeGreaterThan(30);
  });

  it('cada pestaña tiene su sección y su cargador de datos', () => {
    // `show(tab)` busca la sección por id y llama al cargador del mapa. Si
    // alguien añade una pestaña y olvida cualquiera de las dos piezas, la
    // pestaña se queda en blanco o `show()` revienta y no se abre ninguna.
    const secciones = [...PANEL.matchAll(/<section id="tab-(\w+)"/g)].map((m) => m[1]!);
    const botones = [...new Set([...PANEL.matchAll(/show\('(\w+)'\)/g)].map((m) => m[1]!))];
    const mapa = /\(\{\s*([^}]+?)\s*\}\)\[tab\]/.exec(PANEL_JS);
    expect(mapa, 'el mapa de cargadores de show() cambió de forma').not.toBeNull();
    const cargadores = [...mapa![1]!.matchAll(/(\w+)\s*:/g)].map((m) => m[1]!);

    expect(secciones.length).toBeGreaterThan(5);
    expect(secciones.filter((s) => !cargadores.includes(s)),
      'secciones sin cargador').toEqual([]);
    expect(botones.filter((b) => !secciones.includes(b)),
      'botones de pestaña sin sección').toEqual([]);
    expect(cargadores.filter((c) => !secciones.includes(c)),
      'cargadores sin sección').toEqual([]);
  });

  it('escapa el HTML de los datos que pinta', () => {
    // El panel imprime nombres que escribe cualquiera. `esc()` es lo único que
    // separa un nombre de un script ejecutándose en la sesión del administrador.
    // El panel arranca leyendo la sesión y consultando /health: se le dan los
    // mínimos para poder evaluarlo y quedarse con `esc`.
    const entorno = `
      const sessionStorage = { getItem: () => '', setItem() {}, removeItem() {} };
      const fetch = () => ({ then: () => ({ then: () => ({ catch() {} }) }) });
      const document = { getElementById: () => ({ style: {}, textContent: '' }) };
      const location = { reload() {} };
      const window = {};
    `;
    const esc = new Function(`${entorno}${PANEL_JS}; return esc;`)() as (s: unknown) => string;
    expect(esc('<script>alert(1)</script>')).not.toContain('<script>');
    expect(esc(`O'Neil "x" & <b>`)).toBe('O&#39;Neil &quot;x&quot; &amp; &lt;b&gt;');
    // Un campo ausente no debe imprimir la palabra "undefined" en pantalla.
    expect(esc(undefined)).toBe('');
    expect(esc(null)).toBe('');
  });
});

/**
 * Estas dos EJECUTAN el panel, no lo leen.
 *
 * Las de arriba comprueban que el código existe y encaja; ninguna comprueba que
 * al pintar salga lo que tiene que salir. Y ahí es donde el panel falla de la
 * forma más silenciosa que hay: `esc()` convierte un campo ausente en cadena
 * vacía, así que un dato que el backend dejó de mandar no da error — deja un
 * hueco en blanco en la pantalla del administrador, que se lo cree.
 *
 * Se monta un DOM mínimo (solo lo que estas funciones tocan) y se llama a la
 * función con la forma REAL de su DTO.
 */
describe('el panel pintando de verdad', () => {
  interface ElementoFalso { style: { display: string }; innerHTML: string }

  const almacenFalso = () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} });

  /** Ejecuta el JS del panel y devuelve las funciones pedidas, con DOM falso. */
  function montar(ids: string[]): {
    fn: Record<string, (...a: unknown[]) => void>;
    el: Record<string, ElementoFalso>;
  } {
    const el: Record<string, ElementoFalso> = {};
    for (const id of ids) el[id] = { style: { display: '' }, innerHTML: '' };
    const documentoFalso = {
      getElementById: (id: string) => el[id] ?? null,
      querySelectorAll: () => [] as unknown[],
    };
    const crear = new Function(
      'document', 'window', 'fetch', 'localStorage', 'sessionStorage', 'setTimeout',
      `${PANEL_JS}\n; return { pintarAtascados };`,
    ) as (...a: unknown[]) => Record<string, (...a: unknown[]) => void>;
    const fn = crear(
      documentoFalso,
      {},
      () => Promise.resolve(),
      almacenFalso(),
      almacenFalso(),
      () => 0,
    );
    return { fn, el };
  }

  const sinNada = { stuck: { total: 0 }, orphaned: { total: 0 } };

  it('con todo en orden no enseña el aviso', () => {
    const { fn, el } = montar(['stuck-warn']);
    fn['pintarAtascados']!(sinNada);
    expect(el['stuck-warn']!.style.display).toBe('none');
  });

  it('avisa de los viajes que se quedaron sin cierre, aunque no haya nada buscando conductor', () => {
    // Es el caso del cierre perdido: nadie está esperando conductor, pero hay
    // viajes abiertos que ya no va a cerrar nadie. Antes de tener esto, el
    // aviso entero se ocultaba en cuanto `stuck.total` era cero.
    const { fn, el } = montar(['stuck-warn']);
    fn['pintarAtascados']!({ stuck: { total: 0 }, orphaned: { total: 3, desdeMin: 45 } });
    expect(el['stuck-warn']!.style.display).toBe('block');
    expect(el['stuck-warn']!.innerHTML).toContain('3 viajes en curso sin noticias');
    expect(el['stuck-warn']!.innerHTML).toContain('45');
  });

  it('los dos avisos caben a la vez', () => {
    const { fn, el } = montar(['stuck-warn']);
    fn['pintarAtascados']!({
      stuck: { total: 2, viaje: 2, mandado: 0, pedido: 0, intermunicipal: 0, desdeMin: 30 },
      orphaned: { total: 1, desdeMin: 45 },
    });
    const salida = el['stuck-warn']!.innerHTML;
    expect(salida).toContain('2 servicios sin conductor');
    expect(salida).toContain('1 viaje en curso sin noticias');
  });

  it('no se rompe si el backend todavía no manda el dato nuevo', () => {
    // Un servidor viejo con un panel nuevo: `orphaned` no viene. Tiene que
    // comportarse como antes, no reventar ni pintar "undefined".
    const { fn, el } = montar(['stuck-warn']);
    expect(() => fn['pintarAtascados']!({ stuck: { total: 0 } })).not.toThrow();
    expect(el['stuck-warn']!.style.display).toBe('none');
    expect(el['stuck-warn']!.innerHTML).not.toContain('undefined');
  });
});
