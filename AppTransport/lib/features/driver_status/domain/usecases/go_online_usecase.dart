import 'package:nexum_driver/features/driver_status/domain/entities/driver_status_entity.dart';
import 'package:nexum_driver/features/driver_status/domain/repositories/driver_status_repository.dart';
import 'package:nexum_driver/shared/models/location_model.dart';

/// Use case: pone al conductor en línea con la ubicación dada.
///
/// Valida que la ubicación esté dentro de los límites operativos de Pamplona,
/// Norte de Santander (lat 7.35–7.40, lng -72.67 a -72.62). Si está fuera de
/// los límites, procede de todos modos pero registra una advertencia en consola.
class GoOnlineUseCase {
  const GoOnlineUseCase({required this.repository});

  final DriverStatusRepository repository;

  // Límites del área operativa de Pamplona, N. de S.
  static const double _latMin = 7.35;
  static const double _latMax = 7.40;
  static const double _lngMin = -72.67;
  static const double _lngMax = -72.62;

  /// Ejecuta el use case.
  ///
  /// [location] — Ubicación actual del conductor.
  /// Returns el [DriverStatusEntity] actualizado con estado [DriverStatus.online].
  /// Throws si el repositorio falla.
  Future<DriverStatusEntity> call(LocationModel location) async {
    final bool withinBounds = _isWithinPamplonaBounds(location);

    if (!withinBounds) {
      // ignore: avoid_print
      print(
        '[GoOnlineUseCase] ADVERTENCIA: La ubicación del conductor '
        '(lat=${location.latitude}, lng=${location.longitude}) '
        'está fuera del área operativa de Pamplona '
        '(lat [$_latMin–$_latMax], lng [$_lngMin–$_lngMax]). '
        'Procediendo de todas formas.',
      );
    }

    return repository.goOnline(location);
  }

  bool _isWithinPamplonaBounds(LocationModel location) {
    return location.latitude >= _latMin &&
        location.latitude <= _latMax &&
        location.longitude >= _lngMin &&
        location.longitude <= _lngMax;
  }
}
