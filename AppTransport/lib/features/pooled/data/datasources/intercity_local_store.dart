import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:nexum_driver/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Almacén local de viajes intermunicipales (modo "pooled").
///
/// Se usa como respaldo cuando no hay backend disponible — por ejemplo en la
/// demo web de GitHub Pages, donde [DioClient] no puede alcanzar la API. Así
/// las pantallas de publicación y "mis viajes" funcionan igual, con cupos que
/// se van reservando de forma simulada para mostrar reactividad.
///
/// TODO: conectar backend real. Cuando exista API/Firestore, este store deja
/// de usarse y el provider vuelve a leer de la red.
class IntercityLocalStore {
  IntercityLocalStore._();
  static final IntercityLocalStore instance = IntercityLocalStore._();

  static const _prefsKey = 'nexum_intercity_trips_v1';

  final List<PooledTripEntity> _trips = [];
  final _changes = StreamController<void>.broadcast();
  final _rng = Random();

  Timer? _demandTimer;
  bool _loaded = false;

  /// Emite cada vez que cambia la lista (publicar, reservar, cancelar...).
  Stream<void> get changes => _changes.stream;

  // ── Carga / persistencia ────────────────────────────────────────────────

  Future<List<PooledTripEntity>> load() async {
    if (!_loaded) {
      await _restore();
      _loaded = true;
      _ensureDemandSimulation();
    }
    return List.unmodifiable(_trips);
  }

  Future<void> _restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_prefsKey);
      if (raw == null || raw.isEmpty) return;
      final list = (jsonDecode(raw) as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(PooledTripEntity.fromJson)
          .toList();
      _trips
        ..clear()
        ..addAll(list);
    } catch (_) {
      // Estado corrupto: empezamos limpio.
    }
  }

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _prefsKey,
        jsonEncode(_trips.map((t) => t.toJson()).toList()),
      );
    } catch (_) {
      // En web sin almacenamiento simplemente se mantiene en memoria.
    }
  }

  // ── Publicar ──────────────────────────────────────────────────────────────

  Future<PooledTripEntity> publish({
    required PooledCity origin,
    required PooledCity destination,
    required DateTime departureTime,
    required int totalSeats,
    required double farePerSeat,
    required String vehicleDescription,
    String? notes,
    bool allowFleet = false,
  }) async {
    final id = 'local_${DateTime.now().millisecondsSinceEpoch}';
    final ref = 'INT-${_rng.nextInt(9000) + 1000}';
    final trip = PooledTripEntity(
      id: id,
      tripRef: ref,
      origin: origin,
      destination: destination,
      departureTime: departureTime,
      totalSeats: totalSeats,
      availableSeats: totalSeats,
      farePerSeat: farePerSeat,
      maxFarePerSeat: farePerSeat,
      allowFleet: allowFleet,
      status: PooledTripStatus.open,
      vehicleDescription: vehicleDescription,
      notes: notes,
    );
    _trips.insert(0, trip);
    await _persist();
    _changes.add(null);
    _ensureDemandSimulation();
    return trip;
  }

  // ── Acciones del conductor ─────────────────────────────────────────────────

  Future<void> depart(String id) => _setStatus(id, PooledTripStatus.departed);
  Future<void> complete(String id) =>
      _setStatus(id, PooledTripStatus.completed);
  Future<void> cancel(String id) => _setStatus(id, PooledTripStatus.cancelled);

  Future<void> _setStatus(String id, PooledTripStatus status) async {
    final i = _trips.indexWhere((t) => t.id == id);
    if (i == -1) return;
    _trips[i] = _trips[i].copyWith(status: status);
    await _persist();
    _changes.add(null);
  }

  // ── Demanda simulada ───────────────────────────────────────────────────────

  /// Cada cierto tiempo reserva un puesto en un viaje abierto, para que el
  /// conductor vea el contador de cupos subir en vivo (igual que con un
  /// backend real empujando reservas por WebSocket).
  void _ensureDemandSimulation() {
    final hasOpen = _trips.any(
      (t) => t.status == PooledTripStatus.open && t.availableSeats > 0,
    );
    if (!hasOpen) {
      _demandTimer?.cancel();
      _demandTimer = null;
      return;
    }
    _demandTimer ??= Timer.periodic(
      const Duration(seconds: 14),
      (_) => _simulateBooking(),
    );
  }

  static const _names = [
    'María', 'Carlos', 'Luisa', 'Andrés', 'Paola', 'Jorge', 'Daniela',
    'Felipe', 'Camila', 'Santiago',
  ];
  static const _lastNames = [
    'Gómez', 'Rojas', 'Pérez', 'Mora', 'Suárez', 'Vega', 'Castro',
  ];

  void _simulateBooking() {
    final openIdx = <int>[];
    for (var i = 0; i < _trips.length; i++) {
      final t = _trips[i];
      if (t.status == PooledTripStatus.open && t.availableSeats > 0) {
        openIdx.add(i);
      }
    }
    if (openIdx.isEmpty) {
      _ensureDemandSimulation();
      return;
    }

    final i = openIdx[_rng.nextInt(openIdx.length)];
    final trip = _trips[i];
    final seats = trip.allowFleet && _rng.nextBool()
        ? trip.availableSeats
        : 1;
    final remaining = trip.availableSeats - seats;
    final name =
        '${_names[_rng.nextInt(_names.length)]} ${_lastNames[_rng.nextInt(_lastNames.length)]}';

    final booking = PooledSeatBooking(
      id: 'bk_${DateTime.now().millisecondsSinceEpoch}',
      passengerName: name,
      passengerPhone: '+57 3${_rng.nextInt(89) + 10} ${_rng.nextInt(900) + 100} ${_rng.nextInt(9000) + 1000}',
      seatsBooked: seats,
    );

    _trips[i] = trip.copyWith(
      availableSeats: remaining,
      status: remaining <= 0 ? PooledTripStatus.full : PooledTripStatus.open,
      bookings: [...trip.bookings, booking],
    );

    _persist();
    _changes.add(null);
    _ensureDemandSimulation();
  }

  void dispose() {
    _demandTimer?.cancel();
    _changes.close();
  }
}
