import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/payment_methods/domain/payment_method.dart';
import 'package:nexum_client/features/payment_methods/presentation/providers/'
    'payment_methods_provider.dart';

/// Fila compacta que muestra el método de pago seleccionado y permite
/// cambiarlo. Pensada para colocarse encima del botón de confirmar en las
/// pantallas de reserva (transporte, intermunicipal, mandados, etc.).
///
/// Al tocarla navega a la pantalla de métodos de pago, donde el cliente puede
/// elegir el predeterminado; al volver, la fila refleja la nueva selección.
class PaymentMethodRow extends ConsumerWidget {
  const PaymentMethodRow({super.key, this.dark = false});

  /// Variante para pantallas de fondo oscuro (p. ej. viajes intermunicipales).
  final bool dark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final method = ref.watch(selectedPaymentMethodProvider);
    final surface = dark ? const Color(0xFF1E293B) : AppColors.surfaceLight;
    final border = dark ? const Color(0xFF334155) : AppColors.outlineLight;
    final titleColor =
        dark ? const Color(0xFFF1F5F9) : AppColors.textPrimary;
    final labelColor =
        dark ? const Color(0xFF94A3B8) : AppColors.textSecondary;

    return InkWell(
      onTap: () => context.push(AppRoutes.paymentMethods),
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: 12,
        ),
        decoration: BoxDecoration(
          color: surface,
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: Border.all(color: border),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: method.type.color.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(method.type.icon, color: method.type.color, size: 20),
            ),
            const SizedBox(width: AppConstants.spacingM),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Método de pago',
                    style: TextStyle(
                      fontSize: 11,
                      color: labelColor,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    method.label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: titleColor,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const Text(
              'Cambiar',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.primary,
              ),
            ),
            const Icon(
              Icons.chevron_right_rounded,
              color: AppColors.primary,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}
