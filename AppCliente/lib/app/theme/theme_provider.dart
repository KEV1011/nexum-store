import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Modo oscuro DESHABILITADO temporalmente. El tema dark quedó a medias:
// ~236 fondos `Colors.white` hardcodeados en las pantallas no adaptan, así que
// el texto (ya adaptativo) queda claro sobre blanco = ilegible. Distinguir
// fondo-blanco de texto/ícono-blanco de botón NO es mecánico y necesita QA
// visual en dispositivo real. Hasta esa pasada, la app se fija en CLARO
// (100 % legible). Al rehabilitar: convertir los fondos de card a
// `context.surfaceColor` uno por uno con revisión visual, no por script.
final themeProvider = StateNotifierProvider<ThemeNotifier, ThemeMode>((ref) {
  return ThemeNotifier();
});

class ThemeNotifier extends StateNotifier<ThemeMode> {
  ThemeNotifier() : super(ThemeMode.light);

  /// No-op mientras el modo oscuro está deshabilitado.
  Future<void> setDark({required bool dark}) async {}

  bool get isDark => false;
}
