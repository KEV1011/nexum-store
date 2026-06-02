import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';

enum UserRole {
  driverCar,
  driverMoto,
  business;

  String get displayName => switch (this) {
        UserRole.driverCar => 'Conductor (Carro)',
        UserRole.driverMoto => 'Conductor (Moto)',
        UserRole.business => 'Empresa',
      };

  String get apiValue => switch (this) {
        UserRole.driverCar => 'driver_car',
        UserRole.driverMoto => 'driver_moto',
        UserRole.business => 'business',
      };

  IconData get icon => switch (this) {
        UserRole.driverCar => Icons.directions_car_rounded,
        UserRole.driverMoto => Icons.two_wheeler_rounded,
        UserRole.business => Icons.business_rounded,
      };

  static UserRole fromApi(String? s) => switch (s) {
        'driver_car' => UserRole.driverCar,
        'driver_moto' => UserRole.driverMoto,
        'business' => UserRole.business,
        _ => UserRole.driverCar,
      };
}

enum UserAccountStatus {
  pending,
  approved,
  suspended,
  rejected;

  String get displayName => switch (this) {
        UserAccountStatus.pending => 'Pendiente',
        UserAccountStatus.approved => 'Aprobado',
        UserAccountStatus.suspended => 'Suspendido',
        UserAccountStatus.rejected => 'Rechazado',
      };

  Color get color => switch (this) {
        UserAccountStatus.pending => AppColors.statusPending,
        UserAccountStatus.approved => AppColors.statusApproved,
        UserAccountStatus.suspended => AppColors.statusSuspended,
        UserAccountStatus.rejected => AppColors.statusRejected,
      };

  Color get containerColor => switch (this) {
        UserAccountStatus.pending => AppColors.statusPendingContainer,
        UserAccountStatus.approved => AppColors.statusApprovedContainer,
        UserAccountStatus.suspended => AppColors.statusSuspendedContainer,
        UserAccountStatus.rejected => AppColors.statusRejectedContainer,
      };

  static UserAccountStatus fromApi(String? s) => switch (s) {
        'approved' => UserAccountStatus.approved,
        'suspended' => UserAccountStatus.suspended,
        'rejected' => UserAccountStatus.rejected,
        _ => UserAccountStatus.pending,
      };
}
