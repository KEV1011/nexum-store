import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Punto de recogida que llegó de fuera de la app y que la pantalla de pedir
/// debe estrenar puesto.
///
/// Hoy lo siembra una sola cosa: el botón de ubicación de WhatsApp. El pasajero
/// lo toca en el chat, nosotros guardamos el punto junto al enlace y al entrar
/// se le pinta la recogida sin que escriba nada — que es la parte del formulario
/// que más gente abandona.
class OrigenSugerido {
  const OrigenSugerido({required this.lat, required this.lng, this.etiqueta});

  final double lat;
  final double lng;

  /// Nombre del sitio o dirección, si el canal la mandó. Suele faltar, y
  /// entonces la pantalla pone un texto genérico en vez de inventarse una
  /// dirección que no sabe.
  final String? etiqueta;

  /// Lo lee del canje del enlace, o devuelve null.
  ///
  /// Sin casteos directos a propósito: un backend anterior al botón de
  /// ubicación no manda el campo, y un `as double` sobre lo que falta tumbaría
  /// la entrada ENTERA — o sea que el pasajero no podría ni entrar a la app por
  /// culpa de un dato opcional. Un punto a medias (solo latitud) tampoco sirve:
  /// media coordenada no es un sitio.
  static OrigenSugerido? fromJson(Object? crudo) {
    if (crudo is! Map) return null;
    final lat = (crudo['lat'] as num?)?.toDouble();
    final lng = (crudo['lng'] as num?)?.toDouble();
    if (lat == null || lng == null) return null;

    // (0, 0) es el Golfo de Guinea, o sea «falta el dato». El backend ya lo
    // descarta al leer el webhook; aquí se repite porque esta clase decide qué
    // punto se le pinta al pasajero y no debe fiarse de que nadie más mire.
    if (lat == 0 && lng == 0) return null;

    final etiqueta = (crudo['etiqueta'] as String?)?.trim();
    return OrigenSugerido(
      lat: lat,
      lng: lng,
      etiqueta: (etiqueta == null || etiqueta.isEmpty) ? null : etiqueta,
    );
  }
}

/// Vive en memoria a propósito.
///
/// Si se guardara en disco, alguien que entró ayer por WhatsApp abriría la app
/// hoy con la recogida de ayer puesta — y un punto de partida equivocado que
/// parece correcto es peor que no tener ninguno. Se consume una vez y se borra.
final origenSugeridoProvider = StateProvider<OrigenSugerido?>((ref) => null);
