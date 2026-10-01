/// Una parada intermedia del viaje: su nombre y, cuando se eligió en el mapa,
/// su punto.
///
/// POR QUÉ LLEVA COORDENADAS. Antes aquí solo viajaba el nombre, con un
/// comentario que decía que las coordenadas «ya las usó el servidor para medir
/// y cobrar». Es cierto que las usó, y por eso mismo las manda de vuelta: sin
/// ellas esta app no puede DIBUJAR la parada, así que el pasajero veía
/// «Parada 1 · Droguería» en una lista y en el mapa no había nada. Es el mismo
/// defecto que ya se corrigió en la app del conductor.
///
/// Una parada SIN punto se conserva igual: «donde la panadería» es una parada
/// válida que el conductor entiende, y pintarla en un sitio inventado sería
/// peor que no pintarla.
class TripStopEntity {
  const TripStopEntity({required this.nombre, this.lat, this.lng});

  factory TripStopEntity.fromJson(Map<String, dynamic> j) => TripStopEntity(
        nombre: j['name']?.toString() ?? '',
        lat: (j['lat'] as num?)?.toDouble(),
        lng: (j['lng'] as num?)?.toDouble(),
      );

  final String nombre;
  final double? lat;
  final double? lng;

  /// Se puede dibujar. Exige las DOS coordenadas: con una sola, el marcador
  /// acabaría en el meridiano cero.
  bool get tienePunto => lat != null && lng != null;

  Map<String, dynamic> toJson() => {
        'name': nombre,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      };
}
