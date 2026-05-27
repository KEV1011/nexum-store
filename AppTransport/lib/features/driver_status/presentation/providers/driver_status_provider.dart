import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/features/driver_status/data/datasources/driver_status_datasource.dart';
import 'package:nexum_driver/features/driver_status/data/repositories/driver_status_repository_impl.dart';
import 'package:nexum_driver/features/driver_status/domain/entities/driver_status_entity.dart';
import 'package:nexum_driver/features/driver_status/domain/usecases/go_offline_usecase.dart';
import 'package:nexum_driver/features/driver_status/domain/usecases/go_online_usecase.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/services/location_service.dart';

// ── Infrastructure providers ─────────────────────────────────────────────────

final _driverStatusDataSourceProvider = Provider<DriverStatusDataSource>((ref) {
  return DriverStatusDataSource();
});

final _driverStatusRepositoryProvider =
    Provider<DriverStatusRepositoryImpl>((ref) {
  return DriverStatusRepositoryImpl(
    dataSource: ref.watch(_driverStatusDataSourceProvider),
  );
});

final _goOnlineUseCaseProvider = Provider<GoOnlineUseCase>((ref) {
  return GoOnlineUseCase(repository: ref.watch(_driverStatusRepositoryProvider));
});

final _goOfflineUseCaseProvider = Provider<GoOfflineUseCase>((ref) {
  return GoOfflineUseCase(
      repository: ref.watch(_driverStatusRepositoryProvider));
});

// ── DriverStatusNotifier ──────────────────────────────────────────────────────

/// Notifier central que gestiona el estado en línea/fuera de línea del conductor
/// y las estadísticas diarias de viajes y ganancias.
class DriverStatusNotifier extends StateNotifier<DriverStatusEntity> {
  DriverStatusNotifier({
    required GoOnlineUseCase goOnlineUseCase,
    required GoOfflineUseCase goOfflineUseCase,
    required DriverStatusRepositoryImpl repository,
  })  : _goOnlineUseCase = goOnlineUseCase,
        _goOfflineUseCase = goOfflineUseCase,
        _repository = repository,
        super(DriverStatusEntity.initial);

  final GoOnlineUseCase _goOnlineUseCase;
  final GoOfflineUseCase _goOfflineUseCase;
  final DriverStatusRepositoryImpl _repository;

  // ── goOnline ───────────────────────────────────────────────────────────────

  /// Pone al conductor en línea.
  ///
  /// Intenta obtener la ubicación actual del dispositivo a través de
  /// [LocationService]. Si falla (sin permisos o GPS no disponible),
  /// usa el centro de Pamplona como fallback.
  ///
  /// Lanza una excepción si el repositorio falla.
  Future<void> goOnline() async {
    LocationModel location;
    try {
      location = await LocationService().getCurrentLocation();
    } catch (_) {
      // Fallback: centro de Pamplona, Parque Águeda Gallardo
      location = const LocationModel(
        latitude: 7.3754,
        longitude: -72.6486,
        address: 'Parque Águeda Gallardo, Pamplona',
      );
    }

    final updated = await _goOnlineUseCase(location);
    state = updated;
    LocationService().startTracking();
  }

  // ── goOffline ──────────────────────────────────────────────────────────────

  /// Desconecta al conductor de la plataforma.
  Future<void> goOffline() async {
    final updated = await _goOfflineUseCase();
    state = updated;
    LocationService().stopTracking();
  }

  // ── updateEarnings ─────────────────────────────────────────────────────────

  /// Registra un viaje completado con la tarifa [fare] en COP.
  ///
  /// Incrementa el contador de viajes diarios y acumula las ganancias.
  Future<void> updateEarnings(double fare) async {
    final updated = await _repository.addCompletedTrip(fare);
    state = updated;
  }

  // ── updateLocation ─────────────────────────────────────────────────────────

  /// Actualiza la posición GPS del conductor en el estado.
  Future<void> updateLocation(LocationModel location) async {
    final updated = await _repository.updateLocation(location);
    state = updated;
  }
}

// ── Public providers ──────────────────────────────────────────────────────────

/// Proveedor principal del estado del conductor.
///
/// Úsalo con `ref.watch(driverStatusProvider)` para observar cambios
/// y `ref.read(driverStatusProvider.notifier)` para disparar acciones.
final driverStatusProvider =
    StateNotifierProvider<DriverStatusNotifier, DriverStatusEntity>((ref) {
  return DriverStatusNotifier(
    goOnlineUseCase: ref.watch(_goOnlineUseCaseProvider),
    goOfflineUseCase: ref.watch(_goOfflineUseCaseProvider),
    repository: ref.watch(_driverStatusRepositoryProvider),
  );
});

/// Proveedor derivado: retorna `true` si el conductor está en línea.
///
/// Úsalo en widgets que solo necesitan saber si está disponible,
/// sin subscribirse al estado completo.
final isOnlineProvider = Provider<bool>((ref) {
  return ref.watch(driverStatusProvider).isOnline;
});
