import 'package:flutter/services.dart';

/// Servicio de notificaciones y retroalimentación háptica/sonora.
/// Usado principalmente cuando llega una solicitud de viaje nueva.
class NotificationService {
  NotificationService._();
  static final NotificationService _instance = NotificationService._();

  /// Returns the singleton instance.
  factory NotificationService() => _instance;

  // ── Haptic feedback ───────────────────────────────────────────────────────

  /// Vibra el dispositivo con el patrón de solicitud de viaje.
  ///
  /// Patrón: impulso pesado × 3 con 200 ms de pausa entre cada uno.
  /// Diseñado para llamar la atención del conductor aun con pantalla apagada.
  Future<void> vibrateForTripRequest() async {
    try {
      // Patrón de vibración para solicitud nueva
      await HapticFeedback.heavyImpact();
      await Future.delayed(const Duration(milliseconds: 200));
      await HapticFeedback.heavyImpact();
      await Future.delayed(const Duration(milliseconds: 200));
      await HapticFeedback.heavyImpact();
    } catch (_) {
      // Silenciar si el dispositivo no soporta vibración
    }
  }

  /// Vibración de confirmación (aceptar viaje).
  Future<void> vibrateSuccess() async {
    try {
      await HapticFeedback.mediumImpact();
    } catch (_) {
      // Ignorar si no hay soporte
    }
  }

  /// Vibración ligera (feedback de UI).
  Future<void> vibrateLightImpact() async {
    try {
      await HapticFeedback.lightImpact();
    } catch (_) {
      // Ignorar si no hay soporte
    }
  }

  /// Vibración de selección (feedback sutil para toggles, switches, etc.).
  Future<void> vibrateSelection() async {
    try {
      await HapticFeedback.selectionClick();
    } catch (_) {
      // Ignorar si no hay soporte
    }
  }

  // ── Audio feedback ────────────────────────────────────────────────────────

  /// Reproduce sonido de solicitud de viaje.
  ///
  /// TODO(backend): Implementar con audioplayers package cuando se
  /// incluyan assets de audio en la siguiente fase.
  Future<void> playTripRequestSound() async {
    // Mock: solo vibración por ahora
    await vibrateForTripRequest();
  }

  /// Reproduce sonido de confirmación (viaje aceptado).
  ///
  /// TODO(backend): Implementar con audioplayers package en la siguiente fase.
  Future<void> playSuccessSound() async {
    // Mock: vibración de confirmación por ahora
    await vibrateSuccess();
  }
}
