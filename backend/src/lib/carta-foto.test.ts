import { describe, expect, it } from 'vitest';
import {
  filasACsv,
  parsearCarta,
  parsearCartaMedida,
  preciosDeLinea,
  unirPreciosHuerfanos,
  PRECIO_MIN,
} from './carta-foto';
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

describe('reconocer la sección cuando la longitud no alcanza', () => {
  // El reporte era que «no reconoce las secciones». La única pista que había
  // era la longitud: ≤28 caracteres y ≤4 palabras. Con eso, un título largo
  // pasaba a ser un plato sin precio y la sección desaparecía.
  const seccionesDe = (texto: string) => parsearCarta(texto).secciones;

  it('una frase larga en letra grande NO es un título: es un reclamo de la carta', () => {
    // «Todos nuestros platos se preparan al momento con ingredientes frescos»
    // va en grande en muchas cartas y no es una sección.
    const c = parsearCartaMedida([
      { texto: 'Todos nuestros platos se preparan al momento con ingredientes frescos', alto: 30 },
    ], 20, (a: number, b: number) => a >= b * 1.18);
    expect(c.secciones).toEqual([]);
  });

  it('un título GRITADO y largo es una sección', () => {
    expect(seccionesDe('PLATOS FUERTES Y ESPECIALES\nBandeja paisa 25.000'))
      .toEqual(['Platos fuertes y especiales']);
  });

  it('un título que acaba en dos puntos también', () => {
    const c = parsearCarta('Bebidas frías y calientes:\nGaseosa 3.500');
    expect(c.secciones).toEqual(['Bebidas frías y calientes']);
    // Los dos puntos no se quedan pegados al nombre de la sección.
    expect(c.lineas[0]!.seccion).toBe('Bebidas frías y calientes');
  });

  it('el vocabulario de una carta de aquí rescata lo demás', () => {
    expect(seccionesDe('Hamburguesas de la casa\nSencilla 12.000'))
      .toEqual(['Hamburguesas de la casa']);
    expect(seccionesDe('Adiciones\nQueso 2.000')).toEqual(['Adiciones']);
  });

  it('pero un PLATO que menciona su categoría NO es la sección', () => {
    // «Hamburguesa con queso, tocineta y papas» lleva «hamburguesa» y es un
    // plato: tomarlo por sección dejaría los siguientes platos colgados de un
    // título que es el nombre de otro plato.
    const c = parsearCarta('Hamburguesa con queso, tocineta y papas criollas');
    expect(c.secciones).toEqual([]);
    expect(c.lineas[0]!.aviso).toMatch(/precio/i);
  });

  it('una frase con punto sigue siendo un plato descrito', () => {
    expect(seccionesDe('Bandeja paisa. Incluye todo.')).toEqual([]);
  });
});

describe('la carta MEDIDA: dos columnas y el tamaño de la letra', () => {
  const titulo = (alto: number, cuerpo: number) => alto >= cuerpo * 1.18;

  it('el título se reconoce por el tamaño aunque la longitud lo rechazara', () => {
    const c = parsearCartaMedida([
      // Cinco palabras y sin gritar: la longitud (≤4 palabras) lo rechaza y el
      // vocabulario no lo reconoce. Solo el tamaño lo salva.
      { texto: 'Lo que más nos piden', alto: 30 },
      { texto: 'Bandeja paisa 25.000', alto: 20 },
    ], 20, titulo);
    expect(parsearCarta('Lo que más nos piden').secciones).toEqual([]);
    expect(c.secciones).toEqual(['Lo que más nos piden']);
    expect(c.lineas[0]!.seccion).toBe('Lo que más nos piden');
  });

  it('un renglón del TAMAÑO DEL CUERPO no es sección aunque sea corto', () => {
    // Es la mitad que de verdad arregla el reporte: «Pechuga» es corta y el
    // texto plano la tomaba por título, dejando los platos siguientes bajo una
    // sección que era un plato al que no se le leyó el precio.
    const c = parsearCartaMedida([
      { texto: 'BEBIDAS', alto: 28 },
      { texto: 'Pechuga', alto: 20 },
      { texto: 'Gaseosa 3.500', alto: 20 },
    ], 20, titulo);
    expect(c.secciones).toEqual(['Bebidas']);
    expect(c.lineas[0]!.nombre).toBe('Pechuga');
    expect(c.lineas[0]!.aviso).toMatch(/precio/i);
    expect(c.lineas[1]!.seccion).toBe('Bebidas');
  });

  it('sin alto medido deciden las pistas del texto', () => {
    const c = parsearCartaMedida([{ texto: 'BEBIDAS', alto: 0 }], 0, titulo);
    expect(c.secciones).toEqual(['Bebidas']);
  });
});

describe('el precio que quedó solo en su renglón', () => {
  // ES EL DEFECTO MÁS CARO DEL LECTOR y el que reportó el dueño: la carta
  // impresa más común pone el nombre arriba y el precio debajo. Sin unirlos,
  // el plato se vuelve SECCIÓN y el precio se vuelve un producto llamado
  // «21.000» — el plato desaparece del catálogo.
  it('se pega al nombre del plato de arriba', () => {
    const c = parsearCarta('ASADOS\nCarne asada\n21.000\nCostilla de cerdo BBQ\n23.000');
    expect(c.secciones).toEqual(['Asados']);
    expect(c.lineas.map((l) => [l.nombre, l.precio])).toEqual([
      ['Carne asada', 21000],
      ['Costilla de cerdo BBQ', 23000],
    ]);
    expect(c.lineas.every((l) => l.seccion === 'Asados')).toBe(true);
    expect(c.lineas.some((l) => l.aviso)).toBe(false);
  });

  it('convive con los platos que ya traen su precio en la misma línea', () => {
    const c = parsearCarta('Carne asada\n21.000\nPollo a la plancha  19.000');
    expect(c.lineas.map((l) => [l.nombre, l.precio])).toEqual([
      ['Carne asada', 21000],
      ['Pollo a la plancha', 19000],
    ]);
  });
});

describe('cuándo NO se une, que es lo que impide inventar productos', () => {
  it('no se une a un encabezado: todas sus palabras son de sección', () => {
    // «BEBIDAS» seguido de un precio suelto no es un producto llamado
    // «Bebidas»: unir de más publica un encabezado con precio.
    const c = parsearCarta('BEBIDAS\n3.000');
    expect(c.secciones).toEqual(['Bebidas']);
    expect(c.lineas[0]!.precio).toBeNull();
    expect(c.lineas[0]!.aviso).toBeTruthy();
  });

  it('«PLATOS FUERTES» tampoco, aunque sean dos palabras', () => {
    expect(parsearCarta('PLATOS FUERTES\n25.000').secciones).toEqual(['Platos fuertes']);
  });

  it('pero «CARNE ASADA» SÍ se une: «asada» no es vocabulario de sección', () => {
    // Se exige que lo sean TODAS justamente por este caso.
    expect(parsearCarta('CARNE ASADA\n21.000').lineas[0])
      .toMatchObject({ nombre: 'CARNE ASADA', precio: 21000 });
  });

  it('no se une si el de arriba ya tiene precio: son dos platos', () => {
    const c = parsearCarta('Pollo 19.000\n21.000');
    expect(c.lineas[0]).toMatchObject({ nombre: 'Pollo', precio: 19000 });
    expect(c.lineas[1]!.precio).toBeNull();
  });

  it('un renglón en blanco corta la unión: separa bloques', () => {
    const c = parsearCarta('Carne asada\n\n21.000');
    expect(c.lineas[0]!.precio).toBeNull();
  });

  it('a un mismo nombre no se le pega más de un precio', () => {
    const c = parsearCarta('Carne asada\n21.000\n23.000');
    expect(c.lineas[0]).toMatchObject({ nombre: 'Carne asada', precio: 21000 });
    expect(c.lineas[1]!.precio).toBeNull();
  });

  it('lo que no es SOLO un precio no se une', () => {
    // «(3)» son cuántas unidades trae el plato y «2x1» es la oferta: ninguno
    // es el precio del renglón de arriba. Se comprueba sobre la función que
    // une, no sobre la carta ya clasificada: ahí los dos acaban como sección y
    // el resultado no diría nada de la unión, que es lo que se está probando.
    const unidas = (filas: string[]) =>
      unirPreciosHuerfanos(filas.map((texto) => ({ texto }))).map((f) => f.texto);
    expect(unidas(['Picada', '(3)'])).toEqual(['Picada', '(3)']);
    expect(unidas(['Combo', '2x1'])).toEqual(['Combo', '2x1']);
    // Y el contraste: un precio de verdad SÍ se une.
    expect(unidas(['Choripapa', '21.000'])).toEqual(['Choripapa 21.000']);
    // El empate conocido, escrito para que no sorprenda: un plato que se llama
    // EXACTAMENTE como una palabra de sección («Picada») se trata como
    // encabezado y no absorbe. Sale como fila con aviso y el dueño la corrige
    // en la vista previa, que es el error barato de los dos.
    expect(unidas(['Picada', '21.000'])).toEqual(['Picada', '21.000']);
  });
});

describe('la carta MEDIDA: el tamaño y la columna mandan sobre la unión', () => {
  const titulo = (alto: number, cuerpo: number) => alto >= cuerpo * 1.18;

  it('un renglón GRANDE no absorbe el precio de abajo', () => {
    // Con geometría, el tamaño es la mejor pista que existe: si va escrito
    // más grande, es un título por mucho que le siga un número.
    const c = parsearCartaMedida([
      { texto: 'Especiales', alto: 30 },
      { texto: '25.000', alto: 20 },
    ], 20, titulo);
    expect(c.secciones).toEqual(['Especiales']);
    expect(c.lineas[0]!.precio).toBeNull();
  });

  it('un renglón del tamaño del cuerpo SÍ lo absorbe', () => {
    const c = parsearCartaMedida([
      { texto: 'Carne asada', alto: 20 },
      { texto: '21.000', alto: 20 },
    ], 20, titulo);
    expect(c.lineas[0]).toMatchObject({ nombre: 'Carne asada', precio: 21000 });
  });

  it('el precio de otra COLUMNA no se le pega al plato de la izquierda', () => {
    const c = parsearCartaMedida([
      { texto: 'Carne asada', alto: 20, columna: 0 },
      { texto: '23.000', alto: 20, columna: 1 },
    ], 20, titulo);
    expect(c.lineas[0]!.precio).toBeNull();
    expect(c.lineas).toHaveLength(2);
  });
});
