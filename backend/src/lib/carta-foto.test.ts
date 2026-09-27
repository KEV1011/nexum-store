import { describe, expect, it } from 'vitest';
import { filasACsv, parsearCarta, preciosDeLinea, PRECIO_MIN } from './carta-foto';
import { parseProductCsv } from './product-csv';

/** La carta tal como sale de una foto de verdad: gritada y con puntos guía. */
const CARTA = `
ENTRADAS
Patacón con hogao        8.000
Empanadas (3)            $6.000

PLATOS FUERTES
Bandeja paisa ........... $25.000
Mojarra frita             22.500

BEBIDAS
Jugo natural        5.000 / 7.000
Gaseosa                   3.500
`;

describe('qué números de una línea pueden ser un precio', () => {
  it('lee el punto como separador de MILES', () => {
    // Leerlo como decimal convertiría tres mil quinientos en tres con cinco.
    expect(preciosDeLinea('Gaseosa 3.500')).toEqual([3500]);
    expect(preciosDeLinea('Bandeja $25.000')).toEqual([25000]);
  });

  it('acepta la coma y el número pelado, que también se escriben así', () => {
    expect(preciosDeLinea('Jugo 12,000')).toEqual([12000]);
    expect(preciosDeLinea('Jugo 12000')).toEqual([12000]);
  });

  it('una cantidad entre paréntesis NO es un precio', () => {
    // Es lo que impide que «Empanadas (3) 6.000» parezca tener dos precios y
    // acabe como fila con aviso en vez de producto.
    expect(preciosDeLinea('Empanadas (3) 6.000')).toEqual([6000]);
  });

  it('descarta lo que está fuera del rango de una carta', () => {
    expect(preciosDeLinea('Porción 250 g')).toEqual([]);
    expect(preciosDeLinea(`Algo ${PRECIO_MIN - 1}`)).toEqual([]);
    // Dos precios que el OCR pegó en uno: 12.000 y 8.000 → 120008000.
    expect(preciosDeLinea('Combo 120008000')).toEqual([]);
  });
});

describe('la carta completa', () => {
  const leida = parsearCarta(CARTA);

  it('reconoce los encabezados y los deja de leer a gritos', () => {
    expect(leida.secciones).toEqual(['Entradas', 'Platos fuertes', 'Bebidas']);
  });

  it('un encabezado NO se convierte en producto', () => {
    expect(leida.lineas.map((l) => l.nombre)).not.toContain('ENTRADAS');
  });

  it('cada plato hereda la sección bajo la que estaba', () => {
    const porNombre = new Map(leida.lineas.map((l) => [l.nombre, l]));
    expect(porNombre.get('Patacón con hogao')?.seccion).toBe('Entradas');
    expect(porNombre.get('Bandeja paisa')?.seccion).toBe('Platos fuertes');
    expect(porNombre.get('Gaseosa')?.seccion).toBe('Bebidas');
  });

  it('los puntos guía no se quedan pegados al nombre', () => {
    const bandeja = leida.lineas.find((l) => l.precio === 25000);
    expect(bandeja?.nombre).toBe('Bandeja paisa');
  });

  it('lee los precios de una sola lectura', () => {
    const porNombre = new Map(leida.lineas.map((l) => [l.nombre, l.precio]));
    expect(porNombre.get('Patacón con hogao')).toBe(8000);
    expect(porNombre.get('Mojarra frita')).toBe(22500);
    expect(porNombre.get('Gaseosa')).toBe(3500);
    // El «(3)» SE CONSERVA: es cuántas empanadas le dan por ese precio, no
    // decoración. Quitarlo cambiaba el producto y nadie lo habría notado
    // hasta que un cliente pidiera y le llegara una.
    expect(porNombre.get('Empanadas (3)')).toBe(6000);
  });

  it('cada fila dice de qué línea de la foto salió', () => {
    // Sin esto el dueño no puede contrastar la lista con su carta.
    const lineas = leida.lineas.map((l) => l.linea);
    expect(new Set(lineas).size).toBe(lineas.length);
    expect(Math.min(...lineas)).toBeGreaterThan(0);
  });
});

describe('cuando NO se puede saber el precio, se deja vacío', () => {
  it('con dos precios no se elige uno: se avisa y se deja en blanco', () => {
    // LA REGLA CARA. Quedarse con el primero vende barato el familiar; con el
    // último cobra de más el personal. Vacío lo rechaza el importador, así que
    // el peor caso es un producto que falta, no uno mal cobrado.
    const jugo = parsearCarta('Jugo natural 5.000 / 7.000').lineas[0]!;
    expect(jugo.precio).toBeNull();
    expect(jugo.nombre).toBe('Jugo natural');
    expect(jugo.aviso).toMatch(/2 precios/);
    expect(jugo.aviso).toContain('$5.000');
    expect(jugo.aviso).toContain('$7.000');
  });

  it('una línea larga sin precio NO se descarta en silencio', () => {
    const texto = 'Lomo al trapo en costra de sal marina con papas criollas';
    const fila = parsearCarta(texto).lineas[0]!;
    expect(fila.precio).toBeNull();
    expect(fila.nombre).toBe(texto);
    expect(fila.aviso).toMatch(/precio/i);
  });

  it('una línea de la que solo se leyó un número sale con aviso', () => {
    const fila = parsearCarta('  12.000  ').lineas[0]!;
    expect(fila.precio).toBeNull();
    expect(fila.aviso).toMatch(/nombre/i);
  });
});

describe('qué se toma por encabezado', () => {
  it('corto y sin puntuación, sí', () => {
    expect(parsearCarta('POSTRES\nFlan 6.000').secciones).toEqual(['Postres']);
  });

  it('una frase descrita, no — eso es un plato sin precio', () => {
    const r = parsearCarta('Arroz con pollo, ensalada y papas');
    expect(r.secciones).toEqual([]);
    expect(r.lineas).toHaveLength(1);
  });

  it('un encabezado ya escrito en minúsculas se respeta tal cual', () => {
    expect(parsearCarta('Para picar\nPapas 7.000').secciones).toEqual(['Para picar']);
  });

  it('lo que va antes del primer encabezado queda sin sección, no inventada', () => {
    const r = parsearCarta('Café 2.500\nBEBIDAS\nJugo 5.000');
    expect(r.lineas[0]!.seccion).toBe('');
    expect(r.lineas[1]!.seccion).toBe('Bebidas');
  });
});

describe('el CSV que se le entrega al importador de siempre', () => {
  it('lo que sale vuelve igual al leerlo: mismo escape a los dos lados', () => {
    // El escape vive junto a quien lo lee a propósito. Dos implementaciones
    // discrepan en el caso raro, que es el que destroza un catálogo.
    const csv = filasACsv([
      { nombre: 'Arroz, pollo y "especial"', precio: 18000, seccion: 'Platos fuertes' },
      { nombre: 'Gaseosa', precio: 3500, seccion: 'Bebidas' },
    ]);
    const preview = parseProductCsv(csv, new Map());
    expect(preview.errores).toEqual([]);
    expect(preview.nuevos.map((n) => n.nombre)).toEqual([
      'Arroz, pollo y "especial"',
      'Gaseosa',
    ]);
    expect(preview.nuevos[0]!.precio).toBe(18000);
    expect(preview.nuevos[0]!.seccion).toBe('Platos fuertes');
  });

  it('las filas sin precio no se escriben', () => {
    const csv = filasACsv([
      { nombre: 'Jugo natural', precio: null, seccion: 'Bebidas' },
      { nombre: 'Gaseosa', precio: 3500, seccion: 'Bebidas' },
    ]);
    expect(csv).not.toContain('Jugo natural');
    expect(csv).toContain('Gaseosa');
  });

  it('sin ninguna fila válida queda solo la cabecera', () => {
    expect(filasACsv([{ nombre: 'X', precio: null }]).split('\n')).toHaveLength(1);
  });
});
