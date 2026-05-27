import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';

/// Botón principal de pantalla de inicio para alternar el estado del conductor.
///
/// - Desconectado → fondo verde, texto "PONERSE EN LÍNEA", icono wifi
/// - En línea      → fondo rojo,   texto "DESCONECTARSE",   icono wifi_off
///
/// Muestra un [CircularProgressIndicator] mientras [isLoading] es `true`.
/// Tiene animación de escala/rebote al ser presionado y bordes redondeados
/// de 30 dp. Cumple el mínimo de 48 dp de touch target.
class StatusToggleButton extends StatefulWidget {
  const StatusToggleButton({
    super.key,
    required this.isOnline,
    required this.isLoading,
    required this.onTap,
  });

  /// Si el conductor está actualmente en línea.
  final bool isOnline;

  /// Mientras es `true` se muestra spinner y se deshabilita el tap.
  final bool isLoading;

  /// Callback invocado cuando el usuario presiona el botón.
  final VoidCallback onTap;

  @override
  State<StatusToggleButton> createState() => _StatusToggleButtonState();
}

class _StatusToggleButtonState extends State<StatusToggleButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _scaleController;
  late final Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _scaleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 120),
      reverseDuration: const Duration(milliseconds: 200),
      lowerBound: 0.94,
      upperBound: 1.0,
    )..value = 1.0;

    _scaleAnimation = CurvedAnimation(
      parent: _scaleController,
      curve: Curves.easeOut,
      reverseCurve: Curves.elasticOut,
    );
  }

  @override
  void dispose() {
    _scaleController.dispose();
    super.dispose();
  }

  Future<void> _handleTapDown(TapDownDetails _) async {
    if (widget.isLoading) return;
    await _scaleController.reverse();
  }

  Future<void> _handleTapUp(TapUpDetails _) async {
    if (widget.isLoading) return;
    await _scaleController.forward();
    widget.onTap();
  }

  Future<void> _handleTapCancel() async {
    await _scaleController.forward();
  }

  @override
  Widget build(BuildContext context) {
    final backgroundColor =
        widget.isOnline ? AppColors.offline : AppColors.online;
    final label =
        widget.isOnline ? 'DESCONECTARSE' : 'PONERSE EN LÍNEA';
    final icon = widget.isOnline ? Icons.wifi_off_rounded : Icons.wifi_rounded;

    return ScaleTransition(
      scale: _scaleAnimation,
      child: GestureDetector(
        onTapDown: _handleTapDown,
        onTapUp: _handleTapUp,
        onTapCancel: _handleTapCancel,
        child: SizedBox(
          width: double.infinity,
          height: 60,
          child: Material(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(30),
            elevation: 4,
            shadowColor: backgroundColor.withAlpha(102),
            child: InkWell(
              borderRadius: BorderRadius.circular(30),
              onTap: widget.isLoading ? null : widget.onTap,
              child: Container(
                constraints: const BoxConstraints(minHeight: 48),
                alignment: Alignment.center,
                child: widget.isLoading
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          valueColor:
                              AlwaysStoppedAnimation<Color>(Colors.white),
                          strokeWidth: 2.5,
                        ),
                      )
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            icon,
                            color: Colors.white,
                            size: 22,
                          ),
                          const SizedBox(width: 10),
                          Text(
                            label,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                              letterSpacing: 1.2,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
