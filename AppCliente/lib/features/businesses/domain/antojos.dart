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
  });

  /// Identificador estable: también es el nombre de su ilustración.
  final String clave;

  /// Cómo se ve en la tarjeta («Hamburguesas»).
  final String nombre;

  /// Palabras normalizadas (sin tildes, minúscula) que lo delatan. Casan como
  /// palabra entera, con o sin plural («taco» casa «tacos»).
  final List<String> palabras;

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
  Antojo(clave: 'asados', nombre: 'Asados', palabras: [
    'churrasco', 'punta de anca', 'costilla', 'bbq', 'parrilla', 'lomo',
    'carne asada', 'asado', 'picada', 'chorizo', 'solomito', 'baby beef',
    'sobrebarriga', 'morcilla', 'parrillada',
  ]),
  Antojo(clave: 'pollo', nombre: 'Pollo', palabras: [
    'pollo', 'alita', 'broaster', 'nugget', 'pechuga', 'apanado',
  ]),
  Antojo(clave: 'almuerzos', nombre: 'Almuerzos', palabras: [
    'almuerzo', 'corrientazo', 'ejecutivo', 'menu del dia', 'plato del dia',
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

/// El antojo de un texto ya normalizado, o null.
Antojo? _antojoDeTexto(String normalizado) {
  if (normalizado.isEmpty) return null;
  for (final a in kAntojos) {
    if (_patrones[a.clave]!.hasMatch(normalizado)) return a;
  }
  return null;
}

/// El antojo de un plato (reglas 1, 2 y 3). Null si no es de ninguno.
Antojo? antojoDeProducto(ProductEntity p) {
  if (p.suggestAsAddon) return null;
  return _antojoDeTexto(normalizarTexto(p.name)) ??
      _antojoDeTexto(normalizarTexto(p.category));
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

/// Busca `consulta` en un local. Sin tildes ni mayúsculas: «salchipapa» casa
/// «SALCHIPAPÁS».
CoincidenciaBusqueda buscarEnComercio(BusinessEntity b, String consulta) {
  final q = normalizarTexto(consulta);
  if (q.length < kMinLetrasBusqueda) {
    return const CoincidenciaBusqueda(porNombre: false, platos: []);
  }
  final antojoBuscado = _antojoDeTexto(q);
  return CoincidenciaBusqueda(
    porNombre: normalizarTexto(b.name).contains(q),
    platos: [
      for (final p in b.products)
        if (!p.suggestAsAddon &&
            (normalizarTexto(p.name).contains(q) ||
                normalizarTexto(p.category).contains(q) ||
                normalizarTexto(p.description).contains(q) ||
                (antojoBuscado != null &&
                    antojoDeProducto(p)?.clave == antojoBuscado.clave)))
          p,
    ],
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
