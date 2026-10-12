/// Convertir una lista que llega de fuera, ELEMENTO A ELEMENTO.
///
/// Es el defecto que más veces ha aparecido en este repositorio, siempre con
/// la misma forma: `(data as List).map(Algo.fromJson).toList()`. Un solo
/// elemento que el parseador no pueda leer hace lanzar al `map`, y entonces no
/// se pierde ese elemento — se pierde la lista completa, y con ella la
/// pantalla. Ha pasado con el historial de pedidos, con la caché de viajes,
/// con las ganancias del conductor y con el catálogo de comercios.
///
/// Y el disparador realista no es un servidor roto: es que el dato venga de
/// una versión anterior de la app o del servidor, o que el parseador pase a
/// exigir un campo que antes no existía.
///
/// Lo que NO hace, a propósito: no avisa. Quien llama decide si un hueco
/// importa; en una lista de veinte pedidos, perder uno es mucho mejor que
/// perder los veinte, y es la única decisión que esta función toma.
library;

/// Lee [raw] como lista de objetos JSON y convierte cada uno con [parse].
///
/// Lo que no sea una lista devuelve vacío; el elemento que no sea un objeto,
/// o que [parse] no pueda leer, se descarta SOLO ÉL.
List<T> listaDeJson<T>(Object? raw, T Function(Map<String, dynamic>) parse) {
  if (raw is! List) return <T>[];
  final salida = <T>[];
  for (final e in raw) {
    if (e is! Map<String, dynamic>) continue;
    try {
      salida.add(parse(e));
    } catch (_) {
      // Ese elemento no se puede leer; los demás sí.
    }
  }
  return salida;
}
