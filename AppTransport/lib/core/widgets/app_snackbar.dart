import 'package:flutter/material.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

/// Utilidad estática para mostrar [SnackBar]s estilizados en la aplicación.
///
/// Uso:
/// ```dart
/// AppSnackbar.showSuccess(context, 'Viaje completado con éxito');
/// AppSnackbar.showError(context, 'No se pudo conectar');
/// AppSnackbar.showInfo(context, 'Buscando pasajeros cercanos...');
/// ```
abstract final class AppSnackbar {
  static const Duration _defaultDuration = Duration(seconds: 3);
  static const double _borderRadius = AppConstants.radiusMedium;

  /// Muestra un [SnackBar] de éxito (fondo verde corporativo).
  static void showSuccess(BuildContext context, String message) {
    _show(
      context: context,
      message: message,
      backgroundColor: AppColors.success,
      icon: Icons.check_circle_outline_rounded,
    );
  }

  /// Muestra un [SnackBar] de error (fondo rojo).
  static void showError(BuildContext context, String message) {
    _show(
      context: context,
      message: message,
      backgroundColor: AppColors.error,
      icon: Icons.error_outline_rounded,
    );
  }

  /// Muestra un [SnackBar] informativo (fondo azul).
  static void showInfo(BuildContext context, String message) {
    _show(
      context: context,
      message: message,
      backgroundColor: AppColors.info,
      icon: Icons.info_outline_rounded,
    );
  }

  // ── Private helper ────────────────────────────────────────────────────────

  static void _show({
    required BuildContext context,
    required String message,
    required Color backgroundColor,
    required IconData icon,
    Duration duration = _defaultDuration,
  }) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: duration,
          backgroundColor: backgroundColor,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(_borderRadius),
          ),
          margin: const EdgeInsets.symmetric(
            horizontal: AppConstants.spacingM,
            vertical: AppConstants.spacingS,
          ),
          content: Row(
            children: [
              Icon(icon, color: AppColors.textOnPrimary, size: 20),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Text(
                  message,
                  style: const TextStyle(
                    color: AppColors.textOnPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
  }
}
