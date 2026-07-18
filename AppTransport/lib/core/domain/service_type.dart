import 'package:flutter/material.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';

/// Tipos de servicio disponibles en ZIPA Conductor (Pamplona, Colombia).
enum ServiceType {
  particular,
  taxi,
  moto,
  envios;

  // ── Display metadata ───────────────────────────────────────────────────

  String get displayName => switch (this) {
        ServiceType.particular => 'Particular',
        ServiceType.taxi => 'Taxi',
        ServiceType.moto => 'Moto',
        ServiceType.envios => 'Envíos',
      };

  String get description => switch (this) {
        ServiceType.particular => 'Vehículo particular confort',
        ServiceType.taxi => 'Taxi amarillo oficial',
        ServiceType.moto => 'Mototaxi económico',
        ServiceType.envios => 'Mensajería express',
      };

  IconData get icon => switch (this) {
        ServiceType.particular => Icons.directions_car_rounded,
        ServiceType.taxi => Icons.local_taxi_rounded,
        ServiceType.moto => Icons.two_wheeler_rounded,
        ServiceType.envios => Icons.delivery_dining_rounded,
      };

  // ── Colors ─────────────────────────────────────────────────────────────

  Color get color => switch (this) {
        ServiceType.particular => AppColors.serviceParticular,
        ServiceType.taxi => AppColors.serviceTaxi,
        ServiceType.moto => AppColors.serviceMoto,
        ServiceType.envios => AppColors.serviceEnvios,
      };

  Color get containerColor => switch (this) {
        ServiceType.particular => AppColors.serviceParticularContainer,
        ServiceType.taxi => AppColors.serviceTaxiContainer,
        ServiceType.moto => AppColors.serviceMotoContainer,
        ServiceType.envios => AppColors.serviceEnviosContainer,
      };

  // ── Fare structure (Pamplona, Colombia — COP) ──────────────────────────

  double get baseFare => switch (this) {
        ServiceType.particular => 4500,
        ServiceType.taxi => 4000,
        ServiceType.moto => 2500,
        ServiceType.envios => 3500,
      };

  double get perKmRate => switch (this) {
        ServiceType.particular => 1800,
        ServiceType.taxi => 1600,
        ServiceType.moto => 900,
        ServiceType.envios => 1200,
      };

  double get perMinuteRate => switch (this) {
        ServiceType.particular => 120,
        ServiceType.taxi => 100,
        ServiceType.moto => 60,
        ServiceType.envios => 80,
      };

  int get maxPassengers => switch (this) {
        ServiceType.particular => 4,
        ServiceType.taxi => 4,
        ServiceType.moto => 1,
        ServiceType.envios => 0,
      };

  double get platformCommission => switch (this) {
        ServiceType.particular => 0.15,
        ServiceType.taxi => 0.12,
        ServiceType.moto => 0.10,
        ServiceType.envios => 0.13,
      };

  double estimateFare(double distanceKm, double durationMinutes) {
    final raw = baseFare + (distanceKm * perKmRate) + (durationMinutes * perMinuteRate);
    return (raw / 100).ceil() * 100;
  }
}
