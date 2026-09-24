import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart'
    show IntercityCity;

/// Estado de un viaje compartido (Modelo A: el conductor publica, el pasajero
/// reserva puestos hasta llenar el vehículo).
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
        PooledTripStatus.open => 'Disponible',
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

  bool get isActive =>
      this == PooledTripStatus.open ||
      this == PooledTripStatus.full ||
      this == PooledTripStatus.departed;
}

/// Municipio de una salida publicada. `bySlug` construye uno con el propio
/// identificador si no está en la lista cargada: antes caía a Pamplona, así
/// que una salida desde cualquier pueblo nuevo se mostraba con la ciudad
/// equivocada.
IntercityCity _cityFromApi(String? s) =>
    s == null || s.isEmpty ? IntercityCity.pamplona : IntercityCity.bySlug(s);

/// Un sitio donde subirse, con su hora.
///
/// La hora es la del PUNTO, no la de la salida del bus: quien sube en el
/// segundo punto tiene que estar ahí quince minutos después, y decirle la hora
/// de la terminal lo dejaría esperando de más o perdiendo el bus.
class PuntoEmbarque {
  const PuntoEmbarque({
    required this.id,
    required this.name,
    required this.time,
    this.address,
  });

  final String id;
  final String name;

  /// «06:15», tal como la publicó la empresa.
  final String time;
  final String? address;

  /// Sin casteos directos: esto se lee en la pantalla de comprar, y reventar
  /// aquí dejaría al pasajero sin poder reservar.
  static PuntoEmbarque? fromJson(Object? crudo) {
    if (crudo is! Map) return null;
    final name = crudo['name'];
    final time = crudo['time'];
    if (name is! String || time is! String) return null;
    return PuntoEmbarque(
      id: crudo['id'] is String ? crudo['id'] as String : name,
      name: name,
      time: time,
      address: crudo['address'] is String ? crudo['address'] as String : null,
    );
  }

  /// «Terminal · 06:00», que es como se lee de un vistazo.
  String get etiqueta => '$name · $time';
}

/// La reserva del propio pasajero dentro de un viaje compartido.
class SeatBookingEntity {
  const SeatBookingEntity({
    required this.id,
    required this.tripId,
    required this.passengerName,
    required this.seatsBooked,
    required this.status,
    this.pickupAddress,
    this.notes,
    this.seats = const [],
    this.rating,
    this.ratingComment,
    this.boardingPoint,
    this.fareTotal,
    this.discount = 0,
    this.promoCode,
    this.amountToPay,
  });

  final String id;
  final String tripId;
  final String passengerName;
  final int seatsBooked;
  final String status;
  final String? pickupAddress;
  final String? notes;

  /// Las sillas que le tocaron, en orden. Vacía en las salidas por cupos.
  final List<int> seats;

  /// Cómo calificó la salida. Null = todavía no lo ha hecho, y es lo que la
  /// pantalla usa para ofrecérselo.
  final int? rating;
  final String? ratingComment;

  /// Dónde sube, tal como se lo dijeron al reservar. Sellado: si la empresa
  /// cambia la hora del punto mañana, a esta persona le dijeron otra.
  final PuntoEmbarque? boardingPoint;

  /// Lo que costó y lo que de verdad paga. El descuento lo pone la empresa.
  final double? fareTotal;
  final double discount;
  final String? promoCode;
  final double? amountToPay;

  /// Lo que hay que enseñarle al subir: «Silla 4» o «Sillas 3, 4». Sin
  /// numeración cae a los puestos, que es lo único cierto ahí — un número
  /// inventado lo sentaría donde no le toca.
  String get seatLabel => seats.isEmpty
      ? '$seatsBooked puesto${seatsBooked == 1 ? '' : 's'}'
      : '${seats.length == 1 ? 'Silla' : 'Sillas'} ${seats.join(', ')}';

  factory SeatBookingEntity.fromJson(Map<String, dynamic> j) => SeatBookingEntity(
        id: j['id'] as String? ?? '',
        tripId: j['tripId'] as String? ?? '',
        passengerName: j['passengerName'] as String? ?? '',
        seatsBooked: (j['seatsBooked'] as num?)?.toInt() ?? 1,
        status: j['status'] as String? ?? 'confirmed',
        pickupAddress: j['pickupAddress'] as String?,
        notes: j['notes'] as String?,
        seats: [
          for (final s in (j['seats'] as List<dynamic>? ?? const []))
            if (s is num) s.toInt(),
        ],
        rating: (j['rating'] as num?)?.toInt(),
        ratingComment: j['ratingComment'] as String?,
        boardingPoint: PuntoEmbarque.fromJson(j['boardingPoint']),
        fareTotal: (j['fareTotal'] as num?)?.toDouble(),
        discount: (j['discount'] as num?)?.toDouble() ?? 0,
        promoCode: j['promoCode'] as String?,
        amountToPay: (j['amountToPay'] as num?)?.toDouble(),
      );
}

/// Un viaje compartido publicado por un conductor particular.
/// Una celda del mapa de sillas, tal como la manda el servidor.
class CeldaAsiento {
  const CeldaAsiento({required this.tipo, this.numero, this.ocupada = false});

  /// silla · pasillo · vacio · conductor · puerta
  final String tipo;
  final int? numero;
  final bool ocupada;

  bool get esSilla => tipo == 'silla' && numero != null;

  /// Sin casteos: un backend anterior a la numeración no manda estos campos, y
  /// reventar aquí dejaría al pasajero sin poder ni ver la salida.
  factory CeldaAsiento.fromJson(Map<String, dynamic> j) {
    final n = j['numero'];
    return CeldaAsiento(
      tipo: j['tipo'] is String ? j['tipo'] as String : 'vacio',
      numero: n is num ? n.toInt() : null,
      ocupada: j['ocupada'] == true,
    );
  }
}

/// El mapa de sillas de una salida numerada.
class MapaAsientos {
  const MapaAsientos({
    required this.tipo,
    required this.etiqueta,
    required this.columnas,
    required this.filas,
    required this.libres,
  });

  /// VAN · BUSETA · BUS. Es lo que elige la silueta que se dibuja; la
  /// `etiqueta` es para leer, este es para pintar.
  final String tipo;

  /// «Van», «Buseta», «Bus».
  final String etiqueta;
  final int columnas;
  final List<List<CeldaAsiento>> filas;
  final int libres;

  static MapaAsientos? fromJson(Object? crudo) {
    if (crudo is! Map) return null;
    final filas = crudo['filas'];
    if (filas is! List) return null;
    final cols = crudo['columnas'];
    return MapaAsientos(
      tipo: crudo['tipo'] is String ? crudo['tipo'] as String : '',
      etiqueta: crudo['etiqueta'] is String ? crudo['etiqueta'] as String : 'Vehículo',
      columnas: cols is num ? cols.toInt() : 0,
      filas: [
        for (final f in filas)
          if (f is List)
            [
              for (final c in f)
                if (c is Map<String, dynamic>) CeldaAsiento.fromJson(c),
            ],
      ],
      libres: crudo['libres'] is num ? (crudo['libres'] as num).toInt() : 0,
    );
  }
}

class PooledTripEntity {
  const PooledTripEntity({
    required this.id,
    required this.tripRef,
    required this.driverName,
    required this.driverPhone,
    required this.vehicleDescription,
    required this.origin,
    required this.destination,
    required this.departureTime,
    required this.totalSeats,
    required this.availableSeats,
    required this.farePerSeat,
    required this.allowFleet,
    required this.status,
    this.notes,
    this.distanceKm,
    this.durationMinutes,
    this.operatorName,
    this.operatorRating,
    this.operatorRatingCount,
    this.operatorPolicies = const [],
    this.amenities = const [],
    this.boardingPoints = const [],
    this.stops = const [],
    this.myBooking,
    this.seatMap,
  });

  /// Mapa de sillas. Null = salida sin numerar: se compran cupos y no se
  /// elige dónde se sienta uno, que es como funcionaban todas hasta ahora.
  final MapaAsientos? seatMap;

  final String id;
  final String tripRef;
  final String driverName;
  final String driverPhone;
  final String vehicleDescription;
  final IntercityCity origin;
  final IntercityCity destination;
  final DateTime departureTime;
  final int totalSeats;
  final int availableSeats;
  final double farePerSeat;
  final bool allowFleet;
  final PooledTripStatus status;
  final String? notes;
  final double? distanceKm;
  final int? durationMinutes;

  /// Razón social de la empresa que publicó la salida (null = particular).
  final String? operatorName;

  /// Nota de la empresa. Null = nadie la ha calificado, y entonces se dice
  /// «Nuevo»: ni un cero (que se lee como pésimo) ni un cinco de regalo.
  final double? operatorRating;
  final int? operatorRatingCount;

  /// Condiciones del tiquete YA REDACTADAS por el servidor. Vacío = la empresa
  /// no las ha publicado, que es distinto de no tenerlas.
  final List<String> operatorPolicies;

  /// Qué trae el vehículo: claves del catálogo (`comodidades.dart`). Vacío = no
  /// se declaró nada, y entonces no se pinta ningún chip — en vez de pintar
  /// cruces, que afirmarían que NO los tiene.
  final List<String> amenities;

  /// Dónde se puede subir. Vacío = la salida no los declara y se sigue usando
  /// el texto libre de «dónde te recogen», como hasta ahora.
  final List<PuntoEmbarque> boardingPoints;

  /// Paradas intermedias de la salida ("pasa por"), en orden.
  final List<String> stops;

  /// Present only in "mis reservas": the caller's own booking on this trip.
  final SeatBookingEntity? myBooking;

  int get bookedSeats => totalSeats - availableSeats;
  bool get hasSeats => availableSeats > 0;

  String get durationLabel {
    final mins = durationMinutes ?? 0;
    final h = mins ~/ 60;
    final m = mins % 60;
    if (h == 0) return '${m}min';
    if (m == 0) return '${h}h';
    return '${h}h ${m}min';
  }

  factory PooledTripEntity.fromJson(Map<String, dynamic> j) => PooledTripEntity(
        id: j['id'] as String? ?? '',
        tripRef: j['tripRef'] as String? ?? '',
        driverName: j['driverName'] as String? ?? 'Conductor',
        driverPhone: j['driverPhone'] as String? ?? '',
        vehicleDescription: j['vehicleDescription'] as String? ?? '',
        origin: _cityFromApi(j['origin'] as String?),
        destination: _cityFromApi(j['destination'] as String?),
        departureTime:
            DateTime.tryParse(j['departureTime'] as String? ?? '') ?? DateTime.now(),
        totalSeats: (j['totalSeats'] as num?)?.toInt() ?? 0,
        availableSeats: (j['availableSeats'] as num?)?.toInt() ?? 0,
        farePerSeat: (j['farePerSeat'] as num?)?.toDouble() ?? 0,
        allowFleet: j['allowFleet'] as bool? ?? false,
        status: PooledTripStatus.fromApi(j['status'] as String?),
        notes: j['notes'] as String?,
        distanceKm: (j['distanceKm'] as num?)?.toDouble(),
        durationMinutes: (j['durationMinutes'] as num?)?.toInt(),
        operatorName: j['operatorName'] as String?,
        operatorRating: (j['operatorRating'] as num?)?.toDouble(),
        operatorRatingCount: (j['operatorRatingCount'] as num?)?.toInt(),
        operatorPolicies: [
          for (final l in (j['operatorPolicies'] as List<dynamic>? ?? const []))
            if (l is String) l,
        ],
        amenities: [
          for (final a in (j['amenities'] as List<dynamic>? ?? const []))
            if (a is String) a,
        ],
        boardingPoints: [
          for (final p in (j['boardingPoints'] as List<dynamic>? ?? const []))
            if (PuntoEmbarque.fromJson(p) != null) PuntoEmbarque.fromJson(p)!,
        ],
        stops: [
          for (final st in (j['stops'] as List<dynamic>? ?? const []))
            if (st is Map<String, dynamic> && st['name'] is String)
              st['name'] as String,
        ],
        seatMap: MapaAsientos.fromJson(j['seatMap']),
        myBooking: j['myBooking'] is Map<String, dynamic>
            ? SeatBookingEntity.fromJson(j['myBooking'] as Map<String, dynamic>)
            : null,
      );

  PooledTripEntity copyWith({
    int? availableSeats,
    PooledTripStatus? status,
  }) =>
      PooledTripEntity(
        id: id,
        tripRef: tripRef,
        driverName: driverName,
        driverPhone: driverPhone,
        vehicleDescription: vehicleDescription,
        origin: origin,
        destination: destination,
        departureTime: departureTime,
        totalSeats: totalSeats,
        availableSeats: availableSeats ?? this.availableSeats,
        farePerSeat: farePerSeat,
        allowFleet: allowFleet,
        status: status ?? this.status,
        notes: notes,
        distanceKm: distanceKm,
        durationMinutes: durationMinutes,
        operatorName: operatorName,
        operatorRating: operatorRating,
        operatorRatingCount: operatorRatingCount,
        operatorPolicies: operatorPolicies,
        amenities: amenities,
        boardingPoints: boardingPoints,
        stops: stops,
        myBooking: myBooking,
        // Sin esta línea, cualquier copia —refrescar cupos, cambiar estado—
        // dejaría la salida sin mapa y el pasajero vería desaparecer las
        // sillas. Es el mismo descuido que en su día perdió el PIN del envío,
        // y por eso hay una prueba que lo vigila.
        seatMap: seatMap,
      );
}
