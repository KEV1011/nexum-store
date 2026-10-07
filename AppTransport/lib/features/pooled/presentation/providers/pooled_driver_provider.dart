import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/pooled/domain/entities/pooled_trip_entity.dart';

class FareCapInfo {
  const FareCapInfo({
    required this.maxFarePerSeat,
    required this.suggestedFarePerSeat,
    required this.distanceKm,
    required this.durationMinutes,
    this.costPerKm = 0,
    this.tollTotal = 0,
    this.costosDeclarados = false,
  });

  final double maxFarePerSeat;
  final double suggestedFarePerSeat;
  final double distanceKm;
  final int durationMinutes;

  /// Costos con los que se calculó el sugerido. Si el conductor no declaró los
  /// suyos, son los promedios del sistema — y se le enseñan para que sepa de
  /// dónde sale la cifra y pueda corregirla.
  final double costPerKm;
  final double tollTotal;
  final bool costosDeclarados;
}

/// Lo que se puede cobrar por un puesto en una ruta urbana.
///
/// `tarifaSolo` es lo que costaría esa misma carrera llevando a una persona:
/// es contra eso que se topa el puesto. Con `medida: false` el servidor no
/// pudo medir el trayecto y usó la carrera mínima, así que la pantalla lo dice
/// en vez de presentar el número como si estuviera medido.
class TopePuestoUrbano {
  const TopePuestoUrbano({
    required this.tarifaSolo,
    required this.topePorPuesto,
    required this.sugerido,
    required this.medida,
    this.distanceKm,
  });

  final double tarifaSolo;
  final double topePorPuesto;
  final double sugerido;
  final bool medida;
  final double? distanceKm;
}

class PooledDriverState {
  const PooledDriverState({
    this.trips = const [],
    this.isLoading = false,
    this.libres = const [],
    this.cargandoLibres = false,
    this.avisoLibres,
    this.errorLibres,
  });

  final List<PooledTripEntity> trips;
  final bool isLoading;

  /// Viajes por puestos que publicaron PASAJEROS y que todavía no tiene nadie.
  final List<PooledTripEntity> libres;
  final bool cargandoLibres;

  /// Por qué la lista viene vacía cuando el motivo no es «no hay»: sin plaza
  /// resuelta no se puede ni buscar, y enseñar «ninguno» sería afirmar algo
  /// que nadie comprobó.
  final String? avisoLibres;

  /// Falló la petición. Distinto del aviso y distinto de la lista vacía: son
  /// tres cosas y cada una se arregla de otra forma.
  final String? errorLibres;

  PooledDriverState copyWith({
    List<PooledTripEntity>? trips,
    bool? isLoading,
    List<PooledTripEntity>? libres,
    bool? cargandoLibres,
    String? avisoLibres,
    String? errorLibres,
  }) =>
      PooledDriverState(
        trips: trips ?? this.trips,
        isLoading: isLoading ?? this.isLoading,
        libres: libres ?? this.libres,
        cargandoLibres: cargandoLibres ?? this.cargandoLibres,
        avisoLibres: avisoLibres,
        errorLibres: errorLibres,
      );
}

class PooledDriverNotifier extends StateNotifier<PooledDriverState> {
  PooledDriverNotifier(this._client) : super(const PooledDriverState());

  final DioClient _client;

  // ── Fare cap (for the publish form) ─────────────────────────────────────────

  Future<FareCapInfo?> fetchFareCap({
    required PooledCity origin,
    required PooledCity destination,
    required int seats,
    double? costPerKm,
    double? tollTotal,
  }) async {
    try {
      final res = await _client.get<Map<String, dynamic>>(
        '/driver/intercity/pool/fare-cap',
        queryParameters: {
          'origin': origin.name,
          'destination': destination.name,
          'seats': seats,
          if (costPerKm != null) 'costPerKm': costPerKm,
          if (tollTotal != null) 'tollTotal': tollTotal,
        },
      );
      final d = res.data?['data'] as Map<String, dynamic>?;
      if (d == null) return null;
      return FareCapInfo(
        maxFarePerSeat: (d['maxFarePerSeat'] as num?)?.toDouble() ?? 0,
        suggestedFarePerSeat: (d['suggestedFarePerSeat'] as num?)?.toDouble() ?? 0,
        distanceKm: (d['distanceKm'] as num?)?.toDouble() ?? 0,
        durationMinutes: (d['durationMinutes'] as num?)?.toInt() ?? 0,
        costPerKm: (d['costPerKm'] as num?)?.toDouble() ?? 0,
        tollTotal: (d['tollTotal'] as num?)?.toDouble() ?? 0,
        costosDeclarados: d['costosDeclarados'] as bool? ?? false,
      );
    } catch (_) {
      return null;
    }
  }

  // ── Puesto de taxi urbano ───────────────────────────────────────────────────

  /// Lo que el formulario necesita para proponer un precio sin adivinar.
  Future<TopePuestoUrbano?> fetchTopeUrbano({
    required PooledCity ciudad,
    required String origen,
    required String destino,
    required int puestos,
  }) async {
    try {
      final res = await _client.get<Map<String, dynamic>>(
        '/driver/pool/urbano/tope',
        queryParameters: {
          'ciudad': ciudad.name,
          'origen': origen,
          'destino': destino,
          'puestos': puestos,
        },
      );
      final d = res.data?['data'] as Map<String, dynamic>?;
      if (d == null) return null;
      return TopePuestoUrbano(
        tarifaSolo: (d['tarifaSolo'] as num?)?.toDouble() ?? 0,
        topePorPuesto: (d['topePorPuesto'] as num?)?.toDouble() ?? 0,
        sugerido: (d['sugerido'] as num?)?.toDouble() ?? 0,
        medida: d['medida'] as bool? ?? false,
        distanceKm: (d['distanceKm'] as num?)?.toDouble(),
      );
    } catch (_) {
      return null;
    }
  }

  /// `null` si se publicó; si no, el motivo que devolvió el servidor.
  Future<String?> publicarPuestoUrbano({
    required PooledCity ciudad,
    required String origen,
    required String destino,
    required DateTime salida,
    required int puestos,
    required String vehiculo,
    String? notas,
  }) async {
    try {
      await _client.post<Map<String, dynamic>>(
        '/driver/pool/urbano/publish',
        data: {
          'city': ciudad.name,
          'originLabel': origen,
          'destLabel': destino,
          'departureTime': salida.toIso8601String(),
          'totalSeats': puestos,
          // El precio NO se manda: lo pone la plataforma y el servidor
          // descarta lo que llegue. Mandarlo haría creer que se decide aquí.
          'vehicleDescription': vehiculo,
          if (notas != null && notas.isNotEmpty) 'notes': notas,
        },
      );
      await loadMine();
      return null;
    } on AppException catch (e) {
      return _extractError(e) ?? 'No se pudo publicar el viaje por puestos.';
    } catch (_) {
      return 'No se pudo publicar el viaje por puestos.';
    }
  }

  // ── Publish ──────────────────────────────────────────────────────────────────

  /// Returns `null` on success, or a human error message on failure.
  Future<String?> publish({
    required PooledCity origin,
    required PooledCity destination,
    required DateTime departureTime,
    required int totalSeats,
    required double farePerSeat,
    required String vehicleDescription,
    String? notes,
    bool allowFleet = false,
  }) async {
    try {
      await _client.post<Map<String, dynamic>>(
        '/driver/intercity/pool/publish',
        data: {
          'origin': origin.name,
          'destination': destination.name,
          'departureTime': departureTime.toIso8601String(),
          'totalSeats': totalSeats,
          'farePerSeat': farePerSeat,
          'vehicleDescription': vehicleDescription,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
          'allowFleet': allowFleet,
        },
      );
      await loadMine();
      return null;
    } on AppException catch (e) {
      return _extractError(e) ?? 'No se pudo publicar el viaje.';
    } catch (_) {
      return 'No se pudo publicar el viaje.';
    }
  }

  // ── My published trips ─────────────────────────────────────────────────────

  Future<void> loadMine() async {
    state = state.copyWith(isLoading: true);
    try {
      final res = await _client.get<Map<String, dynamic>>(
        '/driver/intercity/pool/mine',
      );
      final list = (res.data?['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(PooledTripEntity.fromJson)
          .toList();
      state = state.copyWith(trips: list, isLoading: false);
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  // ── Tablero: viajes que armaron pasajeros y nadie ha tomado ──────────────

  Future<void> cargarLibres() async {
    state = state.copyWith(cargandoLibres: true);
    try {
      final res = await _client.get<Map<String, dynamic>>(
        '/driver/pool/urbano/sin-conductor',
      );
      final d = res.data?['data'] as Map<String, dynamic>?;
      final list = (d?['trips'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(PooledTripEntity.fromJson)
          .toList();
      state = state.copyWith(
        libres: list,
        cargandoLibres: false,
        avisoLibres: d?['aviso'] as String?,
      );
    } catch (_) {
      state = state.copyWith(
        libres: const [],
        cargandoLibres: false,
        errorLibres: 'No pudimos cargar los viajes. Revisa tu conexión.',
      );
    }
  }

  /// Toma un viaje del tablero. `null` = quedó a su nombre; si no, el motivo.
  ///
  /// El motivo importa: «otro conductor ya lo tomó» se arregla buscando otro y
  /// «registra tu vehículo» no se arregla mirando la pantalla.
  Future<String?> tomarLibre(String tripId) async {
    String? error;
    try {
      await _client.post<Map<String, dynamic>>(
        '/driver/pool/urbano/$tripId/tomar',
      );
    } on AppException catch (e) {
      error = _extractError(e) ?? 'No se pudo tomar el viaje.';
    } catch (_) {
      error = 'No se pudo tomar el viaje. Revisa tu conexión.';
    }
    // Se recarga pase lo que pase: si otro se lo llevó, tiene que desaparecer
    // del tablero en vez de quedarse tentando.
    await cargarLibres();
    if (error == null) await loadMine();
    return error;
  }

  /// Devuelven `null` si el backend aceptó la acción, o el mensaje de error a
  /// mostrar. Antes se tragaban el error y "Iniciar" parecía no hacer nada.
  Future<String?> depart(String tripId) => _action(tripId, 'depart');
  Future<String?> complete(String tripId) => _action(tripId, 'complete');
  Future<String?> cancel(String tripId) => _action(tripId, 'cancel');

  Future<String?> _action(String tripId, String action) async {
    String? error;
    try {
      await _client.post<Map<String, dynamic>>(
        '/driver/intercity/pool/$tripId/$action',
      );
    } on AppException catch (e) {
      error = _extractError(e) ?? 'No se pudo completar la acción.';
    } catch (_) {
      error = 'No se pudo completar la acción. Revisa tu conexión.';
    }
    // Siempre recarga para reflejar el estado real del servidor.
    await loadMine();
    return error;
  }

  String? _extractError(AppException e) {
    final details = e.details;
    if (details is Map && details['error'] is String) {
      return details['error'] as String;
    }
    return e.message;
  }
}

final pooledDriverProvider =
    StateNotifierProvider<PooledDriverNotifier, PooledDriverState>((ref) {
  return PooledDriverNotifier(DioClient());
});
