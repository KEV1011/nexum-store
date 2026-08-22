import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';

/// Una categoría que el pasajero puede pedir, tal como la cotizó el servidor.
///
/// El precio NO se calcula aquí. Antes cada servicio tenía su fórmula escrita
/// en Dart (`TransportServiceType.estimateFare`), así que el número dependía de
/// la versión de la app instalada y no coincidía con lo que se cobraba al
/// final. Ahora la app solo muestra lo que el servidor cotizó.
class TripOptionEntity {
  const TripOptionEntity({
    required this.categoria,
    required this.nombre,
    required this.descripcion,
    required this.capacidad,
    required this.fare,
    required this.baseFare,
    required this.surgeMultiplier,
    required this.regulada,
    required this.etaMinutes,
    required this.availableNearby,
    required this.disponible,
    required this.cheapest,
  });

  /// 'TAXI' | 'PARTICULAR' | 'MOTO'
  final String categoria;
  final String nombre;
  final String descripcion;
  final int capacidad;
  final int fare;
  final int baseFare;
  final double surgeMultiplier;

  /// La tarifa la fija el decreto municipal, no la plataforma.
  final bool regulada;

  /// Minutos hasta la recogida. Null = no hay ningún vehículo de este tipo
  /// cerca; no se inventa un número.
  final int? etaMinutes;
  final int availableNearby;
  final bool disponible;
  final bool cheapest;

  bool get conRecargo => surgeMultiplier > 1.0;

  /// El servicio con el que se guarda esta categoría en la app.
  ///
  /// El enum de la app solo tiene tres valores y no distingue taxi de
  /// particular: los dos son `transporte`. La categoría real viaja aparte
  /// (`request(categoria: ...)`), que es lo que hace que un taxi se registre y
  /// se tarife como taxi.
  TransportServiceType get serviceType => categoria == 'MOTO'
      ? TransportServiceType.moto
      : TransportServiceType.transporte;

  factory TripOptionEntity.fromJson(Map<String, dynamic> j) => TripOptionEntity(
        categoria: j['categoria'] as String? ?? 'TAXI',
        nombre: j['nombre'] as String? ?? 'Viaje',
        descripcion: j['descripcion'] as String? ?? '',
        capacidad: (j['capacidad'] as num?)?.toInt() ?? 4,
        fare: (j['fare'] as num?)?.toInt() ?? 0,
        baseFare: (j['baseFare'] as num?)?.toInt() ?? 0,
        surgeMultiplier: (j['surgeMultiplier'] as num?)?.toDouble() ?? 1.0,
        regulada: j['regulada'] as bool? ?? false,
        etaMinutes: (j['etaMinutes'] as num?)?.toInt(),
        availableNearby: (j['availableNearby'] as num?)?.toInt() ?? 0,
        disponible: j['disponible'] as bool? ?? false,
        cheapest: j['cheapest'] as bool? ?? false,
      );
}

/// Las categorías de un trayecto concreto, con la distancia que las cotizó.
class TripOptionsEntity {
  const TripOptionsEntity({
    required this.distanceKm,
    required this.durationMinutes,
    required this.rutaReal,
    required this.opciones,
  });

  final double distanceKm;
  final int durationMinutes;

  /// Falso = la distancia se estimó en línea recta porque no hubo ruta real.
  /// Se dice en la pantalla en vez de presentar el precio como definitivo.
  final bool rutaReal;

  final List<TripOptionEntity> opciones;

  List<TripOptionEntity> get disponibles =>
      opciones.where((o) => o.disponible).toList();

  factory TripOptionsEntity.fromJson(Map<String, dynamic> j) =>
      TripOptionsEntity(
        distanceKm: (j['distanceKm'] as num?)?.toDouble() ?? 0,
        durationMinutes: (j['durationMinutes'] as num?)?.toInt() ?? 0,
        rutaReal: j['rutaReal'] as bool? ?? false,
        opciones: (j['opciones'] as List<dynamic>? ?? const [])
            .map((e) => TripOptionEntity.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
