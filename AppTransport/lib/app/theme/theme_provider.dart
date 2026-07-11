import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Modo oscuro DESHABILITADO temporalmente: el tema dark está a medias y
// varios textos quedan ilegibles (reporte del usuario). La app se fija en
// claro hasta completar el pase de contraste; el switch de ajustes queda
// como "Próximamente". Al rehabilitarlo, restaurar la persistencia con
// SharedPreferences (ver historial git).

final themeProvider = StateNotifierProvider<ThemeNotifier, ThemeMode>((ref) {
  return ThemeNotifier();
});

class ThemeNotifier extends StateNotifier<ThemeMode> {
  ThemeNotifier() : super(ThemeMode.light);

  /// No-op mientras el modo oscuro está deshabilitado.
  Future<void> setDark({required bool dark}) async {}

  bool get isDark => false;
}
