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

/// «Terminal de Transportes · 06:00», listo para leer de un vistazo.
///
/// Sin casteos directos: esto se pinta en la lista del conductor y reventar
/// aquí lo dejaría sin ver a ninguno de sus pasajeros.
String? _puntoLegible(Object? crudo) {
  if (crudo is! Map) return null;
  final nombre = crudo['name'];
  final hora = crudo['time'];
  if (nombre is! String) return null;
  return hora is String ? '$nombre · $hora' : nombre;
}

class PooledSeatBooking {
  const PooledSeatBooking({
    required this.id,
    required this.passengerName,
    required this.passengerPhone,
    required this.seatsBooked,
    this.pickupAddress,
    this.notes,
    this.seats = const [],
    this.boardingPoint,
    this.amountToPay,
    this.discount = 0,
    this.promoCode,
    this.passengers = const [],
    this.pickupLat,
    this.pickupLng,
    this.paymentLabel,
    this.passengerRating,
  });

  final String id;
  final String passengerName;
  final String passengerPhone;
  final int seatsBooked;
  final String? pickupAddress;
  final String? notes;

  /// Dónde sube, cuando la empresa publicó puntos de embarque: «Terminal ·
  /// 06:00». Con dirección en vez de punto, la recogida es a domicilio.
  final String? boardingPoint;

  /// Lo que hay que COBRARLE, con el descuento de la empresa ya restado. Sin
  /// esto el conductor pediría la tarifa completa a quien usó un código de la
  /// propia empresa, y la discusión sería en la puerta del vehículo.
  final double? amountToPay;
  final double discount;
  final String? promoCode;

  /// Quién viaja en cada silla, con su documento: la planilla. Vacía en las
  /// reservas anteriores al campo, y la pantalla lo DICE en vez de repetir el
  /// nombre de la cuenta tantas veces como puestos.
  final List<String> passengers;

  /// Sillas numeradas de esta reserva, en orden. Vacía en las salidas por
  /// cupos, que son las de siempre: ahí no hay dónde sentar a nadie en
  /// concreto y lo único cierto es cuántos puestos compró.
  final List<int> seats;

  /// Dónde recogerlo en el mapa (viaje por puestos urbano). Los dos o ninguno:
  /// sin punto no se ofrece navegar, en vez de mandar al conductor a un sitio
  /// inventado.
  final double? pickupLat;
  final double? pickupLng;
  bool get tienePunto => pickupLat != null && pickupLng != null;

  /// Cómo va a pagar, ya redactado por el servidor («Nequi», «Pago no
  /// indicado»): si lo tradujera la app, una versión diría otra cosa.
  final String? paymentLabel;

  /// La nota que el conductor ya le puso, si se la puso.
  final int? passengerRating;

  /// Lo que el conductor necesita leer en la puerta del vehículo: «Silla 3» o
  /// «Sillas 3, 4». Sin numeración cae a los puestos, que es la información
  /// que de verdad hay — inventar un número aquí sentaría a alguien donde no
  /// le corresponde.
  String get seatLabel => seats.isEmpty
      ? '$seatsBooked puesto${seatsBooked == 1 ? '' : 's'}'
      : '${seats.length == 1 ? 'Silla' : 'Sillas'} ${seats.join(', ')}';

  factory PooledSeatBooking.fromJson(Map<String, dynamic> j) => PooledSeatBooking(
        id: j['id'] as String? ?? '',
        passengerName: j['passengerName'] as String? ?? '',
        passengerPhone: j['passengerPhone'] as String? ?? '',
        seatsBooked: (j['seatsBooked'] as num?)?.toInt() ?? 1,
        pickupAddress: j['pickupAddress'] as String?,
        notes: j['notes'] as String?,
        boardingPoint: _puntoLegible(j['boardingPoint']),
        amountToPay: (j['amountToPay'] as num?)?.toDouble(),
        discount: (j['discount'] as num?)?.toDouble() ?? 0,
        promoCode: j['promoCode'] as String?,
        passengers: [
          for (final p in (j['passengers'] as List<dynamic>? ?? const []))
            if (p is Map<String, dynamic>)
              '${p['tipoDoc'] ?? ''} ${p['documento'] ?? ''} · ${p['nombre'] ?? ''}'.trim(),
        ],
        seats: [
          for (final s in (j['seats'] as List<dynamic>? ?? const []))
            if (s is num) s.toInt(),
        ],
        pickupLat: j['pickupLng'] is num ? (j['pickupLat'] as num?)?.toDouble() : null,
        pickupLng: j['pickupLat'] is num ? (j['pickupLng'] as num?)?.toDouble() : null,
        paymentLabel: j['paymentLabel'] as String?,
        passengerRating: (j['passengerRating'] as num?)?.toInt(),
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
    this.esUrbano = false,
    this.routeName,
    this.savingsPerSeat,
    this.originLabel,
    this.destLabel,
    this.originLat,
    this.originLng,
    this.destLat,
    this.destLng,
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

  /// Puesto de taxi dentro de la ciudad, no salida intermunicipal. En una
  /// urbana el origen y el destino son el MISMO municipio, así que pintar
  /// «Pamplona → Pamplona» se leería como un error: el nombre está en
  /// `routeName`.
  final bool esUrbano;

  /// «Terminal → Universidad». Solo en las urbanas.
  final String? routeName;

  /// Cuánto se ahorra el pasajero frente a tomar el taxi solo, ya calculado
  /// por el servidor.
  final double? savingsPerSeat;

  /// Los extremos REALES de un viaje urbano: dónde arranca y a dónde va dentro
  /// de la ciudad. `origin`/`destination` son el municipio (el mismo en los
  /// dos), y dibujar el trayecto con ellos ponía un solo pin en el centro del
  /// pueblo — era el «no se ve el trayecto».
  final String? originLabel;
  final String? destLabel;
  final double? originLat;
  final double? originLng;
  final double? destLat;
  final double? destLng;
  bool get tieneExtremos =>
      originLat != null && originLng != null && destLat != null && destLng != null;

  int get bookedSeats => totalSeats - availableSeats;

  /// Cómo se llama esta salida en una línea.
  String get tituloRuta => esUrbano
      ? (routeName ?? 'Viaje por puestos')
      : '${origin.displayName} → ${destination.displayName}';

  factory PooledTripEntity.fromJson(Map<String, dynamic> j) => PooledTripEntity(
        id: j['id'] as String? ?? '',
        tripRef: j['tripRef'] as String? ?? '',
        origin: PooledCity.fromApi(j['origin'] as String?),
        destination: PooledCity.fromApi(j['destination'] as String?),
        // EN HORA LOCAL: el servidor manda UTC («…T22:11:00Z») y sin `toLocal`
        // la tarjeta decía «22:11» para un viaje de las 17:11.
        departureTime:
            DateTime.tryParse(j['departureTime'] as String? ?? '')?.toLocal() ??
                DateTime.now(),
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
        esUrbano: j['kind'] == 'urbano',
        routeName: j['routeName'] as String?,
        savingsPerSeat: (j['savingsPerSeat'] as num?)?.toDouble(),
        originLabel: j['originLabel'] as String?,
        destLabel: j['destLabel'] as String?,
        originLat: (j['originLat'] as num?)?.toDouble(),
        originLng: (j['originLng'] as num?)?.toDouble(),
        destLat: (j['destLat'] as num?)?.toDouble(),
        destLng: (j['destLng'] as num?)?.toDouble(),
      );
}
