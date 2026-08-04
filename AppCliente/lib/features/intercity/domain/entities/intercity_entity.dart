import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';

// ── Ciudades disponibles ──────────────────────────────────────────────────────

/// Municipio de origen o destino.
///
/// Era un `enum` de siete valores: las empresas de transporte mueven a TODOS
/// los pueblos y el sistema solo conocía siete. Ahora la lista viene del
/// backend (`GET /geo/municipios`) y esto es una clase con la misma forma que
/// tenía el enum —`name`, `displayName`, `department`, `values`— para que el
/// resto de la app siga funcionando igual.
///
/// Los siete de siempre quedan como constantes: son el respaldo si la app
/// arranca sin red, y evitan que la pantalla se quede vacía.
class IntercityCity {
  const IntercityCity(this.name, this.displayName, this.department,
      [this.lat, this.lng]);

  /// Identificador estable ('pamplona', 'villa-del-rosario'). Es lo que viaja
  /// al backend, y se llama `name` para conservar la interfaz del enum.
  final String name;
  final String displayName;
  final String department;

  /// Centroide del municipio, para los mapas. Llega del backend junto con el
  /// nombre; `null` si el municipio vino sin coordenadas.
  final double? lat;
  final double? lng;

  ({double lat, double lng})? get coords =>
      lat == null || lng == null ? null : (lat: lat!, lng: lng!);

  static const pamplona =
      IntercityCity('pamplona', 'Pamplona', 'Norte de Santander', 7.3754, -72.6486);
  static const cucuta = IntercityCity('cucuta', 'Cúcuta', 'Norte de Santander', 7.8939, -72.5078);
  static const bucaramanga =
      IntercityCity('bucaramanga', 'Bucaramanga', 'Santander', 7.1193, -73.1227);
  static const chitaga =
      IntercityCity('chitaga', 'Chitagá', 'Norte de Santander', 7.1364, -72.6667);
  static const malaga = IntercityCity('malaga', 'Málaga', 'Santander', 6.6983, -72.7333);
  static const ocana = IntercityCity('ocana', 'Ocaña', 'Norte de Santander', 8.2375, -73.3561);
  static const bogota = IntercityCity('bogota', 'Bogotá', 'Cundinamarca', 4.711, -74.0721);

  static const _respaldo = <IntercityCity>[
    pamplona, cucuta, bucaramanga, chitaga, malaga, ocana, bogota,
  ];

  static List<IntercityCity> _todos = _respaldo;

  /// Municipios disponibles. Se reemplaza con los del backend al abrir la app.
  static List<IntercityCity> get values => _todos;

  /// Sustituye la lista con la que llega del servidor. Si llega vacía se
  /// conserva el respaldo: mejor siete municipios que ninguno.
  static void replaceAll(List<IntercityCity> nuevos) {
    if (nuevos.isNotEmpty) _todos = nuevos;
  }

  /// Busca por identificador. Si no está en la lista —una reserva vieja de un
  /// municipio desactivado— devuelve uno construido con el propio slug, para
  /// no perder el dato ni reventar la pantalla.
  static IntercityCity bySlug(String slug) {
    for (final c in _todos) {
      if (c.name == slug) return c;
    }
    for (final c in _respaldo) {
      if (c.name == slug) return c;
    }
    return IntercityCity(slug, _titulo(slug), '');
  }

  static String _titulo(String slug) => slug
      .split('-')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');

  IconData get icon =>
      name == 'bogota' ? Icons.location_city_rounded : Icons.place_rounded;

  // Igualdad por identificador: los desplegables comparan valores, y dos
  // instancias del mismo municipio deben ser la misma opción.
  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is IntercityCity && other.name == name);

  @override
  int get hashCode => name.hashCode;

  @override
  String toString() => displayName;
}

// ── Rutas con datos reales ────────────────────────────────────────────────────

class IntercityRoute {
  const IntercityRoute({
    required this.origin,
    required this.destination,
    required this.distanceKm,
    required this.durationMinutes,
    required this.farePerSeat,
    required this.fleetFare,
    this.requiresLicensedOperator = false,
    this.isEstimated = false,
  });

  final IntercityCity origin;
  final IntercityCity destination;
  final double distanceKm;
  final int durationMinutes;
  final double farePerSeat;
  final double fleetFare;

  /// Trunk route that legally needs a habilitated operator (Option B).
  final bool requiresLicensedOperator;

  /// True when the route was synthesised from city coordinates (no explicit row).
  final bool isEstimated;

  String get durationLabel {
    final h = durationMinutes ~/ 60;
    final m = durationMinutes % 60;
    if (h == 0) return '${m}min';
    if (m == 0) return '${h}h';
    return '${h}h ${m}min';
  }

  String get fareLabel => CurrencyFormatter.format(farePerSeat);
  String get fleetLabel => CurrencyFormatter.format(fleetFare);

  /// Resolves the route between any two supported municipalities. Returns an
  /// explicit row when available, otherwise a coordinate-based estimate so the
  /// client can always quote and request the trip. Mirrors the backend's
  /// `getIntercityRoute` synthesis.
  static IntercityRoute? between(IntercityCity a, IntercityCity b) {
    if (a == b) return null;
    for (final r in _routes) {
      if ((r.origin == a && r.destination == b) ||
          (r.origin == b && r.destination == a)) {
        return r.origin == a
            ? r
            : IntercityRoute(
                origin: b,
                destination: a,
                distanceKm: r.distanceKm,
                durationMinutes: r.durationMinutes,
                farePerSeat: r.farePerSeat,
                fleetFare: r.fleetFare,
                requiresLicensedOperator: r.requiresLicensedOperator,
              );
      }
    }
    return _synthesize(a, b);
  }

  // ── Coordinate-based fallback (parity with backend) ──────────────────────────

  /// Centroide del municipio para el mapa de seguimiento.
  ///
  /// Antes era un `Map` constante con los siete de siempre y se leía con `!`:
  /// desde que los municipios vienen del backend, ese mapa dejó de compilar
  /// (una clase con `==` propio no puede ser clave constante) y el `!` habría
  /// reventado con cualquier municipio nuevo. Ahora cada municipio trae sus
  /// coordenadas y esto solo las devuelve.
  static ({double lat, double lng})? coordsOf(IntercityCity c) =>
      c.coords ?? IntercityCity.bySlug(c.name).coords;

  static const double _roadFactor = 1.4;
  static const double _avgSpeedKmh = 55;
  static const double _farePerKm = 220;
  static const double _trunkDistanceKm = 150;

  static double _haversineKm(
    ({double lat, double lng}) a,
    ({double lat, double lng}) b,
  ) {
    const r = 6371.0;
    final dLat = (b.lat - a.lat) * math.pi / 180;
    final dLng = (b.lng - a.lng) * math.pi / 180;
    final lat1 = a.lat * math.pi / 180;
    final lat2 = b.lat * math.pi / 180;
    final h = math.pow(math.sin(dLat / 2), 2) +
        math.pow(math.sin(dLng / 2), 2) * math.cos(lat1) * math.cos(lat2);
    return 2 * r * math.asin(math.sqrt(h));
  }

  static IntercityRoute _synthesize(IntercityCity a, IntercityCity b) {
    // Coordenadas del propio municipio (las trae `/geo/municipios`). Si alguna
    // falta no se puede estimar distancia: se devuelve una ruta en cero y la
    // pantalla muestra la tarifa que escriba el pasajero, en vez de reventar.
    final ca = coordsOf(a);
    final cb = coordsOf(b);
    if (ca == null || cb == null) {
      return IntercityRoute(
        origin: a,
        destination: b,
        distanceKm: 0,
        durationMinutes: 0,
        farePerSeat: 0,
        fleetFare: 0,
        isEstimated: true,
      );
    }
    final straight = _haversineKm(ca, cb);
    final distanceKm = math.max(10, (straight * _roadFactor / 5).round() * 5);
    final durationMinutes = (distanceKm / _avgSpeedKmh * 60).round();
    final farePerSeat = (distanceKm * _farePerKm / 1000).round() * 1000;
    return IntercityRoute(
      origin: a,
      destination: b,
      distanceKm: distanceKm.toDouble(),
      durationMinutes: durationMinutes,
      farePerSeat: farePerSeat.toDouble(),
      fleetFare: (farePerSeat * 3).toDouble(),
      requiresLicensedOperator: distanceKm >= _trunkDistanceKm,
      isEstimated: true,
    );
  }

  static const List<IntercityRoute> _routes = [
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.cucuta,
      distanceKm: 95,
      durationMinutes: 120,
      farePerSeat: 22000,
      fleetFare: 70000,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.bucaramanga,
      distanceKm: 200,
      durationMinutes: 240,
      farePerSeat: 42000,
      fleetFare: 130000,
      requiresLicensedOperator: true,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.chitaga,
      distanceKm: 45,
      durationMinutes: 60,
      farePerSeat: 10000,
      fleetFare: 35000,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.malaga,
      distanceKm: 80,
      durationMinutes: 105,
      farePerSeat: 18000,
      fleetFare: 58000,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.ocana,
      distanceKm: 120,
      durationMinutes: 150,
      farePerSeat: 28000,
      fleetFare: 90000,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.bogota,
      distanceKm: 500,
      durationMinutes: 540,
      farePerSeat: 90000,
      fleetFare: 280000,
      requiresLicensedOperator: true,
    ),
    IntercityRoute(
      origin: IntercityCity.cucuta,
      destination: IntercityCity.bucaramanga,
      distanceKm: 200,
      durationMinutes: 240,
      farePerSeat: 42000,
      fleetFare: 130000,
      requiresLicensedOperator: true,
    ),
    IntercityRoute(
      origin: IntercityCity.chitaga,
      destination: IntercityCity.cucuta,
      distanceKm: 140,
      durationMinutes: 170,
      farePerSeat: 30000,
      fleetFare: 95000,
    ),
    IntercityRoute(
      origin: IntercityCity.malaga,
      destination: IntercityCity.bucaramanga,
      distanceKm: 130,
      durationMinutes: 160,
      farePerSeat: 28000,
      fleetFare: 88000,
      requiresLicensedOperator: true,
    ),
  ];
}

// ── Estado de la solicitud ────────────────────────────────────────────────────

enum IntercityStatus {
  searching,
  driverFound,
  confirmed,
  /// El conductor salió hacia el punto de recogida.
  driverToPickup,
  /// El conductor ya está esperando en el punto.
  atPickup,
  inProgress,
  completed,
  cancelled;

  String get label => switch (this) {
        IntercityStatus.searching => 'Buscando conductor...',
        IntercityStatus.driverFound => 'Conductor disponible',
        IntercityStatus.confirmed => 'Viaje confirmado',
        IntercityStatus.driverToPickup => 'Tu conductor va en camino',
        IntercityStatus.atPickup => 'Tu conductor ya llegó',
        IntercityStatus.inProgress => 'En camino a tu destino',
        IntercityStatus.completed => 'Completado',
        IntercityStatus.cancelled => 'Cancelado',
      };

  Color get color => switch (this) {
        IntercityStatus.searching => AppColors.warning,
        IntercityStatus.driverFound => AppColors.info,
        IntercityStatus.confirmed => AppColors.primary,
        IntercityStatus.driverToPickup => AppColors.info,
        IntercityStatus.atPickup => AppColors.warning,
        IntercityStatus.inProgress => AppColors.secondary,
        IntercityStatus.completed => AppColors.success,
        IntercityStatus.cancelled => AppColors.error,
      };

  bool get isActive =>
      this != IntercityStatus.completed &&
      this != IntercityStatus.cancelled;

  bool get canCancel =>
      this == IntercityStatus.searching ||
      this == IntercityStatus.driverFound;
}

// ── Número de asientos ────────────────────────────────────────────────────────

enum IntercitySeats {
  one,
  two,
  three,
  fleet;

  int get count => switch (this) {
        IntercitySeats.one => 1,
        IntercitySeats.two => 2,
        IntercitySeats.three => 3,
        IntercitySeats.fleet => 4,
      };

  String get label => switch (this) {
        IntercitySeats.one => '1 persona',
        IntercitySeats.two => '2 personas',
        IntercitySeats.three => '3 personas',
        IntercitySeats.fleet => 'Flete completo',
      };

  bool get isFleet => this == IntercitySeats.fleet;
}

// ── Entidad principal ─────────────────────────────────────────────────────────

class IntercityRequestEntity {
  const IntercityRequestEntity({
    required this.id,
    required this.origin,
    required this.destination,
    required this.departureTime,
    required this.seats,
    required this.offeredFare,
    required this.status,
    required this.createdAt,
    this.notes,
    this.pickupAddress,
    this.dropoffAddress,
    this.driverName,
    this.driverPhone,
    this.driverVehicle,
    this.driverVehicleType,
    this.stops = const [],
    this.driverRating,
    this.counterFare,
    this.myRating,
    this.driverLat,
    this.driverLng,
  });

  /// Parses the backend `IntercityBookingDTO` JSON shape.
  factory IntercityRequestEntity.fromApi(Map<String, dynamic> json) {
    // bySlug nunca falla: si el municipio no está en la lista cargada, lo
    // construye con su propio identificador en vez de perder el dato.
    IntercityCity city(String? raw, IntercityCity fallback) =>
        raw == null || raw.isEmpty ? fallback : IntercityCity.bySlug(raw);

    final seatsRaw = json['seats'] as String?;
    final seats = IntercitySeats.values.firstWhere(
      (s) => s.name == seatsRaw,
      orElse: () => IntercitySeats.one,
    );
    final status = switch (json['status'] as String?) {
      'driver_found' => IntercityStatus.driverFound,
      'confirmed' => IntercityStatus.confirmed,
      'driver_to_pickup' => IntercityStatus.driverToPickup,
      'at_pickup' => IntercityStatus.atPickup,
      'in_progress' => IntercityStatus.inProgress,
      'completed' => IntercityStatus.completed,
      'cancelled' => IntercityStatus.cancelled,
      _ => IntercityStatus.searching,
    };
    return IntercityRequestEntity(
      id: json['id'] as String? ?? '',
      origin: city(json['origin'] as String?, IntercityCity.pamplona),
      destination: city(json['destination'] as String?, IntercityCity.cucuta),
      departureTime:
          DateTime.tryParse(json['departureTime'] as String? ?? '') ??
              DateTime.now(),
      seats: seats,
      offeredFare: (json['offeredFare'] as num?)?.toDouble() ?? 0,
      status: status,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      notes: json['notes'] as String?,
      pickupAddress: json['pickupAddress'] as String?,
      dropoffAddress: json['dropoffAddress'] as String?,
      driverName: json['driverName'] as String?,
      driverPhone: json['maskedPhone'] as String?,
      driverVehicle: json['driverVehicle'] as String?,
      driverVehicleType: json['driverVehicleType'] as String?,
      stops: [
        for (final st in (json['stops'] as List<dynamic>? ?? const []))
          if (st is Map<String, dynamic> && st['name'] is String)
            st['name'] as String,
      ],
      counterFare: (json['counterFare'] as num?)?.toDouble(),
      myRating: json['rating'] as int?,
      driverLat: (json['driverLat'] as num?)?.toDouble(),
      driverLng: (json['driverLng'] as num?)?.toDouble(),
    );
  }

  final String id;
  final IntercityCity origin;
  final IntercityCity destination;
  final DateTime departureTime;
  final IntercitySeats seats;
  final double offeredFare;
  final IntercityStatus status;
  final DateTime createdAt;
  final String? notes;
  final String? pickupAddress;
  final String? dropoffAddress;
  final String? driverName;
  final String? driverPhone;
  final String? driverVehicle;

  /// Tipo REAL del vehículo asignado — decide el ícono del mapa.
  final String? driverVehicleType;

  /// Paradas intermedias del trayecto ("pasa por"), en orden.
  final List<String> stops;
  final double? driverRating;
  final double? counterFare;

  /// Calificación (1-5) que el pasajero le dio al viaje completado.
  final int? myRating;

  /// Posición EN VIVO del conductor asignado (heartbeat GPS del backend);
  /// solo llega con el viaje confirmado o en curso — alimenta el mapa.
  final double? driverLat;
  final double? driverLng;

  bool get hasDriver => driverName != null;
  bool get isActive => status.isActive;
  bool get isCompleted => status == IntercityStatus.completed;
  bool get canRate => isCompleted && myRating == null;

  IntercityRequestEntity copyWith({
    String? id,
    IntercityCity? origin,
    IntercityCity? destination,
    DateTime? departureTime,
    IntercitySeats? seats,
    double? offeredFare,
    IntercityStatus? status,
    DateTime? createdAt,
    String? notes,
    String? pickupAddress,
    String? dropoffAddress,
    String? driverName,
    String? driverPhone,
    String? driverVehicle,
    String? driverVehicleType,
    List<String>? stops,
    double? driverRating,
    double? counterFare,
    int? myRating,
    double? driverLat,
    double? driverLng,
  }) =>
      IntercityRequestEntity(
        id: id ?? this.id,
        origin: origin ?? this.origin,
        destination: destination ?? this.destination,
        departureTime: departureTime ?? this.departureTime,
        seats: seats ?? this.seats,
        offeredFare: offeredFare ?? this.offeredFare,
        status: status ?? this.status,
        createdAt: createdAt ?? this.createdAt,
        notes: notes ?? this.notes,
        pickupAddress: pickupAddress ?? this.pickupAddress,
        dropoffAddress: dropoffAddress ?? this.dropoffAddress,
        driverName: driverName ?? this.driverName,
        driverPhone: driverPhone ?? this.driverPhone,
        driverVehicle: driverVehicle ?? this.driverVehicle,
        driverVehicleType: driverVehicleType ?? this.driverVehicleType,
        stops: stops ?? this.stops,
        driverRating: driverRating ?? this.driverRating,
        counterFare: counterFare ?? this.counterFare,
        myRating: myRating ?? this.myRating,
        driverLat: driverLat ?? this.driverLat,
        driverLng: driverLng ?? this.driverLng,
      );
}
