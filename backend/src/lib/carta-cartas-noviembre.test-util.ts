/**
 * Las cuatro cartas del reporte del 23 de noviembre de 2026 («tampoco
 * reconoce este tipo de menús»), reconstruidas con su disposición: dónde va
 * cada renglón y de qué tamaño, medido sobre las fotos. Así las pruebas leen
 * la misma forma que Vision devuelve, sin la foto.
 *
 *   - La Casa de la Pizza: tres columnas APRETADAS de sabores sin precio y,
 *     arriba, la cabecera con los tamaños en celdas.
 *   - La Sablée, postres: viñetas, el precio debajo del nombre, el nombre
 *     partido en dos renglones y bloques de viñetas lado a lado.
 *   - La Sablée, encargos y panes: las porciones entre el nombre y el precio,
 *     y el título partido en tres renglones.
 *   - La Sablée, pastas: el plato grande con su párrafo y el precio al final,
 *     la presentación de la sección y «Espagueti | Fettuccine» para escoger.
 */
import type { FraseFalsa } from './carta-vision-falsa.test-util';

const f = (texto: string, x: number, y: number, alto = 22): FraseFalsa => ({ texto, x, y, alto });

// ── La Casa de la Pizza: tamaños con precio ARRIBA, sabores sin precio ──────
function sabor(nombre: string, ingredientes: string[], x: number, y: number): FraseFalsa[] {
  return [f(nombre, x, y, 20), ...ingredientes.map((t, i) => f(t, x, y + 26 + i * 20, 16))];
}
export const CARTA_CASA_PIZZA: FraseFalsa[] = [
  f('PEQUEÑA', 70, 30, 20), f('MEDIANA', 420, 30, 20), f('GRANDE', 760, 30, 20),
  f('8 PORCIONES', 50, 56, 20), f('10 PORCIONES', 400, 56, 20), f('12 PORCIONES', 740, 56, 20),
  f('$25.000', 80, 82, 20), f('$31.000', 430, 82, 20), f('$39.000', 770, 82, 20),
  f('LA CASA DE LA PIZZA', 120, 140, 52),
  ...sabor('PEPERONI', ['Salsa, Queso, Orégano,', 'Pepperoni.'], 40, 230),
  ...sabor('MARGARITA', ['Salsa, Queso, Orégano.'], 40, 300),
  ...sabor('HAWAIANA', ['Salsa, Queso, Jamón, Piña.'], 40, 370),
  ...sabor('NONA', ['Salsa, Queso, Pollo,', 'Champiñones.'], 40, 460),
  ...sabor('MARIANA', ['Salsa, Queso, Pollo,', 'Jamón, Piña.'], 40, 570),
  ...sabor('BBQ', ['Salsa, Queso, Salchichón,', 'Tocineta, BBQ.'], 40, 690),
  ...sabor('NAPOLITANA', ['Salsa, Queso, Pepperoni,', 'Tomate, Orégano.'], 40, 800),
  ...sabor('ITALIANA', ['Salsa, Queso, Tomate,', 'Orégano.'], 360, 230),
  ...sabor('PRIMAVERA', ['Salsa, Queso, Jamón, Maíz', 'Tocineta.'], 360, 350),
  ...sabor('COLOMBIANA', ['Salsa, Queso, Pollo,', 'Maíz, Tocineta.'], 360, 460),
  ...sabor('GIMENA', ['Salsa, Queso, Pollo,', 'Champiñones, Tocineta.'], 360, 570),
  ...sabor('PAMPLONESA', ['Salsa, Queso, Salchichón,', 'Pollo, Tocineta'], 360, 690),
  ...sabor('GLORIA', ['Salsa, Queso, Jamón,', 'Pollo, Champiñones,', 'Tocineta.'], 360, 800),
  ...sabor('SEBAS', ['Salsa, Queso, Salchichón,', 'Salchicha, Chorizo,', 'Tocineta.'], 360, 920),
  ...sabor('JUAN BIMBA', ['Salsa, Queso, Salchichón,', 'Pimentón, Anchoa,', 'Champiñones, Tocineta.'], 680, 230),
  ...sabor('JALAPEÑA', ['Salsa, Queso, Chorizo,', 'Pimentón, Cebolla, Maíz,', 'Pollo.'], 680, 350),
  ...sabor('MEXICANA', ['Salsa, Queso, Carne,', 'Salchicha, Maíz, Pimentón,', 'Picante.'], 680, 460),
  ...sabor('VEGETARIANA', ['Salsa, Queso, Pimentón,', 'Cebolla, Maíz, Tomate,', 'Champiñones, Orégano.'], 680, 570),
  ...sabor('BOCADILLA', ['Salsa, Queso, Bocadillo,', 'Queso.'], 680, 690),
  ...sabor('SUPREMA', ['Salsa, Queso, Salchichón,', 'Pimentón, Maíz,', 'Camarones, Tocineta.'], 680, 800),
  ...sabor('CRIOLLA', ['Salsa, Queso, Carne de', 'cerdo, Cebolla, Pimentón,', 'Maíz, Carne de res.'], 680, 920),
  f('DELIVERY 3186869834 PAMPLONA', 30, 1040, 14),
  f('PANZEROTTI', 430, 1040, 18), f('$17.000', 450, 1062, 18),
  f('HAWAIANO.', 440, 1084, 14), f('MIXTO: Queso, jamon, pollo, maiz y champiñon.', 370, 1102, 12),
  f('LASAGNA', 440, 1140, 18), f('$17.000', 450, 1162, 18),
  f('LA CASA DE LA PIZZA', 40, 1150, 26),
];

// ── La Sablée, postres: nombre con viñeta y el precio DEBAJO ────────────────
function postre(nombre: string[], precio: string, x: number, y: number): FraseFalsa[] {
  return [
    ...nombre.map((t, i) => f(i === 0 ? `• ${t}` : t, x, y + i * 17, 13)),
    f(precio, x + 12, y + nombre.length * 17, 11),
  ];
}
export const CARTA_SABLEE_POSTRES: FraseFalsa[] = [
  f('La Sablée', 20, 40, 24),
  f('Tortas & postres', 680, 40, 30),
  ...[
    [['Macarron'], '$ 8.000'], [['Pie limón /maracuyá'], '$ 12.000'], [['Tiramisu'], '$ 12.000'],
    [['Philadelphia de moras'], '$ 12.000'], [['Rolls de canela'], '$ 12.000'],
    [['Flan de caramelo'], '$ 12.000'], [['Cheesecake', 'frutos rojos /oreo'], '$ 12.000'],
    [['Eclair'], '$ 14.000'], [['Tartaleta de croissant'], '$ 14.000'],
    [['Opera de chocolate'], '$ 14.000'], [['Torta vasca de pistachos'], '$ 14.000'],
    [['Croquembouche'], '$ 16.000'], [['Mousse'], '$ 16.000'], [['Milhojas'], '$ 16.000'],
  ].flatMap(([n, p], i) => postre(n as string[], p as string, 55, 140 + i * 50 + (i > 6 ? 20 : 0))),
  ...[[['Brownie'], '$ 9.000'], [['Brownie con helado'], '$ 16.000'], [['Copa de helado'], '$ 9.000']]
    .flatMap(([n, p], i) => postre(n as string[], p as string, 300, 760 + i * 50)),
  ...[[['Dietética de', 'almendras'], '$ 10.000'], [['Red velvet'], '$ 10.000'], [['Chocolate'], '$ 10.000'],
    [['Zanahoria'], '$ 10.000'], [['Coco'], '$ 10.000']]
    .flatMap(([n, p], i) => postre(n as string[], p as string, 655, 100 + i * 50 + (i > 0 ? 20 : 0))),
  ...[[['Guanábana'], '$ 10.000'], [['Yogurt griego'], '$ 10.000'], [['Vasca de queso'], '$ 10.000'],
    [['Ahuyama'], '$ 10.000'], [['Genovesa'], '$ 10.000']]
    .flatMap(([n, p], i) => postre(n as string[], p as string, 830, 100 + i * 50)),
  ...[[['Croissant', 'red velvet'], '$ 16.000'], [['Croissant de', 'pistachos'], '$ 16.000'],
    [['Croissant de', 'nutella'], '$ 16.000']]
    .flatMap(([n, p], i) => postre(n as string[], p as string, 520 + i * 170, 390)),
  f('UNA VIDA EXQUISITA', 50, 960, 11),
];

// ── La Sablée, encargos y panes: porciones entre paréntesis; columna a la
//    derecha con la viñeta DESPUÉS del nombre ───────────────────────────────
export const CARTA_SABLEE_PANES: FraseFalsa[] = [
  f('La Sablée', 20, 40, 24),
  f('Tortas & postres', 470, 40, 30), f('Por encargo', 470, 76, 30),
  ...[['Torta cuarto de libra', '(6 - 8 porciones)', '$ 45.000'],
    ['Torta media libra', '(12 - 16 porciones)', '$ 80.000'],
    ['Postre rectangular', '(6 - 8 porciones)', '$ 72.000'],
    ['Cheesecake', '(12 a 16 porciones)', '$ 96.000']]
    .flatMap(([n, p, v], i) => [
      f(`• ${n}`, 460, 130 + i * 70, 17), f(p!, 474, 150 + i * 70, 11), f(v!, 474, 168 + i * 70, 13)]),
  f('Nuestro', 1130, 120, 30), f('Pan artesanal', 1050, 154, 30), f('& de masa madre', 1000, 188, 30),
  ...[['Pan brioche', '$ 14.000'], ['Pan brioche con relleno', '$ 18.000'], ['Pan de masa madre', '$ 14.000'],
    ['Pan de masa madre', '$ 18.000'], ['Galletas', '$ 7.000'], ['Merengues', '$ 9.000']]
    .flatMap(([n, v], i) => {
      const ancho = (n!.length + 2) * 17 * 0.64;
      return [f(`${n} •`, 1270 - ancho, 245 + i * 46, 17), f(v!, 1200, 265 + i * 46, 13)];
    }),
];

// ── La Sablée, pastas y cacerolas: precio a la DERECHA en la tabla, la
//    elección de la pasta en una línea propia, la nota de la sección ───────
export const CARTA_SABLEE_PASTAS: FraseFalsa[] = [
  f('Pastas artesanales', 48, 40, 30),
  f('Se elaboran desde cero utilizando', 48, 80, 13),
  f('ingredientes 100% naturales,', 48, 96, 13),
  f('sin conservantes ni colorantes artificiales.', 48, 112, 13),
  f('Todas nuestras pastas van', 48, 134, 13),
  f('acompañadas de pan focaccia.', 48, 150, 13),
  f('La Sablée', 880, 40, 24),
  f('Canelones de pollo stroganoff', 48, 200, 20),
  f('Tubos de pasta fresca rellena de pechuga', 48, 230, 13),
  f('de pollo, bañados en salsa bolognesa', 48, 246, 13),
  f('y topping de queso parmesano.', 48, 262, 13),
  f('$ 32.000', 48, 286, 13),
  f('Pasta larga', 44, 330, 20),
  f('Espagueti | Fettuccine', 44, 362, 13),
  f('Bolognesa', 44, 400, 13), f('$ 26.000', 330, 400, 13),
  f('Alfredo jamón y champiñones', 44, 426, 13), f('$ 26.000', 330, 426, 13),
  f('Pomodoro y albóndigas', 44, 452, 13), f('$ 28.000', 330, 452, 13),
  f('Lasagna mixta', 44, 500, 20), f('$ 32.000', 330, 500, 13),
  f('Pasta fresca artesanal horneada con capas de', 44, 528, 13),
  f('queso fundido, pollo stroganoff y carne bolognesa.', 44, 544, 13),
  f('Cacerolas', 790, 580, 30),
  f('Calentao antioqueño', 756, 626, 18),
  f('Frijoles, arróz, toques de chicharrón,', 722, 650, 12),
  f('platano maduro, huevo frito', 780, 666, 12), f('y aguacate.', 880, 682, 12),
  f('$ 26.000', 880, 706, 13),
  f('Cacerola de morrillo', 750, 740, 18),
  f('Carne de morrillo, papas criollas,', 740, 764, 12),
  f('queso asado y huevo frito.', 790, 780, 12),
  f('$ 30.000', 880, 806, 13),
  f('Cacerola de chicharrón', 748, 840, 18),
  f('Chicharrón carnudo, papas criollas,', 735, 864, 12),
  f('guacamole y pico de gallo.', 790, 880, 12),
  f('$ 30.000', 880, 906, 13),
  f('UNA VIDA EXQUISITA', 50, 960, 11),
];
