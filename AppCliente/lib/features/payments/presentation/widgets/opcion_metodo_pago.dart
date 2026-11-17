import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/payments/presentation/providers/payment_method_provider.dart';
import 'package:nexum_client/features/payments/presentation/widgets/icono_metodo_pago.dart';

/// Una opción de método de pago: icono, nombre, y QUIÉN cobra.
///
/// Vive aparte porque la usan el checkout y la compra a un local sin portal:
/// dos copias acabarían diciendo cosas distintas del mismo método.
class OpcionMetodoPago extends StatelessWidget {
  const OpcionMetodoPago({
    super.key,
    required this.metodo,
    required this.selected,
    required this.onTap,
  });

  final MetodoPago metodo;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        child: Container(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.primaryContainer
                : (isDark ? AppColors.cardDark : context.cardColor2),
            borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            border: Border.all(
              color: selected
                  ? AppColors.primary
                  : (isDark
                      ? AppColors.outlineDark
                      : context.outlineColor),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              IconoMetodoPago(metodo, tamano: 34),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      metodo.etiqueta,
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: selected ? AppColors.primaryDim : null,
                      ),
                    ),
                    // Quién cobra, con todas las letras. «Nequi» a secas hace
                    // creer que lo cobra la app; lo cobra el repartidor y hay
                    // que acordar el número con él.
                    Text(
                      metodo.detalle,
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 12,
                        height: 1.25,
                        color: context.textSecondaryColor,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              if (selected)
                const Icon(
                  Icons.check_circle_rounded,
                  color: AppColors.primary,
                  size: 20,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
