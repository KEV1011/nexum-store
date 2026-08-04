import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';

/// Municipio de origen o destino de un viaje compartido/intermunicipal.
///
/// Era un `enum` de siete valores: las empresas mueven a TODOS los pueblos y
/// la app del conductor solo conocía siete, así que una oferta desde cualquier
/// otro municipio se mostraba como «Pamplona» (el `orElse` del `fromApi`) y el
/// conductor aceptaba creyendo otra ruta. Ahora la lista viene del backend
/// (`GET /geo/municipios`) y esto es una clase con la misma forma que tenía el
/// enum —`name`, `displayName`, `values`— para no tocar el resto de la app.
class PooledCity {
  const PooledCity(this.name, this.displayName, [this._lat, this._lng]);

  /// Identificador estable ('pamplona', 'villa-del-rosario'). Es lo que viaja
  /// al backend; se llama `name` para conservar la interfaz del enum.
  final String name;
  final String displayName;
  final double? _lat;
  final double? _lng;

  static const pamplona = PooledCity('pamplona', 'Pamplona', 7.3754, -72.6486);
  static const cucuta = PooledCity('cucuta', 'Cúcuta', 7.8939, -72.5078);
  static const bucaramanga =
      PooledCity('bucaramanga', 'Bucaramanga', 7.1193, -73.1227);
  static const chitaga = PooledCity('chitaga', 'Chitagá', 7.1364, -72.6667);
  static const malaga = PooledCity('malaga', 'Málaga', 6.6983, -72.7333);
  static const ocana = PooledCity('ocana', 'Ocaña', 8.2375, -73.3561);
  static const bogota = PooledCity('bogota', 'Bogotá', 4.7110, -74.0721);

  static const _respaldo = <PooledCity>[
    pamplona, cucuta, bucaramanga, chitaga, malaga, ocana, bogota,
  ];

  static List<PooledCity> _todos = _respaldo;

  /// Municipios disponibles. Se reemplaza con los del backend al abrir la app.
  static List<PooledCity> get values => _todos;

  /// Sustituye la lista con la que llega del servidor. Vacía = se conserva el
  /// respaldo: mejor siete municipios que un desplegable en blanco.
  static void replaceAll(List<PooledCity> nuevos) {
    if (nuevos.isNotEmpty) _todos = nuevos;
  }

  /// Municipio por identificador. Si no está en la lista —una salida vieja de
  /// un municipio desactivado— se construye con el propio slug en vez de
  /// mentir con Pamplona.
  static PooledCity fromApi(String? s) {
    if (s == null || s.isEmpty) return pamplona;
    for (final c in _todos) {
      if (c.name == s) return c;
    }
    for (final c in _respaldo) {
      if (c.name == s) return c;
    }
    return PooledCity(s, _titulo(s));
  }

  static String _titulo(String slug) => slug
      .split('-')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');

  /// Centroide municipal para pintar la ruta en el mapa. `null` cuando el
  /// municipio llegó sin coordenadas: la pantalla omite el mapa en vez de
  /// dibujar un trayecto inventado.
  ({double lat, double lng})? get coords =>
      _lat == null || _lng == null ? null : (lat: _lat, lng: _lng);

  // Igualdad por identificador: los desplegables comparan valores.
  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is PooledCity && other.name == name);

  @override
  int get hashCode => name.hashCode;

  @override
  String toString() => displayName;
}

enum PooledTripStatus {
  open,
  full,
  departed,
  completed,
  cancelled;

  static PooledTripStatus fromApi(String? s) => switch (s) {
        'open' => PooledTripStatus.open,
        'full' => PooledTripStatus.full,
        'departed' => PooledTripStatus.departed,
        'completed' => PooledTripStatus.completed,
        'cancelled' => PooledTripStatus.cancelled,
        _ => PooledTripStatus.open,
      };

  String get label => switch (this) {
        PooledTripStatus.open => 'Abierto',
        PooledTripStatus.full => 'Completo',
        PooledTripStatus.departed => 'En camino',
        PooledTripStatus.completed => 'Finalizado',
        PooledTripStatus.cancelled => 'Cancelado',
      };

  Color get color => switch (this) {
        PooledTripStatus.open => AppColors.success,
        PooledTripStatus.full => AppColors.warning,
        PooledTripStatus.departed => AppColors.secondary,
        PooledTripStatus.completed => AppColors.info,
        PooledTripStatus.cancelled => AppColors.error,
      };

  bool get isLive =>
      this == PooledTripStatus.open || this == PooledTripStatus.full;
}

class PooledSeatBooking {
  const PooledSeatBooking({
    required this.id,
    required this.passengerName,
    required this.passengerPhone,
    required this.seatsBooked,
    this.pickupAddress,
    this.notes,
  });

  final String id;
  final String passengerName;
  final String passengerPhone;
  final int seatsBooked;
  final String? pickupAddress;
  final String? notes;

  factory PooledSeatBooking.fromJson(Map<String, dynamic> j) => PooledSeatBooking(
        id: j['id'] as String? ?? '',
        passengerName: j['passengerName'] as String? ?? '',
        passengerPhone: j['passengerPhone'] as String? ?? '',
        seatsBooked: (j['seatsBooked'] as num?)?.toInt() ?? 1,
        pickupAddress: j['pickupAddress'] as String?,
        notes: j['notes'] as String?,
      );
}

class PooledTripEntity {
  const PooledTripEntity({
    required this.id,
    required this.tripRef,
    required this.origin,
    required this.destination,
    required this.departureTime,
    required this.totalSeats,
    required this.availableSeats,
    required this.farePerSeat,
    required this.maxFarePerSeat,
    required this.allowFleet,
    required this.status,
    required this.vehicleDescription,
    this.notes,
    this.stops = const [],
    this.distanceKm,
    this.durationMinutes,
    this.bookings = const [],
  });

  final String id;
  final String tripRef;
  final PooledCity origin;
  final PooledCity destination;
  final DateTime departureTime;
  final int totalSeats;
  final int availableSeats;
  final double farePerSeat;
  final double maxFarePerSeat;
  final bool allowFleet;
  final PooledTripStatus status;
  final String vehicleDescription;
  final String? notes;

  /// Paradas intermedias de la salida ("pasa por"), en orden.
  final List<String> stops;
  final double? distanceKm;
  final int? durationMinutes;
  final List<PooledSeatBooking> bookings;

  int get bookedSeats => totalSeats - availableSeats;

  factory PooledTripEntity.fromJson(Map<String, dynamic> j) => PooledTripEntity(
        id: j['id'] as String? ?? '',
        tripRef: j['tripRef'] as String? ?? '',
        origin: PooledCity.fromApi(j['origin'] as String?),
        destination: PooledCity.fromApi(j['destination'] as String?),
        departureTime:
            DateTime.tryParse(j['departureTime'] as String? ?? '') ?? DateTime.now(),
        totalSeats: (j['totalSeats'] as num?)?.toInt() ?? 0,
        availableSeats: (j['availableSeats'] as num?)?.toInt() ?? 0,
        farePerSeat: (j['farePerSeat'] as num?)?.toDouble() ?? 0,
        maxFarePerSeat: (j['maxFarePerSeat'] as num?)?.toDouble() ?? 0,
        allowFleet: j['allowFleet'] as bool? ?? false,
        status: PooledTripStatus.fromApi(j['status'] as String?),
        vehicleDescription: j['vehicleDescription'] as String? ?? '',
        notes: j['notes'] as String?,
        stops: [
          for (final st in (j['stops'] as List<dynamic>? ?? const []))
            if (st is Map<String, dynamic> && st['name'] is String)
              st['name'] as String,
        ],
        distanceKm: (j['distanceKm'] as num?)?.toDouble(),
        durationMinutes: (j['durationMinutes'] as num?)?.toInt(),
        bookings: (j['bookings'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(PooledSeatBooking.fromJson)
            .toList(),
      );
}
