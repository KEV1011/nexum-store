import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';

/// Tipos de servicio disponibles en Nexum Driver (Pamplona, Colombia).
enum ServiceType {
  particular,
  taxi,
  moto,
  motocarro,
  envios;

  // ── Display metadata ───────────────────────────────────────────────────

  String get displayName => switch (this) {
        ServiceType.particular => 'Particular',
        ServiceType.taxi => 'Taxi',
        ServiceType.moto => 'Moto',
        ServiceType.motocarro => 'Moto-carro',
        ServiceType.envios => 'Envíos',
      };

  String get description => switch (this) {
        ServiceType.particular => 'Vehículo particular confort',
        ServiceType.taxi => 'Taxi amarillo oficial',
        ServiceType.moto => 'Mototaxi económico',
        ServiceType.motocarro => 'Carga y encomiendas',
        ServiceType.envios => 'Mensajería express',
      };

  IconData get icon => switch (this) {
        ServiceType.particular => Icons.directions_car_rounded,
        ServiceType.taxi => Icons.local_taxi_rounded,
        ServiceType.moto => Icons.two_wheeler_rounded,
        ServiceType.motocarro => Icons.airport_shuttle_rounded,
        ServiceType.envios => Icons.delivery_dining_rounded,
      };

  // ── Colors ─────────────────────────────────────────────────────────────

  Color get color => switch (this) {
        ServiceType.particular => AppColors.serviceParticular,
        ServiceType.taxi => AppColors.serviceTaxi,
        ServiceType.moto => AppColors.serviceMoto,
        ServiceType.motocarro => AppColors.serviceMotocarro,
        ServiceType.envios => AppColors.serviceEnvios,
      };

  Color get containerColor => switch (this) {
        ServiceType.particular => AppColors.serviceParticularContainer,
        ServiceType.taxi => AppColors.serviceTaxiContainer,
        ServiceType.moto => AppColors.serviceMotoContainer,
        ServiceType.motocarro => AppColors.serviceMotocarroContainer,
        ServiceType.envios => AppColors.serviceEnviosContainer,
      };

  // ── Fare structure (Pamplona, Colombia — COP) ──────────────────────────

  /// Tarifa base en COP.
  double get baseFare => switch (this) {
        ServiceType.particular => 4500,
        ServiceType.taxi => 4000,
        ServiceType.moto => 2500,
        ServiceType.motocarro => 3000,
        ServiceType.envios => 3500,
      };

  /// Tarifa por kilómetro en COP.
  double get perKmRate => switch (this) {
        ServiceType.particular => 1800,
        ServiceType.taxi => 1600,
        ServiceType.moto => 900,
        ServiceType.motocarro => 1100,
        ServiceType.envios => 1200,
      };

  /// Tarifa por minuto en COP (espera o tráfico).
  double get perMinuteRate => switch (this) {
        ServiceType.particular => 120,
        ServiceType.taxi => 100,
        ServiceType.moto => 60,
        ServiceType.motocarro => 70,
        ServiceType.envios => 80,
      };

  /// Capacidad máxima de pasajeros (0 = carga/envíos).
  int get maxPassengers => switch (this) {
        ServiceType.particular => 4,
        ServiceType.taxi => 4,
        ServiceType.moto => 1,
        ServiceType.motocarro => 0,
        ServiceType.envios => 0,
      };

  // ── Map marker hue (BitmapDescriptor) ─────────────────────────────────

  double get markerHue => switch (this) {
        ServiceType.particular => BitmapDescriptor.hueBlue,
        ServiceType.taxi => BitmapDescriptor.hueOrange,
        ServiceType.moto => BitmapDescriptor.hueRose,
        ServiceType.motocarro => BitmapDescriptor.hueViolet,
        ServiceType.envios => BitmapDescriptor.hueCyan,
      };

  // ── Porcentaje de comisión de la plataforma ────────────────────────────
  double get platformCommission => switch (this) {
        ServiceType.particular => 0.15,
        ServiceType.taxi => 0.12,
        ServiceType.moto => 0.10,
        ServiceType.motocarro => 0.12,
        ServiceType.envios => 0.13,
      };

  /// Calcula la tarifa estimada dado distancia en km y tiempo en minutos.
  double estimateFare(double distanceKm, double durationMinutes) {
    final raw = baseFare + (distanceKm * perKmRate) + (durationMinutes * perMinuteRate);
    return (raw / 100).ceil() * 100; // redondeo al cien más cercano
  }
}
