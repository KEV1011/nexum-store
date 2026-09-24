import { describe, it, expect } from 'vitest';
import {
  plantillaDe,
  plantillaDeConfig,
  capacidadDe,
  configuracionesPara,
  configPorDefecto,
  sillasDe,
  sillasLibres,
  motivoParaNoReservar,
  esTipoConSillas,
  FILAS_MIN,
  FILAS_MAX,
  type ConfigSillas,
} from './mapa-asientos';

describe('la plantilla del vehículo', () => {
  it('numera de adelante hacia atrás, sin saltos ni repetidos', () => {
    // La numeración es la que está pintada en el tubo del asiento. Si la app
    // numerara de otra forma, el pasajero pide la 5, se sienta en la 7 y la
    // discusión es a bordo contra el conductor.
    for (const tipo of ['VAN', 'BUSETA', 'BUS'] as const) {
      const n = sillasDe(tipo);
      expect(n).toEqual([...Array(n.length)].map((_, i) => i + 1));
    }
  });

  it('cada tipo tiene el porte que le toca', () => {
    // Una van no puede tener más sillas que un bus: el mapa sería una mentira
    // sobre qué se está comprando.
    const van = plantillaDe('VAN').sillas;
    const buseta = plantillaDe('BUSETA').sillas;
    const bus = plantillaDe('BUS').sillas;
    expect(van).toBeLessThan(buseta);
    expect(buseta).toBeLessThan(bus);
  });

  it('el pasillo parte la fila y no se vende', () => {
    const p = plantillaDe('BUS');
    const filaPasajeros = p.filas[2]!;
    expect(filaPasajeros.some((c) => c.tipo === 'pasillo')).toBe(true);
    expect(filaPasajeros.filter((c) => c.tipo === 'silla')).toHaveLength(4);
  });

  it('dibuja al conductor y la puerta, que no son sillas', () => {
    // Sin la cabina el mapa no tiene orientación y elegir «adelante» es una
    // lotería.
    const p = plantillaDe('BUSETA');
    const cabina = p.filas[0]!;
    expect(cabina.some((c) => c.tipo === 'conductor')).toBe(true);
    expect(cabina.some((c) => c.tipo === 'puerta')).toBe(true);
    expect(cabina.some((c) => c.tipo === 'silla')).toBe(false);
  });

  it('todas las filas tienen el mismo ancho', () => {
    // Si una fila fuera más corta, el mapa se dibujaría torcido y las sillas
    // no cuadrarían con las de al lado.
    for (const tipo of ['VAN', 'BUSETA', 'BUS'] as const) {
      const p = plantillaDe(tipo);
      for (const fila of p.filas) expect(fila).toHaveLength(p.columnas);
    }
  });

  it('el número de filas se acota', () => {
    // Una buseta de 40 filas no existe, y una de cero tampoco. Un valor
    // absurdo del portal no puede generar un mapa imposible.
    expect(plantillaDe('BUSETA', 0).filas.length).toBe(FILAS_MIN + 1); // +cabina
    expect(plantillaDe('BUSETA', 999).filas.length).toBe(FILAS_MAX + 1);
    expect(plantillaDe('BUSETA', 2.7).sillas).toBe(plantillaDe('BUSETA', 2).sillas);
  });

  it('reconoce solo los tipos que llevan pasajeros', () => {
    expect(esTipoConSillas('BUS')).toBe(true);
    expect(esTipoConSillas('MULA')).toBe(false);
    expect(esTipoConSillas('moto')).toBe(false);
    expect(esTipoConSillas(null)).toBe(false);
  });
});

describe('qué selección se acepta', () => {
  const base = { tipo: 'BUSETA' as const, ocupadas: [] as number[] };

  it('una silla libre pasa', () => {
    expect(motivoParaNoReservar({ ...base, pedidas: [3] })).toBeNull();
  });

  it('sin elegir nada, no', () => {
    expect(motivoParaNoReservar({ ...base, pedidas: [] })).toMatch(/al menos una/i);
  });

  it('una silla que no existe, no — y dice cuál', () => {
    const m = motivoParaNoReservar({ ...base, pedidas: [999] });
    expect(m).toContain('999');
    expect(m).toMatch(/no existe/i);
  });

  it('una silla ya vendida, no — y dice cuál, para poder elegir otra', () => {
    const m = motivoParaNoReservar({ ...base, ocupadas: [4], pedidas: [4, 5] });
    expect(m).toContain('4');
    expect(m).toMatch(/tomada/i);
  });

  it('la misma silla dos veces en el mismo pedido, no', () => {
    // Pasa de verdad: se toca dos veces en el mapa y se enviaría duplicada,
    // cobrando dos puestos y ocupando uno.
    expect(motivoParaNoReservar({ ...base, pedidas: [2, 2] })).toMatch(/repetida/i);
  });
});

describe('cuántas quedan', () => {
  it('se calcula de las ocupadas, no de un contador', () => {
    const total = plantillaDe('VAN').sillas;
    expect(sillasLibres('VAN', [])).toBe(total);
    expect(sillasLibres('VAN', [1, 2])).toBe(total - 2);
  });

  it('una silla ocupada que no existe no descuenta', () => {
    // Un dato sucio en la base no puede hacer que el vehículo aparezca con
    // menos puestos de los que tiene.
    const total = plantillaDe('VAN').sillas;
    expect(sillasLibres('VAN', [999])).toBe(total);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La configuración declarada por la empresa.
//
// Con los tres moldes cerrados que había antes, la capacidad solo saltaba de
// cuatro en cuatro. Estas pruebas fijan que las capacidades REALES —las que
// ruedan por las carreteras de Norte de Santander y Antioquia— se puedan
// publicar, porque no poder hacerlo obliga a la empresa a declarar el número
// de al lado: o vende sillas que no existen, o deja dos sin vender.
// ─────────────────────────────────────────────────────────────────────────────

describe('la configuración del vehículo de cada empresa', () => {
  const REALES: Array<[Parameters<typeof capacidadDe>[0], number[]]> = [
    ['VAN', [12, 14, 15, 16, 19]],
    ['BUSETA', [19, 20, 21, 24, 25, 26, 28]],
    ['BUS', [32, 36, 40, 44, 46, 48]],
  ];

  it.each(REALES)('%s: toda capacidad real se puede publicar', (tipo, capacidades) => {
    for (const n of capacidades) {
      const opciones = configuracionesPara(tipo, n);
      expect(opciones.length, `${tipo} de ${n} puestos no tiene ninguna disposición`).toBeGreaterThan(0);
      // Lo que se ofrece tiene que dar EXACTAMENTE lo pedido: una disposición
      // que da 39 cuando el bus tiene 40 se descubre con el bus lleno.
      for (const c of opciones) expect(capacidadDe(tipo, c)).toBe(n);
    }
  });

  it('propone el vehículo típico del tipo, no el que cuadre primero', () => {
    // Con un criterio de simetría abstracta, a una buseta de 26 se le ofrecía
    // «1+1 con 13 filas»: da 26 y no existe en ninguna carretera.
    const [mejor] = configuracionesPara('BUS', 40);
    expect(mejor).toBeDefined();
    expect(mejor!.izquierda).toBe(2);
    expect(mejor!.derecha).toBe(2);
  });

  it('una capacidad imposible no devuelve nada, en vez de aproximar', () => {
    // Redondear al número de al lado es justo el error que esto viene a
    // corregir: quien pida 500 tiene que ver que no cuadra, no un bus de 46.
    expect(configuracionesPara('BUS', 500)).toEqual([]);
    expect(configuracionesPara('BUS', 0)).toEqual([]);
  });

  it('la capacidad se cuenta del mapa, no de una fórmula aparte', () => {
    const config: ConfigSillas = { izquierda: 2, derecha: 2, filas: 10, fondoCorrido: 5 };
    const plantilla = plantillaDeConfig('BUS', config);
    const contadas = plantilla.filas.flat().filter((c) => c.tipo === 'silla').length;

    expect(capacidadDe('BUS', config)).toBe(contadas);
  });

  it('numera correlativo de adelante hacia atrás, también con fondo corrido', () => {
    const p = plantillaDeConfig('BUS', { izquierda: 2, derecha: 2, filas: 6, fondoCorrido: 5 });
    const numeros = p.filas.flat()
      .filter((c): c is { tipo: 'silla'; numero: number } => c.tipo === 'silla')
      .map((c) => c.numero);

    expect(numeros).toEqual(Array.from({ length: numeros.length }, (_, i) => i + 1));
  });

  it('la rejilla es rectangular cuando el fondo lleva menos sillas que una fila', () => {
    // Elegir bien el caso costó dos intentos, y vale la pena dejarlo escrito.
    // Con 2+2 el ancho es cinco (dos, pasillo, dos) y el fondo no puede pasar
    // de cinco, así que un fondo LARGO nunca desborda: esa versión de la
    // prueba seguía en verde con el relleno quitado, o sea que no probaba
    // nada. Donde el relleno hace falta es en un fondo CORTO — tres sillas en
    // una rejilla de cinco de ancho. Sin él la app pinta el mapa dentado y el
    // pasajero no sabe cuál es la ventana.
    const p = plantillaDeConfig('BUS', { izquierda: 2, derecha: 2, filas: 8, fondoCorrido: 3 });

    expect(p.columnas).toBe(5);
    for (const fila of p.filas) expect(fila.length).toBe(p.columnas);
  });

  it('el baño ocupa una silla y no se vende', () => {
    const sin: ConfigSillas = { izquierda: 2, derecha: 2, filas: 8, fondoCorrido: 4 };
    const con: ConfigSillas = { ...sin, bano: 'derecha' };

    expect(capacidadDe('BUS', con)).toBe(capacidadDe('BUS', sin) - 1);
    // Y la numeración sigue sin huecos: el baño no deja un número muerto que
    // alguien pediría por teléfono y nadie encontraría en el bus.
    const numeros = plantillaDeConfig('BUS', con).filas.flat()
      .filter((c): c is { tipo: 'silla'; numero: number } => c.tipo === 'silla')
      .map((c) => c.numero);
    expect(numeros).toEqual(Array.from({ length: numeros.length }, (_, i) => i + 1));
  });

  it('los presets siguen dando lo mismo que antes de ser configurables', () => {
    // Las salidas ya publicadas se guardaron con el molde viejo. Cambiarles el
    // mapa a mitad de venta dejaría a quien ya compró sin saber dónde se
    // sienta, y la discusión sería a bordo.
    expect(plantillaDe('VAN').sillas).toBe(11);
    expect(plantillaDe('BUSETA').sillas).toBe(18);
    expect(plantillaDe('BUS').sillas).toBe(38);
  });

  it('un lado fuera de rango se acota en vez de reventar', () => {
    const p = plantillaDeConfig('BUS', { izquierda: 99, derecha: -3, filas: 4 });
    expect(p.sillas).toBeGreaterThan(0);
    for (const fila of p.filas) expect(fila.length).toBe(p.columnas);
  });

  it('el preset de cada tipo es una configuración válida', () => {
    for (const tipo of ['VAN', 'BUSETA', 'BUS'] as const) {
      const c = configPorDefecto(tipo);
      expect(capacidadDe(tipo, c)).toBe(plantillaDe(tipo).sillas);
    }
  });
});
