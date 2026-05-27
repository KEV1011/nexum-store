import 'package:flutter/material.dart';

/// Paleta de colores de la aplicación Nexum Driver.
/// Verde corporativo (#00C853) asociado a "en línea" y ganancias.
/// Azul oscuro (#1A237E) como color secundario institucional.
abstract final class AppColors {
  // Colores primarios
  static const Color primary = Color(0xFF00C853);
  static const Color primaryDark = Color(0xFF00952F);
  static const Color primaryLight = Color(0xFF5EFF82);

  // Colores secundarios
  static const Color secondary = Color(0xFF1A237E);
  static const Color secondaryDark = Color(0xFF000051);
  static const Color secondaryLight = Color(0xFF534BAE);

  // Estados del conductor
  static const Color online = Color(0xFF00C853);
  static const Color offline = Color(0xFFE53935);
  static const Color waiting = Color(0xFFFF9800);

  // Superficies - Modo claro
  static const Color surfaceLight = Color(0xFFF8F9FA);
  static const Color backgroundLight = Color(0xFFFFFFFF);
  static const Color cardLight = Color(0xFFFFFFFF);

  // Superficies - Modo oscuro
  static const Color surfaceDark = Color(0xFF1E1E2E);
  static const Color backgroundDark = Color(0xFF121212);
  static const Color cardDark = Color(0xFF2A2A3E);

  // Texto
  static const Color textPrimary = Color(0xFF212121);
  static const Color textSecondary = Color(0xFF757575);
  static const Color textOnPrimary = Color(0xFFFFFFFF);
  static const Color textOnDark = Color(0xFFE0E0E0);

  // Semánticos
  static const Color success = Color(0xFF00C853);
  static const Color error = Color(0xFFE53935);
  static const Color warning = Color(0xFFFF9800);
  static const Color info = Color(0xFF1976D2);

  // Mapa
  static const Color routeColor = Color(0xFF1A237E);
  static const Color pickupMarker = Color(0xFF00C853);
  static const Color destinationMarker = Color(0xFFE53935);

  // Otros
  static const Color divider = Color(0xFFE0E0E0);
  static const Color shadow = Color(0x1A000000);
  static const Color star = Color(0xFFFFC107);
  static const Color overlay = Color(0x80000000);
}
