// El dibujo de un plato que todavía no tiene foto.
//
// Los 21 antojos de la home («¿Qué se te antoja?») sirven para AGRUPAR, y por
// eso son gruesos: «Asados» junta la picada, el chorizo y el churrasco bajo un
// mismo filete crudo, y «Mariscos» pone un camarón a una mojarra frita. En el
// carrusel eso está bien —es una puerta—, pero en la fila de un plato confunde:
// la mojarra con un camarón al lado se lee como un error de la carta.
//
// Este catálogo es el FINO: un dibujo por plato reconocible, del mismo juego
// 3D (Fluent Emoji de Microsoft, MIT — aviso en assets/licencias), procesado
// igual que los antojos (`tools/procesar-ilustraciones-3d.py --antojo`) para
// que todos tengan la misma luz, la misma sombra y el mismo aire. Donde un
// antojo ya tiene el dibujo justo (la hamburguesa, la pizza), se reutiliza su
// archivo en vez de duplicarlo.
//
// CÓMO SE ELIGE, y es lo que lo hace acertar sin un modelo:
//
//  1. Gana la palabra que aparece PRIMERO en el nombre. Una carta nombra el
//     plato por lo principal: «Hamburguesa de pollo», «Arroz con camarones»,
//     «Jugo de mango», «Torta de chocolate». Recorrer el catálogo en orden
//     daría el pollo, el camarón, el mango y el chocolate.
//  2. Empate en la misma posición: gana la frase MÁS LARGA. Así «ensalada de
//     frutas» le gana a «ensalada», «chocolate caliente» a «chocolate» y
//     «picada de frutas» a «picada».
//  3. Si el nombre no dice nada («La Bestia»), se mira la SECCIÓN de la carta
//     («HAMBURGUESAS»); si tampoco, el antojo grueso; si tampoco, NADA. Un
//     dibujo inventado es peor que no tener ninguno. Y si el nombre solo
//     nombra un INGREDIENTE («Cuatro quesos») y la sección nombra un PLATO
//     («PIZZAS»), manda la sección.

import 'package:nexum_client/features/businesses/domain/antojos.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

class IconoPlato {
  const IconoPlato(this.asset, this.palabras, {this.ingrediente = false});

  /// Ruta del render (1x; Flutter elige 2.0x/3.0x solo).
  final String asset;

  /// Palabras o frases normalizadas (sin tildes, minúscula). Casan como
  /// palabra entera, con plural opcional.
  final List<String> palabras;

  /// ¿Es un INGREDIENTE más que un plato? El pollo, la carne, el queso.
  /// Importa para la regla 3: «Cuatro quesos» en la sección PIZZAS es una
  /// pizza, no un queso, y «Doble carne» en HAMBURGUESAS es una hamburguesa.
  final bool ingrediente;
}

const _p = 'assets/platos/';
const _a = 'assets/antojos/';

/// El orden solo desempata cuando dos entradas casan la MISMA frase en la
/// misma posición; lo que decide es la regla 1.
const List<IconoPlato> kIconosPlato = [
  // ── Comidas rápidas y de mano ──
  IconoPlato('${_a}hamburguesas.png', ['hamburguesa', 'burger', 'hamburger']),
  IconoPlato('${_a}pizza.png', ['pizza', 'pizzeta', 'calzone']),
  IconoPlato('${_a}perros.png', [
    'perro caliente', 'perro', 'perrito', 'hot dog', 'hotdog',
  ]),
  IconoPlato('${_a}sandwiches.png', [
    'sandwich', 'sandwiche', 'sanduche', 'sanduchito', 'panini', 'club house',
  ]),
  IconoPlato('${_p}burrito.png', ['burrito', 'wrap']),
  IconoPlato('${_a}mexicana.png', ['taco', 'nacho', 'fajita', 'enchilada']),
  IconoPlato('${_p}quesadilla.png', [
    'quesadilla', 'shawarma', 'kebab', 'pita', 'doner',
  ]),
  IconoPlato('${_a}arepas.png', ['arepa', 'patacon']),
  IconoPlato('${_a}empanadas.png', [
    'empanada', 'empanadita', 'dumpling', 'gyoza', 'wanton', 'wantan',
  ]),
  IconoPlato('${_p}tamal.png', ['tamal', 'envuelto', 'bollo']),
  IconoPlato('${_p}bunuelo.png', ['bunuelo', 'falafel', 'croqueta']),
  IconoPlato('${_p}chuzo.png', ['chuzo', 'pincho', 'brocheta', 'anticucho']),
  IconoPlato('${_a}salchipapas.png', [
    'salchipapa', 'choripapa', 'salchipollo', 'papas', 'papas fritas',
    'papa francesa', 'papas a la francesa', 'papitas',
  ]),

  // ── Oriental ──
  IconoPlato('${_a}sushi.png', [
    'sushi', 'maki', 'nigiri', 'sashimi', 'temaki', 'roll',
  ]),
  IconoPlato('${_a}oriental.png', ['ramen', 'udon', 'sopa wantan', 'noodles']),
  IconoPlato('${_p}arroz_chino.png', [
    'arroz chino', 'arroz frito', 'arroz oriental', 'arroz cantones',
    'chop suey', 'chow mein', 'lumpia', 'wok', 'yakimeshi', 'chaufa',
  ]),

  // ── Platos de cuchara y de mesa ──
  IconoPlato('${_p}sopa.png', [
    'sopa', 'sancocho', 'ajiaco', 'caldo', 'mondongo', 'consome', 'frijolada',
    'cuchuco', 'mute', 'sudado',
  ]),
  IconoPlato('${_p}crema.png', [
    'crema de', 'mazamorra', 'arroz con leche', 'cereal', 'poke',
  ]),
  IconoPlato('${_p}paella.png', [
    'paella', 'cazuela', 'cazuela de mariscos', 'arroz marinero',
  ]),
  IconoPlato('${_p}arroz.png', [
    'arroz', 'bandeja paisa', 'bandeja', 'almuerzo', 'corrientazo', 'ejecutivo',
    'menu del dia', 'plato del dia', 'plato tipico',
  ]),
  IconoPlato('${_a}pastas.png', [
    'pasta', 'espagueti', 'spaghetti', 'lasana', 'fettuccine', 'fetuccini',
    'raviol', 'ravioli', 'macarron', 'canelon',
  ]),
  IconoPlato('${_a}ensaladas.png', ['ensalada', 'ensalada cesar']),
  IconoPlato('${_p}frutas.png', [
    'ensalada de frutas', 'salpicon', 'fruta', 'picada de frutas',
    'coctel de frutas', 'frutas picadas',
  ]),
  IconoPlato('${_p}fresas.png', ['fresas con crema', 'fresa'], ingrediente: true),
  IconoPlato('${_a}desayunos.png', [
    'huevo', 'huevos', 'omelette', 'omelet', 'perico', 'calentado',
    'desayuno', 'revuelto',
  ], ingrediente: true),

  // ── Carnes y pescados ──
  IconoPlato('${_a}pollo.png', [
    'pollo', 'alita', 'pechuga', 'broaster', 'muslo', 'nugget', 'apanado',
    'gallina', 'pollo asado', 'filete de pollo',
  ], ingrediente: true),
  IconoPlato('${_p}costilla.png', [
    'costilla', 'picada', 'parrillada', 'chuleta', 'pernil', 'lechona',
    'cerdo', 'bbq',
  ], ingrediente: true),
  IconoPlato('${_a}asados.png', [
    'carne', 'carnes', 'lomo', 'churrasco', 'punta de anca', 'baby beef',
    'bife', 'solomito', 'sobrebarriga', 'posta', 'res', 'steak', 'asado',
    'carne asada', 'chorizo', 'morcilla', 'filete',
  ], ingrediente: true),
  IconoPlato('${_p}chicharron.png', [
    'chicharron', 'tocino', 'tocineta', 'bacon',
  ], ingrediente: true),
  IconoPlato('${_a}mariscos.png', [
    'camaron', 'langostino', 'ceviche', 'marisco',
  ], ingrediente: true),
  IconoPlato('${_p}pescado.png', [
    'pescado', 'mojarra', 'trucha', 'tilapia', 'salmon', 'bagre', 'robalo',
    'atun', 'pargo', 'bocachico', 'filete de pescado', 'cazon',
  ], ingrediente: true),
  IconoPlato('${_p}langosta.png', ['langosta'], ingrediente: true),
  IconoPlato('${_p}cangrejo.png', ['cangrejo', 'jaiba'], ingrediente: true),
  IconoPlato('${_p}calamar.png', ['calamar', 'pulpo'], ingrediente: true),

  // ── Acompañantes ──
  IconoPlato('${_p}papa.png', [
    'papa', 'papa criolla', 'papa rellena', 'papa salada', 'yuca',
  ], ingrediente: true),
  IconoPlato('${_p}mazorca.png', [
    'mazorca', 'mazorcada', 'maiz', 'choclo', 'desgranado', 'elote',
  ], ingrediente: true),
  IconoPlato('${_p}aguacate.png', ['aguacate', 'guacamole'], ingrediente: true),
  IconoPlato('${_p}queso.png', ['queso', 'tabla de quesos'], ingrediente: true),
  IconoPlato('${_p}crispetas.png', ['crispetas', 'palomitas', 'popcorn']),

  // ── Panadería ──
  IconoPlato('${_a}panaderia.png', [
    'pan', 'pandebono', 'pan de bono', 'almojabana', 'pandeyuca',
    'pan de queso', 'mogolla', 'roscon', 'mantecada', 'achira',
  ]),
  IconoPlato('${_p}croissant.png', ['croissant', 'cachito', 'medialuna']),
  IconoPlato('${_p}pancakes.png', ['pancake', 'panqueque', 'crepe']),
  IconoPlato('${_p}waffle.png', ['waffle', 'wafle']),

  // ── Postres ──
  IconoPlato('${_a}postres.png', [
    'torta', 'ponque', 'tres leches', 'cheesecake', 'postre', 'tiramisu',
    'milhoja', 'merengon',
  ]),
  IconoPlato('${_p}cumpleanos.png', ['torta de cumpleanos', 'cumpleanos']),
  IconoPlato('${_p}cupcake.png', ['cupcake', 'muffin', 'ponquecito']),
  IconoPlato('${_p}pie.png', ['pie', 'tarta', 'kuchen']),
  IconoPlato('${_p}chocolate.png', ['brownie', 'chocolatina', 'chocolate']),
  IconoPlato('${_p}galleta.png', ['galleta', 'cookie']),
  IconoPlato('${_p}dona.png', ['dona', 'donut', 'rosquilla']),
  IconoPlato('${_p}flan.png', [
    'flan', 'pudin', 'natilla', 'gelatina', 'creme brulee',
  ]),
  IconoPlato('${_a}helados.png', ['helado', 'cono', 'paleta', 'barquillo']),
  IconoPlato('${_p}copa_helado.png', [
    'copa', 'copa de helado', 'sundae', 'banana split',
  ]),
  IconoPlato('${_p}raspado.png', ['raspado', 'granizado', 'cholado']),

  // ── Bebidas ──
  IconoPlato('${_a}cafe.png', [
    'cafe', 'tinto', 'capuchino', 'cappuccino', 'latte', 'espresso',
    'americano', 'mocaccino', 'chocolate caliente', 'aguapanela',
    'agua de panela', 'milo', 'bebida caliente', 'bebidas calientes',
  ]),
  IconoPlato('${_p}te.png', [
    'aromatica', 'infusion', 'te verde', 'te negro', 'te chai', 'te de',
  ]),
  IconoPlato('${_p}leche.png', ['leche', 'avena', 'kumis', 'yogur', 'yogurt']),
  IconoPlato('${_p}gaseosa.png', [
    'gaseosa', 'soda', 'coca cola', 'cocacola', 'pepsi', 'refresco',
    'postobon', 'malteada', 'frappe', 'milkshake', 'smoothie', 'bebida',
  ]),
  IconoPlato('${_p}bubble_tea.png', ['bubble tea', 'boba', 'te de burbujas']),
  IconoPlato('${_p}jugo.png', [
    'jugo', 'limonada', 'naranjada', 'lulada', 'jugo natural',
  ]),
  IconoPlato('${_p}coctel.png', [
    'coctel', 'mojito', 'margarita', 'martini', 'pina colada', 'licor',
  ]),
  IconoPlato('${_p}cerveza.png', ['cerveza', 'pola', 'michelada']),
  IconoPlato('${_p}vino.png', ['vino', 'sangria', 'copa de vino']),
];

class _Casa {
  const _Casa(this.inicio, this.largo, this.orden);
  final int inicio;
  final int largo;
  final int orden;

  /// Regla 1: antes; regla 2: más larga; luego el orden del catálogo.
  bool mejorQue(_Casa o) => inicio != o.inicio
      ? inicio < o.inicio
      : largo != o.largo
          ? largo > o.largo
          : orden < o.orden;
}

// Dentro de una entrada, las frases largas van primero en la alternancia: la
// expresión regular se queda con la PRIMERA alternativa que casa, no con la más
// larga, y la regla 2 necesita saber cuánto casó de verdad.
String _alternancia(List<String> palabras) =>
    ([...palabras]..sort((a, b) => b.length - a.length))
        .map(RegExp.escape)
        .join('|');

final List<RegExp> _patrones = [
  for (final i in kIconosPlato)
    RegExp('(^| )(${_alternancia(i.palabras)})(s|es)?(?= |\$)'),
];

/// La entrada del catálogo que nombra un texto ya normalizado, o null.
IconoPlato? _iconoDeTexto(String normalizado) {
  if (normalizado.isEmpty) return null;
  _Casa? mejor;
  for (var k = 0; k < kIconosPlato.length; k++) {
    final m = _patrones[k].firstMatch(normalizado);
    if (m == null) continue;
    final c = _Casa(m.start + m.group(1)!.length, m.group(2)!.length, k);
    if (mejor == null || c.mejorQue(mejor)) mejor = c;
  }
  return mejor == null ? null : kIconosPlato[mejor.orden];
}

/// El dibujo de un plato (reglas 1–3), o null. No mira la foto: eso lo
/// decide quien lo pinta, porque la foto real siempre manda.
String? iconoDePlato(ProductEntity p) {
  if (p.suggestAsAddon) return null;
  final porNombre = _iconoDeTexto(normalizarTexto(p.name));
  final porSeccion = _iconoDeTexto(normalizarTexto(p.category));
  // Un INGREDIENTE en el nombre no le gana a un PLATO en la sección: en
  // PIZZAS, «Pollo con champiñones» es una pizza. Al revés sí manda el
  // nombre: una «Gaseosa» en la sección HAMBURGUESAS (los combos) es una
  // gaseosa.
  final elegido = porNombre != null &&
          porNombre.ingrediente &&
          porSeccion != null &&
          !porSeccion.ingrediente
      ? porSeccion
      : porNombre ?? porSeccion;
  return elegido?.asset ?? antojoDeProducto(p)?.ilustracion;
}
