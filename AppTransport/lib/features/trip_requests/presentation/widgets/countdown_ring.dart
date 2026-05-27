import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

/// Anillo de cuenta regresiva animado para la solicitud de viaje.
///
/// Muestra un arco que decrementa suavemente representando el tiempo
/// restante. El color cambia según la urgencia:
///   - > 8 s  → verde  [AppColors.online]
///   - 4–8 s  → naranja [AppColors.warning]
///   - < 4 s  → rojo   [AppColors.offline]
///
/// El número de segundos restantes se muestra en el centro del anillo.
class CountdownRing extends StatelessWidget {
  const CountdownRing({
    super.key,
    required this.secondsRemaining,
    this.size = 64,
    this.strokeWidth = 5,
  });

  /// Segundos restantes (0 – [AppConstants.tripRequestTimeoutSeconds]).
  final int secondsRemaining;

  /// Diámetro del widget en dp (por defecto 64).
  final double size;

  /// Grosor del arco en dp (por defecto 5).
  final double strokeWidth;

  static const int _totalSeconds = AppConstants.tripRequestTimeoutSeconds;

  Color _colorForSeconds(int seconds) {
    if (seconds > 8) return AppColors.online;
    if (seconds >= 4) return AppColors.warning;
    return AppColors.offline;
  }

  @override
  Widget build(BuildContext context) {
    final progress = secondsRemaining / _totalSeconds;
    final color = _colorForSeconds(secondsRemaining);

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // ── Track (fondo gris) ────────────────────────────────────────────
          SizedBox.expand(
            child: CircularProgressIndicator(
              value: 1.0,
              strokeWidth: strokeWidth,
              valueColor: AlwaysStoppedAnimation<Color>(
                AppColors.divider,
              ),
            ),
          ),

          // ── Arco animado ──────────────────────────────────────────────────
          SizedBox.expand(
            child: TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: progress, end: progress),
              duration: const Duration(milliseconds: 800),
              curve: Curves.easeOut,
              builder: (context, value, child) {
                return CircularProgressIndicator(
                  value: value,
                  strokeWidth: strokeWidth,
                  strokeCap: StrokeCap.round,
                  valueColor: AlwaysStoppedAnimation<Color>(color),
                );
              },
            ),
          ),

          // ── Contador central ──────────────────────────────────────────────
          AnimatedDefaultTextStyle(
            duration: const Duration(milliseconds: 300),
            style: TextStyle(
              fontSize: size * 0.34,
              fontWeight: FontWeight.w800,
              color: color,
              height: 1,
            ),
            child: Text(
              '$secondsRemaining',
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}
