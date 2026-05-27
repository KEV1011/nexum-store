import 'package:nexum_driver/features/driver_status/domain/entities/driver_status_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';

/// Datasource mock que mantiene el estado del conductor en memoria.
///
/// En el MVP no hay backend real. Toda la lógica de estado se gestiona
/// aquí con una variable estática. Reemplazar con llamadas HTTP cuando
/// exista el servidor.
class DriverStatusDataSource {
  // Estado en memoria compartido por toda la app durante la sesión.
  static DriverStatusEntity _currentStatus = DriverStatusEntity.initial;

  /// Retorna el estado actual del conductor.
  Future<DriverStatusEntity> getStatus() async {
    await Future<void>.delayed(const Duration(milliseconds: 50));
    return _currentStatus;
  }

  /// Pone al conductor en línea y registra la hora de inicio.
  Future<DriverStatusEntity> goOnline(LocationModel location) async {
    await Future<void>.delayed(const Duration(milliseconds: 80));
    _currentStatus = _currentStatus.copyWith(
      status: DriverStatus.online,
      onlineSince: DateTime.now(),
      currentLatitude: location.latitude,
      currentLongitude: location.longitude,
    );
    return _currentStatus;
  }

  /// Desconecta al conductor de la plataforma.
  Future<DriverStatusEntity> goOffline() async {
    await Future<void>.delayed(const Duration(milliseconds: 80));
    _currentStatus = DriverStatusEntity(
      status: DriverStatus.offline,
      dailyTrips: _currentStatus.dailyTrips,
      dailyEarnings: _currentStatus.dailyEarnings,
      onlineSince: null,
      currentLatitude: _currentStatus.currentLatitude,
      currentLongitude: _currentStatus.currentLongitude,
    );
    return _currentStatus;
  }

  /// Actualiza la posición GPS del conductor.
  Future<DriverStatusEntity> updateLocation(LocationModel location) async {
    await Future<void>.delayed(const Duration(milliseconds: 30));
    _currentStatus = _currentStatus.copyWith(
      currentLatitude: location.latitude,
      currentLongitude: location.longitude,
    );
    return _currentStatus;
  }

  /// Registra un viaje completado: incrementa el contador diario y las
  /// ganancias del día.
  ///
  /// [earnings] — Ganancias netas del viaje (COP) para el conductor.
  Future<DriverStatusEntity> addCompletedTrip(double earnings) async {
    await Future<void>.delayed(const Duration(milliseconds: 50));
    _currentStatus = _currentStatus.copyWith(
      dailyTrips: _currentStatus.dailyTrips + 1,
      dailyEarnings: _currentStatus.dailyEarnings + earnings,
      // Si terminó un viaje, vuelve a online (disponible para el próximo).
      status: DriverStatus.online,
    );
    return _currentStatus;
  }

  /// Marca al conductor como ocupado (en viaje activo).
  Future<DriverStatusEntity> setBusy() async {
    await Future<void>.delayed(const Duration(milliseconds: 30));
    _currentStatus = _currentStatus.copyWith(status: DriverStatus.busy);
    return _currentStatus;
  }

  /// Expone el estado actual sin async para casos de uso síncronos.
  DriverStatusEntity get current => _currentStatus;
}
