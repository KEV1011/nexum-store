import 'package:nexum_client/features/pooled/domain/entities/pooled_trip_entity.dart';

/// Un viaje por puestos URBANO del pasajero, publicado por él o reservado: lo
/// que devuelve `GET /client/pool/urbano/viajes`.
///
/// POR QUÉ ES UNA CLASE APARTE y no más campos en `PooledTripEntity`: aquí
/// viven los extremos reales del trayecto, la posición del taxi y la reserva
/// propia — cosas que solo tienen sentido en ESTA pantalla — y meterlas en la
/// entidad compartida obligaría a tocar el buscador y el `copyWith` de todo el
/// intermunicipal, que funcionan.
class MiViajePuesto {
  const MiViajePuesto({
    required this.id,
    required this.tripRef,
    required this.titulo,
    required this.estado,
    required this.salida,
    required this.sinConductor,
    required this.totalSeats,
    required this.availableSeats,
    required this.farePerSeat,
    required this.pasajeros,
    required this.soyAutor,
    required this.reserva,
    this.miUsuarioId,
    this.originLabel,
    this.destLabel,
    this.originLat,
    this.originLng,
    this.destLat,
    this.destLng,
    this.driverName,
    this.vehicleDescription,
    this.driverLat,
    this.driverLng,
  });

  final String id;
  final String tripRef;
  final String titulo;
  final PooledTripStatus estado;

  /// En hora LOCAL: el servidor manda UTC.
  final DateTime salida;
  final bool sinConductor;
  final int totalSeats;
  final int availableSeats;
  final double farePerSeat;
  final int pasajeros;

  /// Si lo publicó él: solo el autor cancela el viaje entero; los demás
  /// cancelan su puesto.
  final bool soyAutor;
  final SeatBookingEntity reserva;

  /// Su id, para distinguir sus mensajes en el chat de grupo.
  final String? miUsuarioId;

  final String? originLabel;
  final String? destLabel;
  final double? originLat;
  final double? originLng;
  final double? destLat;
  final double? destLng;

  final String? driverName;
  final String? vehicleDescription;

  /// Dónde va el taxi ahora mismo, si ya hay uno y el viaje sigue vivo.
  final double? driverLat;
  final double? driverLng;

  bool get tieneExtremos =>
      originLat != null && originLng != null && destLat != null && destLng != null;

  bool get activo =>
      estado == PooledTripStatus.open ||
      estado == PooledTripStatus.full ||
      estado == PooledTripStatus.departed;

  /// Se puede cancelar mientras no haya salido: después hay gente a bordo.
  bool get cancelable =>
      estado == PooledTripStatus.open || estado == PooledTripStatus.full;

  /// El chat tiene sentido con taxista asignado y el viaje vivo: antes no hay
  /// con quién hablar, y después ya no hace falta.
  bool get chatDisponible => !sinConductor && activo;

  /// Calificar: al terminar, si no lo ha hecho.
  bool get puedeCalificar =>
      estado == PooledTripStatus.completed && !sinConductor && reserva.rating == null;

  /// Tolerante: un campo raro no puede tumbar la pantalla donde la persona
  /// mira si ya viene su taxi. Sin reserva propia devuelve null — este
  /// endpoint siempre la trae, y sin ella la pantalla no tiene qué enseñar.
  static MiViajePuesto? fromJson(Map<String, dynamic> j) {
    final reserva = j['myBooking'];
    if (reserva is! Map<String, dynamic>) return null;
    double? num_(Object? v) => v is num ? v.toDouble() : null;
    final routeName = j['routeName'] as String?;
    return MiViajePuesto(
      id: j['id'] as String? ?? '',
      tripRef: j['tripRef'] as String? ?? '',
      titulo: (routeName != null && routeName.isNotEmpty) ? routeName : 'Viaje por puestos',
      estado: PooledTripStatus.fromApi(j['status'] as String?),
      salida: DateTime.tryParse(j['departureTime'] as String? ?? '')?.toLocal() ??
          DateTime.now(),
      sinConductor: j['sinConductor'] as bool? ?? true,
      totalSeats: (j['totalSeats'] as num?)?.toInt() ?? 0,
      availableSeats: (j['availableSeats'] as num?)?.toInt() ?? 0,
      farePerSeat: num_(j['farePerSeat']) ?? 0,
      pasajeros: (j['pasajeros'] as num?)?.toInt() ?? 0,
      soyAutor: j['soyAutor'] as bool? ?? false,
      reserva: SeatBookingEntity.fromJson(reserva),
      miUsuarioId: j['miUsuarioId'] as String?,
      originLabel: j['originLabel'] as String?,
      destLabel: j['destLabel'] as String?,
      originLat: num_(j['originLat']),
      originLng: num_(j['originLng']),
      destLat: num_(j['destLat']),
      destLng: num_(j['destLng']),
      driverName: j['driverName'] as String?,
      vehicleDescription: j['vehicleDescription'] as String?,
      driverLat: num_(j['driverLat']),
      driverLng: num_(j['driverLng']),
    );
  }
}

/// Cómo está el viaje, dicho como lo entiende el pasajero.
String estadoDeMiViaje(MiViajePuesto v) {
  switch (v.estado) {
    case PooledTripStatus.open:
    case PooledTripStatus.full:
      return v.sinConductor
          ? 'Esperando a que un taxista lo tome'
          : 'Taxista asignado · pasará por ti';
    case PooledTripStatus.departed:
      return 'En camino · el taxista va recogiendo';
    case PooledTripStatus.completed:
      return 'Viaje terminado';
    case PooledTripStatus.cancelled:
      return 'Viaje cancelado · no se te cobró nada';
  }
}
