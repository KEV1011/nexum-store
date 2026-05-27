import 'dart:math' as math;

import 'package:nexum_driver/core/constants/app_constants.dart';

/// Calculadora de tarifas para la plataforma Nexum (Pamplona, Colombia).
///
/// Fórmula:
/// Tarifa = max(TARIFA_MÍNIMA, BASE + (distancia_km × TASA_KM) + (duración_min × TASA_MIN))
///
/// Valores:
/// - Base: $3.500 COP
/// - Por km: $800 COP
/// - Por minuto: $150 COP
/// - Mínima: $5.000 COP
/// - Comisión plataforma: 15%
abstract final class FareCalculator {
  /// Calcula la tarifa estimada del viaje.
  static double calculateFare({
    required double distanceKm,
    required int durationMinutes,
  }) {
    final fare = AppConstants.baseFareCop +
        (distanceKm * AppConstants.perKmRateCop) +
        (durationMinutes * AppConstants.perMinRateCop);
    return math.max(fare, AppConstants.minimumFareCop);
  }

  /// Estima la duración en minutos dado velocidad promedio urbana de Pamplona.
  static int estimateDurationMinutes(double distanceKm) {
    final hours = distanceKm / AppConstants.averageUrbanSpeedKmh;
    return (hours * 60).ceil();
  }

  /// Calcula la ganancia neta del conductor (después de comisión de plataforma).
  static double calculateNetEarning(double grossFare) {
    return grossFare * (1 - AppConstants.platformCommissionRate);
  }

  /// Calcula la comisión de la plataforma.
  static double calculateCommission(double grossFare) {
    return grossFare * AppConstants.platformCommissionRate;
  }

  /// Calcula distancia entre dos coordenadas usando fórmula Haversine (en km).
  static double calculateDistance({
    required double lat1,
    required double lng1,
    required double lat2,
    required double lng2,
  }) {
    const earthRadiusKm = 6371.0;
    final dLat = _toRadians(lat2 - lat1);
    final dLng = _toRadians(lng2 - lng1);
    final a = math.pow(math.sin(dLat / 2), 2) +
        math.cos(_toRadians(lat1)) *
            math.cos(_toRadians(lat2)) *
            math.pow(math.sin(dLng / 2), 2);
    final c = 2 * math.asin(math.sqrt(a));
    return earthRadiusKm * c;
  }

  static double _toRadians(double degrees) => degrees * math.pi / 180;
}
