import 'package:flutter/material.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';

/// Widget que muestra un overlay semitransparente de carga encima del [child].
///
/// Cuando [isLoading] es verdadero, superpone un fondo oscuro con un
/// [CircularProgressIndicator] centrado. El [child] permanece debajo y
/// no recibe eventos de puntero mientras carga.
class LoadingOverlay extends StatelessWidget {
  const LoadingOverlay({
    required this.isLoading,
    required this.child,
    super.key,
  });

  /// Si es verdadero, muestra el overlay de carga.
  final bool isLoading;

  /// Widget hijo que se muestra siempre debajo del overlay.
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        if (isLoading)
          Positioned.fill(
            child: AbsorbPointer(
              child: ColoredBox(
                color: AppColors.overlay,
                child: const Center(
                  child: CircularProgressIndicator(
                    valueColor: AlwaysStoppedAnimation<Color>(
                      AppColors.primary,
                    ),
                    strokeWidth: 3.0,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
