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
      `${PANEL_JS}\n; return { pintarAtascados, pintarNegocio };`,
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

/**
 * Las tres cifras del piloto, pintadas de verdad.
 *
 * Son las que se van a mirar para decidir si el negocio existe, y la forma en
 * que engañarían no es dando un número equivocado —son divisiones— sino
 * afirmando cosas que los datos no sostienen: un «0 %» donde no hubo viajes,
 * un «50 % de retención» sobre dos personas.
 */
describe('el panel pintando las cifras del piloto', () => {
  const almacen = () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} });

  function pintor(): (n: unknown) => string {
    const crear = new Function(
      'document', 'window', 'fetch', 'localStorage', 'sessionStorage', 'setTimeout',
      `${PANEL_JS}\n; return pintarNegocio;`,
    ) as (...a: unknown[]) => (n: unknown) => string;
    return crear(
      { getElementById: () => null, querySelectorAll: () => [] },
      {},
      () => Promise.resolve(),
      almacen(),
      almacen(),
      () => 0,
    );
  }

  const vacio = {
    desde: '2026-09-01', hasta: '2026-09-03',
    serie: [
      { dia: '2026-09-01', solicitados: 0, completados: 0 },
      { dia: '2026-09-02', solicitados: 0, completados: 0 },
      { dia: '2026-09-03', solicitados: 0, completados: 0 },
    ],
    emparejamiento: { solicitados: 0, conConductor: 0, sinConductor: 0, tasa: null },
    retencion: { base: 0, volvieron: 0, pct: null, fiable: false },
    pasajerosActivos: 0,
  };

  it('sin viajes NO acusa al despacho de un 0 %', () => {
    // Un «0 % encuentran conductor» en un día sin solicitudes dice que el
    // despacho falló. Lo cierto es que no hubo nada que despachar.
    const html = pintor()(vacio);
    expect(html).not.toContain('0 %');
    expect(html).toContain('No hubo solicitudes');
  });

  it('sin nadie la semana pasada dice «Sin datos», no un porcentaje', () => {
    const html = pintor()(vacio);
    expect(html).toContain('Sin datos');
  });

  it('con una base diminuta enseña la fracción, no el porcentaje', () => {
    // «50 %» sobre dos personas no es una métrica, es una anécdota — y en un
    // piloto es justo el número que va a salir.
    const html = pintor()({
      ...vacio,
      retencion: { base: 2, volvieron: 1, pct: 50, fiable: false },
    });
    expect(html).toContain('1 de 2');
    expect(html).not.toContain('50 %');
  });

  it('con datos de verdad enseña los porcentajes y las dos cifras crudas', () => {
    const html = pintor()({
      desde: '2026-09-01', hasta: '2026-09-02',
      serie: [
        { dia: '2026-09-01', solicitados: 10, completados: 8 },
        { dia: '2026-09-02', solicitados: 6, completados: 5 },
      ],
      emparejamiento: { solicitados: 16, conConductor: 13, sinConductor: 3, tasa: 81.3 },
      retencion: { base: 20, volvieron: 9, pct: 45, fiable: true },
      pasajerosActivos: 12,
    });
    expect(html).toContain('81.3 %');
    expect(html).toContain('13 de 16');
    expect(html).toContain('45 %');
    expect(html).toContain('volvieron 9');
  });

  it('dibuja TODOS los días, también los vacíos', () => {
    // Si los días de cero desaparecieran, una semana con dos días muertos se
    // vería como una semana entera de actividad.
    const html = pintor()(vacio);
    expect((html.match(/title="09-0/g) ?? []).length).toBe(3);
  });

  it('no revienta ni imprime «undefined» si el backend manda un objeto vacío', () => {
    const html = pintor()({});
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });
});

/**
 * La comisión, pintada de verdad.
 *
 * Es la única cifra del panel que sale del bolsillo de otra persona: si la
 * pantalla dice «15 %» donde la flota tiene pactado 10, alguien firma un
 * acuerdo mirando un número que no es el que se cobra. Y hay dos formas
 * concretas de que mienta —confundir «no tiene tasa propia» con «cero», y
 * escribir 0.1 donde se pactó 10 %— que solo se ven ejecutando.
 */
describe('el panel pintando la comisión', () => {
  interface ElementoFalso { style: { display: string }; innerHTML: string; value: string }

  const almacen = () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} });

  /** Monta el panel con un `fetch` que responde por ruta. */
  function montar(respuestas: Record<string, unknown>, ids: string[]) {
    const el: Record<string, ElementoFalso> = {};
    for (const id of ids) el[id] = { style: { display: '' }, innerHTML: '', value: '' };
    const documentoFalso = {
      getElementById: (id: string) => el[id] ?? null,
      querySelectorAll: () => [] as unknown[],
    };
    const fetchFalso = (path: string) => {
      const clave = Object.keys(respuestas).find((k) => path.startsWith(k));
      return Promise.resolve({
        ok: clave !== undefined,
        status: clave !== undefined ? 200 : 404,
        json: () => Promise.resolve(
          clave !== undefined
            ? { success: true, data: respuestas[clave] }
            : { success: false, error: 'ruta no simulada: ' + path },
        ),
      });
    };
    const crear = new Function(
      'document', 'window', 'fetch', 'localStorage', 'sessionStorage', 'setTimeout',
      `${PANEL_JS}\n; return { pct: pctComision, loadOperators, loadCityCommissions };`,
    ) as (...a: unknown[]) => Record<string, (...a: unknown[]) => unknown>;
    const fn = crear(documentoFalso, {}, fetchFalso, almacen(), almacen(), () => 0);
    return { fn, el };
  }

  /** Deja correr las promesas que arranca el cargador. */
  const esperar = () => new Promise((r) => setImmediate(r));

  const empresa = {
    id: 'op1', legalName: 'Trans Norte', nit: '900123', type: 'INTERCITY',
    city: 'Pamplona', vehicles: 3, drivers: 5, status: 'ACTIVE',
    habilitacionOk: true, pendingDocs: 0, createdAt: '2026-01-01T00:00:00.000Z',
    commissionRate: null as number | null,
  };

  it('pinta la fracción como el porcentaje que se pactó', () => {
    const { fn } = montar({}, []);
    const pct = fn['pct'] as (v: number) => string;
    expect(pct(0.15)).toBe('15 %');
    expect(pct(0.125)).toBe('12,5 %');
    expect(pct(0)).toBe('0 %');
  });

  it('una flota SIN tasa propia dice «heredada», no «0 %»', async () => {
    // Es la confusión que importa: cero por ciento es un acuerdo (esa flota no
    // paga nada) y no tener tasa es lo contrario (paga la de su ciudad).
    const { fn, el } = montar({ '/admin/operators': [empresa] }, ['operator-filter', 'operators-body']);
    fn['loadOperators']!();
    await esperar();
    expect(el['operators-body']!.innerHTML).toContain('heredada');
    expect(el['operators-body']!.innerHTML).not.toContain('0 %');
  });

  it('una flota con comisión CERO enseña «0 %», no «heredada»', async () => {
    const { fn, el } = montar(
      { '/admin/operators': [{ ...empresa, commissionRate: 0 }] },
      ['operator-filter', 'operators-body'],
    );
    fn['loadOperators']!();
    await esperar();
    expect(el['operators-body']!.innerHTML).toContain('0 %');
    expect(el['operators-body']!.innerHTML).not.toContain('heredada');
  });

  it('el botón lleva la tasa real, no la palabra undefined', async () => {
    const { fn, el } = montar(
      { '/admin/operators': [{ ...empresa, commissionRate: 0.1 }] },
      ['operator-filter', 'operators-body'],
    );
    fn['loadOperators']!();
    await esperar();
    const html = el['operators-body']!.innerHTML;
    expect(html).toContain('10 %');
    expect(html).toContain('askOperatorCommission(');
    expect(html).not.toContain('undefined');
  });

  it('ninguna ciudad con tasa propia se explica, no se deja en blanco', async () => {
    const ciudades = [
      { slug: 'pamplona', name: 'Pamplona', department: 'Norte de Santander', lat: 7.3, lng: -72.6, zone: null, commissionRate: null },
    ];
    const { fn, el } = montar({ '/admin/municipalities': ciudades }, ['city-com-slug', 'city-com-body']);
    fn['loadCityCommissions']!();
    await esperar();
    expect(el['city-com-body']!.innerHTML).toContain('todas cobran la global');
    // El selector sí trae todas: quitar una tasa y ponerla son la misma pantalla.
    expect(el['city-com-slug']!.innerHTML).toContain('Pamplona');
  });

  it('lista solo las plazas con tasa propia, con su porcentaje', async () => {
    const ciudades = [
      { slug: 'pamplona', name: 'Pamplona', department: 'N. de Santander', lat: 7.3, lng: -72.6, zone: null, commissionRate: null },
      { slug: 'cucuta', name: 'Cúcuta', department: 'N. de Santander', lat: 7.9, lng: -72.5, zone: null, commissionRate: 0.08 },
    ];
    const { fn, el } = montar({ '/admin/municipalities': ciudades }, ['city-com-slug', 'city-com-body']);
    fn['loadCityCommissions']!();
    await esperar();
    const html = el['city-com-body']!.innerHTML;
    expect(html).toContain('Cúcuta');
    expect(html).toContain('8 %');
    expect(html).not.toContain('Pamplona');
    expect(html).not.toContain('undefined');
  });
});

/**
 * El panel filtrado por plaza.
 *
 * Filtrar por ciudad tiene una forma concreta de mentir: los números que NO
 * saben de plazas (los pagos, el SOS) llegan en `null`, y si el panel los
 * imprimiera con su formateador de siempre saldría «$0» y «0» — o sea, una
 * ciudad que parece muerta cuando lo único cierto es que ese dato no está
 * repartido por ciudades. Eso solo se ve ejecutando.
 */
describe('el panel por plaza', () => {
  interface ElementoFalso { style: Record<string, string>; innerHTML: string; value: string; disabled: boolean }

  const almacen = () => {
    const datos: Record<string, string> = {};
    return {
      getItem: (k: string) => datos[k] ?? null,
      setItem: (k: string, v: string) => { datos[k] = v; },
      removeItem: (k: string) => { delete datos[k]; },
    };
  };

  function montar(respuestas: Record<string, unknown>, ids: string[]) {
    const el: Record<string, ElementoFalso> = {};
    for (const id of ids) el[id] = { style: {}, innerHTML: '', value: '', disabled: false };
    const pedidas: string[] = [];
    const documentoFalso = {
      getElementById: (id: string) => el[id] ?? null,
      querySelector: () => null,
      querySelectorAll: () => [] as unknown[],
    };
    const fetchFalso = (path: string) => {
      pedidas.push(path);
      const clave = Object.keys(respuestas).find((k) => path.startsWith(k));
      return Promise.resolve({
        ok: clave !== undefined,
        status: clave !== undefined ? 200 : 404,
        json: () => Promise.resolve(
          clave !== undefined
            ? { success: true, data: respuestas[clave] }
            : { success: false, error: 'ruta no simulada: ' + path },
        ),
      });
    };
    const crear = new Function(
      'document', 'window', 'fetch', 'localStorage', 'sessionStorage', 'setTimeout',
      `${PANEL_JS}\n; return { loadMetrics, cargarPlazas, cambiarPlaza, oGuion, qPlaza,
         plaza: () => PLAZA, ponerCiudadAdmin: (c) => { ADMIN_CITY = c; } };`,
    ) as (...a: unknown[]) => Record<string, (...a: unknown[]) => unknown>;
    const fn = crear(documentoFalso, {}, fetchFalso, almacen(), almacen(), () => 0);
    return { fn, el, pedidas };
  }

  const esperar = () => new Promise((r) => setImmediate(r));

  const metricasDePlaza = {
    ciudad: 'pamplona',
    trips: { todayRequested: 4, todayCompleted: 3, todayCancelled: 1, last7dCompleted: 9, activeNow: 1 },
    // Los dos que no saben de plazas.
    money: { todayGmv: 42000, todayCommission: 6300, paymentsApprovedToday: null },
    drivers: { total: 5, verified: 4, onlineNow: 2, pendingDocuments: 0, unverifiedOperatingNow: 0 },
    stuck: { total: 0, viaje: 0, mandado: null, pedido: null, intermunicipal: null, desdeMin: 6 },
    orphaned: { total: 0, desdeMin: 45 },
    pilot: { active: false, expired: false, until: null, daysLeft: null },
    users: { total: 7, newToday: 1, porViajes: true },
    safety: { sosLast24h: null },
  };

  const domMetricas = ['metrics-grid', 'stuck-warn', 'pilot-warn', 'neg-dias', 'negocio', 'plaza'];

  it('«no se sabe» se escribe «—», y el cero sigue siendo cero', () => {
    const { fn } = montar({}, []);
    const oGuion = fn['oGuion'] as (v: unknown, f?: (x: unknown) => string) => string;
    expect(oGuion(null)).toBe('—');
    expect(oGuion(undefined)).toBe('—');
    expect(oGuion(0)).toBe('0');
    expect(oGuion(null, () => '$0')).toBe('—');
  });

  it('los datos que no saben de plazas NO se pintan como cero', async () => {
    const { fn, el } = montar({ '/admin/metrics': metricasDePlaza, '/admin/metrics/negocio': {} }, domMetricas);
    fn['loadMetrics']!();
    await esperar();
    const html = el['metrics-grid']!.innerHTML;
    expect(html).toContain('Pagos Wompi hoy');
    expect(html).not.toContain('$0');
    // El GMV de la plaza sí es un número y se pinta.
    expect(html).toContain('42.000');
    // Y «usuarios» cambia de nombre: con plaza no son los registrados.
    expect(html).toContain('Pasajeros con viajes aquí');
    expect(html).not.toContain('undefined');
  });

  it('la plaza elegida viaja en TODAS las consultas', async () => {
    const ciudades = [
      { slug: 'pamplona', name: 'Pamplona', department: 'N. de Santander', lat: 7.3, lng: -72.6, zone: null, commissionRate: null },
      { slug: 'cucuta', name: 'Cúcuta', department: 'N. de Santander', lat: 7.9, lng: -72.5, zone: null, commissionRate: null },
    ];
    const { fn, el, pedidas } = montar(
      { '/admin/municipalities': ciudades, '/admin/metrics': metricasDePlaza, '/admin/metrics/negocio': {} },
      domMetricas,
    );
    await fn['cargarPlazas']!();
    el['plaza']!.value = 'cucuta';
    // `cambiarPlaza` repinta la pestaña activa; sin pestaña activa no hay nada
    // que recargar, así que se llama a la carga directamente después.
    fn['cambiarPlaza']!();
    fn['loadMetrics']!();
    await esperar();
    expect(fn['plaza']!()).toBe('cucuta');
    expect(pedidas.some((p) => p === '/admin/metrics?ciudad=cucuta')).toBe(true);
    // La de negocio ya lleva `?dias=`: el separador tiene que ser «&» o la
    // petición saldría malformada y el filtro se perdería en silencio.
    expect(pedidas.some((p) => p.includes('/admin/metrics/negocio?dias=') && p.includes('&ciudad=cucuta'))).toBe(true);
  });

  it('un admin atado a su ciudad no puede elegir otra', async () => {
    const ciudades = [
      { slug: 'pamplona', name: 'Pamplona', department: 'N. de Santander', lat: 7.3, lng: -72.6, zone: null, commissionRate: null },
      { slug: 'cucuta', name: 'Cúcuta', department: 'N. de Santander', lat: 7.9, lng: -72.5, zone: null, commissionRate: null },
    ];
    const { fn, el } = montar({ '/admin/municipalities': ciudades }, ['plaza']);
    fn['ponerCiudadAdmin']!('cucuta');
    await fn['cargarPlazas']!();
    expect(el['plaza']!.disabled).toBe(true);
    expect(el['plaza']!.innerHTML).toContain('Cúcuta');
    expect(el['plaza']!.innerHTML).not.toContain('Pamplona');
    expect(el['plaza']!.innerHTML).not.toContain('Toda la plataforma');
    expect(fn['plaza']!()).toBe('cucuta');
  });
});
