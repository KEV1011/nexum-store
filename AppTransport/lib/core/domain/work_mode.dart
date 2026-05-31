import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';

/// Modo de trabajo del conductor: qué tipo de solicitudes acepta ahora mismo.
enum WorkMode {
  pasajero,
  pedido,
  paquete,
  mandado;

  String get displayName => switch (this) {
        WorkMode.pasajero => 'Pasajero',
        WorkMode.pedido => 'Pedido',
        WorkMode.paquete => 'Paquete',
        WorkMode.mandado => 'Mandado',
      };

  String get subtitle => switch (this) {
        WorkMode.pasajero => 'Recoge y lleva personas',
        WorkMode.pedido => 'Recoge pedidos de restaurantes',
        WorkMode.paquete => 'Entrega paquetes y encomiendas',
        WorkMode.mandado => 'Haz vueltas y compras por otros',
      };

  String get seekingLabel => switch (this) {
        WorkMode.pasajero => 'pasajeros',
        WorkMode.pedido => 'pedidos',
        WorkMode.paquete => 'paquetes a entregar',
        WorkMode.mandado => 'mandados',
      };

  IconData get icon => switch (this) {
        WorkMode.pasajero => Icons.people_alt_rounded,
        WorkMode.pedido => Icons.lunch_dining_rounded,
        WorkMode.paquete => Icons.inventory_2_rounded,
        WorkMode.mandado => Icons.run_circle_rounded,
      };

  Color get color => switch (this) {
        WorkMode.pasajero => AppColors.serviceParticular,
        WorkMode.pedido => AppColors.serviceTaxi,
        WorkMode.paquete => AppColors.serviceEnvios,
        WorkMode.mandado => AppColors.warning,
      };

  Color get containerColor => switch (this) {
        WorkMode.pasajero => AppColors.serviceParticularContainer,
        WorkMode.pedido => AppColors.serviceTaxiContainer,
        WorkMode.paquete => AppColors.serviceEnviosContainer,
        WorkMode.mandado => AppColors.warningContainer,
      };

  bool get isDelivery =>
      this == WorkMode.pedido ||
      this == WorkMode.paquete ||
      this == WorkMode.mandado;

  /// Indica si el modo implica gestionar compras / dinero del cliente.
  bool get isErrand => this == WorkMode.mandado;

  double get baseFare => switch (this) {
        WorkMode.pasajero => 4000,
        WorkMode.pedido => 3500,
        WorkMode.paquete => 3500,
        WorkMode.mandado => 6000,
      };

  double estimateFare(double distanceKm, double durationMinutes) {
    return baseFare + distanceKm * 1000 + durationMinutes * 100;
  }

  double get platformCommission => switch (this) {
        WorkMode.pasajero => 0.12,
        WorkMode.pedido => 0.13,
        WorkMode.paquete => 0.13,
        WorkMode.mandado => 0.13,
      };
}
