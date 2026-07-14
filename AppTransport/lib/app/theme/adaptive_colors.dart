import 'package:flutter/material.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';

/// Colores que se resuelven según el brillo del tema activo.
///
/// En claro devuelven EXACTAMENTE los mismos valores que las constantes
/// `AppColors.*Light` (la UI clara no cambia ni un píxel); en oscuro devuelven
/// su contraparte `*Dark`. Es la pieza que permite el modo oscuro real sin
/// duplicar cada pantalla.
extension AdaptiveColors on BuildContext {
  bool get isDarkTheme => Theme.of(this).brightness == Brightness.dark;

  Color get surfaceColor =>
      isDarkTheme ? AppColors.surfaceDark : AppColors.surfaceLight;

  Color get backgroundColor =>
      isDarkTheme ? AppColors.backgroundDark : AppColors.backgroundLight;

  Color get cardColor2 => isDarkTheme ? AppColors.cardDark : AppColors.cardLight;

  Color get surfaceVariantColor =>
      isDarkTheme ? AppColors.surfaceVariantDark : AppColors.surfaceVariantLight;

  Color get outlineColor =>
      isDarkTheme ? AppColors.outlineDark : AppColors.outlineLight;

  Color get textPrimaryColor =>
      isDarkTheme ? AppColors.textOnDark : AppColors.textPrimary;

  Color get textSecondaryColor =>
      isDarkTheme ? AppColors.textSecondaryDark : AppColors.textSecondary;

  Color get textTertiaryColor =>
      isDarkTheme ? AppColors.textSecondaryDark : AppColors.textTertiary;

  Color get appDividerColor =>
      isDarkTheme ? AppColors.dividerDark : AppColors.divider;
}
