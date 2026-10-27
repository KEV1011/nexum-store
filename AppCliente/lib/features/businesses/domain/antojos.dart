// ── «¿Qué se te antoja?» y buscar por plato ──────────────────────────────────
//
// EL HUECO. La home agrupaba por TIPO DE NEGOCIO (restaurante, supermercado,
// droguería) y el buscador solo comparaba el NOMBRE del local. Quien tiene
// ganas de una hamburguesa no busca «BETOS»: busca hamburguesa. Si BETOS vende
// seis y su nombre no lo dice, para la app no existían.
//
// Los productos ya llegan al teléfono con la lista de comercios, así que todo
// esto se decide aquí, sin pedirle nada nuevo al servidor.
//
// LAS REGLAS QUE IMPIDEN QUE ESTO MIENTA:
//
// 1. Un plato tiene UN antojo, el primero que case en el orden del catálogo.
//    «Hamburguesa de pollo» es hamburguesa, no pollo; por eso los tipos de
//    plato van antes que los ingredientes sueltos.
// 2. Primero manda el NOMBRE del plato; si no dice nada, la SECCIÓN de la
//    carta. «La Bestia» en la sección HAMBURGUESAS es una hamburguesa.
// 3. Lo que el local ofrece al pagar (`suggestAsAddon`: la gaseosa, las papas)
//    no clasifica al local: una malteada de acompañamiento no convierte una
//    hamburguesería en heladería.
// 4. Un antojo se enseña solo si lo tienen al menos DOS locales. Con uno no es
//    una categoría, es un local; y un antojo sin ninguno lleva a una lista
//    vacía, que se lee como app rota.

import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

/// Un antojo del catálogo cerrado.
class Antojo {
  const Antojo({
    required this.clave,
    required this.nombre,
    required this.palabras,
    this.soloComoPlato = false,
  });

  /// Identificador estable: también es el nombre de su ilustración.
  final String clave;

  /// Cómo se ve en la tarjeta («Hamburguesas»).
  final String nombre;

  /// Palabras normalizadas (sin tildes, minúscula) que lo delatan. Casan como
  /// palabra entera, con o sin plural («taco» casa «tacos»).
  final List<String> palabras;

  /// Sus palabras solo cuentan cuando nombran EL PLATO, no un ingrediente:
  /// «Pollo asado» y «1/2 pollo broaster» son pollo; «Arroz con pollo»,
  /// «Ajiaco con pollo» o «Sopa de pollo» no lo son — ahí el pollo va dentro
  /// de otra cosa, y quien tiene antojo de pollo asado no los busca.
  final bool soloComoPlato;

  /// La ilustración 3D (Fluent Emoji, MIT). Ver
  /// `tools/procesar-ilustraciones-3d.py --antojo`.
  String get ilustracion => 'assets/antojos/$clave.png';
}

/// El catálogo, EN ORDEN DE PRIORIDAD (regla 1). Cerrado a propósito: con
/// texto libre «Hamburguesas», «Burgers» y «Hamburguesería» serían tres
/// antojos distintos del mismo plato.
const List<Antojo> kAntojos = [
  Antojo(clave: 'salchipapas', nombre: 'Salchipapas', palabras: [
    'salchipapa', 'choripapa', 'salchipollo',
  ]),
  Antojo(clave: 'hamburguesas', nombre: 'Hamburguesas', palabras: [
    'hamburguesa', 'burger', 'hamburger',
  ]),
  Antojo(clave: 'perros', nombre: 'Perros', palabras: [
    'perro caliente', 'perro', 'perrito', 'hot dog', 'hotdog',
  ]),
  Antojo(clave: 'pizza', nombre: 'Pizza', palabras: [
    'pizza', 'pizzeta', 'calzone',
  ]),
  Antojo(clave: 'sushi', nombre: 'Sushi', palabras: [
    'sushi', 'maki', 'nigiri', 'sashimi', 'temaki', 'roll',
  ]),
  Antojo(clave: 'mexicana', nombre: 'Mexicana', palabras: [
    'taco', 'burrito', 'quesadilla', 'nacho', 'fajita', 'mexicana',
    'mexicano', 'enchilada',
  ]),
  Antojo(clave: 'arepas', nombre: 'Arepas', palabras: ['arepa']),
  Antojo(clave: 'empanadas', nombre: 'Empanadas', palabras: ['empanada']),
  Antojo(clave: 'sandwiches', nombre: 'Sándwiches', palabras: [
    'sandwich', 'sanduche', 'sanduchito', 'wrap', 'panini', 'sandwiche',
  ]),
  Antojo(clave: 'ensaladas', nombre: 'Ensaladas', palabras: [
    'ensalada', 'bowl',
  ]),
  Antojo(clave: 'pastas', nombre: 'Pastas', palabras: [
    'pasta', 'espagueti', 'spaghetti', 'lasana', 'fettuccine', 'fetuccini',
    'raviol', 'ravioli', 'macarron', 'canelon',
  ]),
  Antojo(clave: 'oriental', nombre: 'Oriental', palabras: [
    'arroz chino', 'arroz oriental', 'chop suey', 'wok', 'ramen', 'lumpia',
    'chaufa', 'yakimeshi', 'oriental', 'china', 'chino', 'thai', 'teriyaki',
  ]),
  Antojo(clave: 'mariscos', nombre: 'Mariscos', palabras: [
    'marisco', 'camaron', 'ceviche', 'pescado', 'mojarra', 'trucha',
    'langostino', 'salmon', 'tilapia', 'robalo', 'bagre', 'cazuela',
  ]),
  Antojo(clave: 'desayunos', nombre: 'Desayunos', palabras: [
    'desayuno', 'calentado', 'changua', 'omelette', 'omelet', 'perico',
    'huevos revueltos', 'huevos rancheros', 'huevos al gusto', 'tamal',
    'pancake', 'caldo',
  ]),
  // Pollo ANTES que asados: «Pollo asado» y «Alitas BBQ» son pollo, aunque
  // lleven «asado» y «bbq», que también son palabras de la parrilla.
  Antojo(
    clave: 'pollo',
    nombre: 'Pollo',
    soloComoPlato: true,
    palabras: [
      'pollo', 'alita', 'broaster', 'nugget', 'pechuga', 'apanado',
    ],
  ),
  Antojo(clave: 'asados', nombre: 'Asados', palabras: [
    'churrasco', 'punta de anca', 'costilla', 'bbq', 'parrilla', 'lomo',
    'carne asada', 'asado', 'picada', 'chorizo', 'solomito', 'baby beef',
    'sobrebarriga', 'morcilla', 'parrillada',
  ]),
  Antojo(clave: 'almuerzos', nombre: 'Almuerzos', palabras: [
    'almuerzo', 'corrientazo', 'ejecutivo', 'menu del dia', 'plato del dia',
    'arroz con pollo',
    'bandeja paisa', 'sancocho', 'ajiaco', 'sopa', 'mondongo', 'frijolada',
  ]),
  Antojo(clave: 'postres', nombre: 'Postres', palabras: [
    'postre', 'torta', 'brownie', 'cheesecake', 'flan', 'tiramisu', 'waffle',
    'crepe', 'cupcake', 'gelatina', 'tres leches', 'arroz con leche',
    'merengon', 'fresas con crema', 'oblea', 'brevas',
  ]),
  Antojo(clave: 'helados', nombre: 'Helados', palabras: [
    'helado', 'paleta', 'cono', 'malteada', 'sundae', 'banana split',
    'granizado', 'frappe',
  ]),
  Antojo(clave: 'cafe', nombre: 'Café', palabras: [
    'cafe', 'tinto', 'capuchino', 'cappuccino', 'latte', 'espresso',
    'mocaccino', 'chocolate caliente', 'aromatica',
  ]),
  Antojo(clave: 'panaderia', nombre: 'Panadería', palabras: [
    'pan', 'pandebono', 'pan de bono', 'croissant', 'almojabana', 'bunuelo',
    'pandeyuca', 'roscon', 'mantecada', 'achira',
  ]),
];

/// Cuántos locales tienen que ofrecer un antojo para que se enseñe (regla 4).
const int kMinLocalesPorAntojo = 2;

/// Texto comparable: minúscula, sin tildes, solo letras y números separados
/// por un espacio. «Hamburguésa  DOBLE!» → «hamburguesa doble».
String normalizarTexto(String texto) {
  const conTilde = 'áàäâãéèëêíìïîóòöôõúùüûñç';
  const sinTilde = 'aaaaaeeeeiiiiooooouuuunc';
  final b = StringBuffer();
  for (final r in texto.toLowerCase().runes) {
    final c = String.fromCharCode(r);
    final i = conTilde.indexOf(c);
    b.write(i >= 0 ? sinTilde[i] : c);
  }
  return b
      .toString()
      .replaceAll(RegExp('[^a-z0-9]+'), ' ')
      .trim();
}

final Map<String, RegExp> _patrones = {
  for (final a in kAntojos)
    a.clave: RegExp(
      // Palabra entera, con plural opcional: «taco» casa «tacos» y «perro»
      // casa «perros», pero «pan» no casa «panela» ni «pancho».
      '(^| )(${a.palabras.map(RegExp.escape).join('|')})(s|es)?( |\$)',
    ),
};

/// Palabras que, justo delante, convierten lo que sigue en un INGREDIENTE:
/// «empanada DE pollo», «arroz CON pollo», «pizza Y pollo».
const Set<String> _enlacesDeIngrediente = {
  'de', 'del', 'con', 'y', 'en', 'al', 'a', 'la', 'sin', 'extra', 'mas',
};

/// La coincidencia nombra el plato y no un ingrediente (ver
/// [Antojo.soloComoPlato]).
bool _nombraElPlato(String normalizado, Match m) {
  final antes = normalizado.substring(0, m.start).trim();
  if (antes.isEmpty) return true;
  final previa = antes.split(' ').last;
  return !_enlacesDeIngrediente.contains(previa);
}

/// El antojo de un texto ya normalizado, o null.
Antojo? _antojoDeTexto(String normalizado) {
  if (normalizado.isEmpty) return null;
  for (final a in kAntojos) {
    final patron = _patrones[a.clave]!;
    if (!a.soloComoPlato) {
      if (patron.hasMatch(normalizado)) return a;
      continue;
    }
    if (patron.allMatches(normalizado).any((m) => _nombraElPlato(normalizado, m))) {
      return a;
    }
  }
  return null;
}

/// Un combo o una promoción no dice en su nombre qué es («Combo 1»): lo dice
/// lo que trae («Hamburguesa sencilla + papas + gaseosa»).
final RegExp _esCombo =
    RegExp(r'(^| )(combo|combos|promo|promocion|oferta|paquete)( |$)');

/// El antojo de un plato (reglas 1, 2 y 3). Null si no es de ninguno.
Antojo? antojoDeProducto(ProductEntity p) {
  if (p.suggestAsAddon) return null;
  final nombre = normalizarTexto(p.name);
  return _antojoDeTexto(nombre) ??
      _antojoDeTexto(normalizarTexto(p.category)) ??
      (_esCombo.hasMatch(nombre)
          ? _antojoDeTexto(normalizarTexto(p.description))
          : null);
}

/// Los platos de un local que son de ese antojo.
List<ProductEntity> platosDelAntojo(BusinessEntity b, String clave) => [
      for (final p in b.products)
        if (antojoDeProducto(p)?.clave == clave) p,
    ];

/// Los antojos que se enseñan en la home, del más ofrecido al menos (empate:
/// el orden del catálogo, para que no bailen entre aperturas).
List<Antojo> antojosPresentes(List<BusinessEntity> comercios) {
  final locales = <String, int>{};
  for (final b in comercios) {
    final delLocal = <String>{
      for (final p in b.products)
        if (antojoDeProducto(p) case final a?) a.clave,
    };
    for (final c in delLocal) {
      locales[c] = (locales[c] ?? 0) + 1;
    }
  }
  final visibles = [
    for (final a in kAntojos)
      if ((locales[a.clave] ?? 0) >= kMinLocalesPorAntojo) a,
  ];
  visibles.sort((a, b) {
    final porLocales = locales[b.clave]!.compareTo(locales[a.clave]!);
    return porLocales != 0
        ? porLocales
        : kAntojos.indexOf(a).compareTo(kAntojos.indexOf(b));
  });
  return visibles;
}

/// Lo mínimo que hay que escribir para buscar entre platos. Con una letra
/// casa media carta y la lista de resultados no dice nada.
const int kMinLetrasBusqueda = 2;

/// Qué encontró una búsqueda en un local.
class CoincidenciaBusqueda {
  const CoincidenciaBusqueda({required this.porNombre, required this.platos});

  /// El nombre del LOCAL contiene lo buscado.
  final bool porNombre;

  /// Los platos que casan: por su nombre, sección o ingredientes, o porque lo
  /// buscado nombra su antojo («hamburguesas» trae «La Bestia»).
  final List<ProductEntity> platos;

  bool get algo => porNombre || platos.isNotEmpty;
}

/// Distancia de edición con transposición: «amburguesa» → «hamburguesa» es 1,
/// «pizaz» → «pizza» también.
int distanciaDeEdicion(String a, String b) {
  final m = a.length;
  final n = b.length;
  final d = List.generate(m + 1, (i) => List<int>.filled(n + 1, 0));
  for (var i = 0; i <= m; i++) {
    d[i][0] = i;
  }
  for (var j = 0; j <= n; j++) {
    d[0][j] = j;
  }
  for (var i = 1; i <= m; i++) {
    for (var j = 1; j <= n; j++) {
      final costo = a[i - 1] == b[j - 1] ? 0 : 1;
      var v = d[i - 1][j] + 1;
      if (d[i][j - 1] + 1 < v) v = d[i][j - 1] + 1;
      if (d[i - 1][j - 1] + costo < v) v = d[i - 1][j - 1] + costo;
      if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
        if (d[i - 2][j - 2] + 1 < v) v = d[i - 2][j - 2] + 1;
      }
      d[i][j] = v;
    }
  }
  return d[m][n];
}

/// Cuántas letras se le perdonan a una palabra buscada. Las cortas no: una
/// palabra de cinco letras a una de distancia suele ser OTRA palabra de
/// verdad («bollo» y «pollo», «pasa» y «pasta»), y entonces la búsqueda
/// enseñaría platos que nadie pidió.
int _toleranciaDe(String palabra) =>
    palabra.length >= 9 ? 2 : (palabra.length >= 6 ? 1 : 0);

/// «hamburguesas» → «hamburguesa»: el plural no cuenta como errata.
String _singular(String palabra) {
  if (palabra.length > 4 && palabra.endsWith('es')) {
    return palabra.substring(0, palabra.length - 2);
  }
  if (palabra.length > 3 && palabra.endsWith('s')) {
    return palabra.substring(0, palabra.length - 1);
  }
  return palabra;
}

/// La palabra buscada está en el texto: al PRINCIPIO de una de sus palabras
/// («hambur» casa «hamburguesa», quien escribe no ha terminado), o a una
/// errata de distancia («amburguesa»). Ya no basta con aparecer en medio de
/// otra: «pan» encontraba «empanada» y «ron» encontraba «macarrones».
bool _palabraEnTexto(String palabra, List<String> palabrasDelTexto) {
  final tope = _toleranciaDe(palabra);
  for (final w in palabrasDelTexto) {
    if (w.startsWith(palabra)) return true;
    if (tope == 0) continue;
    if ((w.length - palabra.length).abs() > tope + 1) continue;
    if (distanciaDeEdicion(_singular(palabra), _singular(w)) <= tope) return true;
  }
  return false;
}

/// Todas las palabras buscadas están en el texto.
bool _casaConsulta(List<String> buscadas, String textoNormalizado) {
  if (textoNormalizado.isEmpty) return false;
  final palabras = textoNormalizado.split(' ');
  return buscadas.every((b) => _palabraEnTexto(b, palabras));
}

/// El antojo que nombra lo buscado, aunque venga con una errata
/// («amburguesas», «piza»).
Antojo? _antojoDeConsulta(String q) {
  final exacto = _antojoDeTexto(q);
  if (exacto != null) return exacto;
  for (final palabra in q.split(' ')) {
    final tope = _toleranciaDe(palabra);
    if (tope == 0) continue;
    final buscada = _singular(palabra);
    for (final a in kAntojos) {
      for (final candidata in a.palabras) {
        // Solo hacia palabras largas del catálogo: «alita» o «taco» tienen
        // vecinas que también son palabras.
        if (candidata.contains(' ') || candidata.length < 6) continue;
        if (distanciaDeEdicion(buscada, candidata) <= tope) return a;
      }
    }
  }
  return null;
}

/// Busca `consulta` en un local. Sin tildes ni mayúsculas: «salchipapa» casa
/// «SALCHIPAPÁS». Perdona una errata («amburguesa»).
///
/// Los platos salen EN ORDEN de lo que más se parece a lo buscado: primero los
/// que SON ese antojo, luego los que lo llevan en el nombre, y al final los
/// que solo lo traen como ingrediente. Quien busca «pollo» quiere ver el pollo
/// asado antes que la empanada de pollo — pero la empanada también sale.
CoincidenciaBusqueda buscarEnComercio(BusinessEntity b, String consulta) {
  final q = normalizarTexto(consulta);
  if (q.length < kMinLetrasBusqueda) {
    return const CoincidenciaBusqueda(porNombre: false, platos: []);
  }
  final buscadas = q.split(' ');
  final antojoBuscado = _antojoDeConsulta(q);
  final conPuesto = <(int, int, ProductEntity)>[];
  var orden = 0;
  for (final p in b.products) {
    if (p.suggestAsAddon) continue;
    final esDelAntojo =
        antojoBuscado != null && antojoDeProducto(p)?.clave == antojoBuscado.clave;
    final porNombre = _casaConsulta(buscadas, normalizarTexto(p.name));
    final porLoDemas = _casaConsulta(buscadas, normalizarTexto(p.category)) ||
        _casaConsulta(buscadas, normalizarTexto(p.description));
    if (!esDelAntojo && !porNombre && !porLoDemas) continue;
    final puesto = esDelAntojo ? 0 : (porNombre ? 1 : 2);
    conPuesto.add((puesto, orden++, p));
  }
  conPuesto.sort((x, y) {
    final c = x.$1.compareTo(y.$1);
    return c != 0 ? c : x.$2.compareTo(y.$2);
  });
  return CoincidenciaBusqueda(
    porNombre: _casaConsulta(buscadas, normalizarTexto(b.name)),
    platos: [for (final e in conPuesto) e.$3],
  );
}

/// El plato más barato de una lista, para ordenar «Más barato». Null si no
/// hay ninguno (un local sin platos que comparar va al final, no al principio).
double? precioMasBajo(List<ProductEntity> platos) {
  if (platos.isEmpty) return null;
  return platos.map((p) => p.price).reduce((a, b) => a < b ? a : b);
}

/// Cómo ordenar los resultados de un antojo o una búsqueda.
enum OrdenResultados {
  recomendados('Recomendados'),
  masBarato('Más barato'),
  mejorCalificado('Mejor calificado');

  const OrdenResultados(this.etiqueta);
  final String etiqueta;
}

/// Ordena los locales con sus platos. Abiertos SIEMPRE primero: el más
/// barato de los cerrados no le sirve a quien quiere comer ahora. Un dato que
/// falta (sin calificación, sin platos) va al final, nunca al principio.
List<MapEntry<BusinessEntity, List<ProductEntity>>> ordenarResultados(
  List<MapEntry<BusinessEntity, List<ProductEntity>>> filas,
  OrdenResultados orden,
) {
  final indexada = [for (var i = 0; i < filas.length; i++) (i, filas[i])];
  int nulosAlFinal(num? a, num? b, {bool desc = false}) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return desc ? b.compareTo(a) : a.compareTo(b);
  }

  indexada.sort((x, y) {
    final a = x.$2;
    final b = y.$2;
    if (a.key.isOpen != b.key.isOpen) return a.key.isOpen ? -1 : 1;
    final c = switch (orden) {
      OrdenResultados.recomendados => 0,
      OrdenResultados.masBarato =>
        nulosAlFinal(precioMasBajo(a.value), precioMasBajo(b.value)),
      OrdenResultados.mejorCalificado =>
        nulosAlFinal(a.key.rating, b.key.rating, desc: true),
    };
    // Empate: el orden en que llegaron, para que la lista no baile.
    return c != 0 ? c : x.$1.compareTo(y.$1);
  });
  return [for (final e in indexada) e.$2];
}
