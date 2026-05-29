import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';

/// Tarjeta de cadena de custodia: foto en el local + prueba de entrega.
///
/// Es el diferenciador de Nexum frente a Rappi: el cliente ve evidencia de
/// que su pedido salió completo y de que llegó a sus manos.
class CustodyProofCard extends StatelessWidget {
  const CustodyProofCard({required this.order, super.key});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.cardDark : AppColors.cardLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.verified_user_rounded,
                color: AppColors.primary,
                size: 18,
              ),
              const SizedBox(width: AppConstants.spacingS),
              const Text(
                'Cadena de custodia',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              if (order.hasFullCustody)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.successContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Completa',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primaryDim,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),
          Row(
            children: [
              Expanded(
                child: _ProofSlot(
                  label: 'Salida del local',
                  captured: order.hasPickupProof,
                  icon: Icons.photo_camera_rounded,
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: _ProofSlot(
                  label: 'Entrega a ti',
                  captured: order.hasDeliveryProof,
                  icon: order.hasSignature
                      ? Icons.draw_rounded
                      : Icons.photo_camera_rounded,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ProofSlot extends StatelessWidget {
  const _ProofSlot({
    required this.label,
    required this.captured,
    required this.icon,
  });

  final String label;
  final bool captured;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AspectRatio(
          aspectRatio: 4 / 3,
          child: Container(
            decoration: BoxDecoration(
              color: captured
                  ? AppColors.primaryContainer
                  : AppColors.surfaceVariantLight,
              borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
              border: Border.all(
                color: captured ? AppColors.primary : AppColors.outlineLight,
                style: captured ? BorderStyle.solid : BorderStyle.none,
              ),
            ),
            child: Center(
              child: Icon(
                captured ? icon : Icons.hourglass_empty_rounded,
                size: 32,
                color: captured ? AppColors.primaryDim : AppColors.textTertiary,
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: captured ? null : AppColors.textTertiary,
          ),
        ),
        Text(
          captured ? 'Verificada' : 'Pendiente',
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 11,
            color: captured ? AppColors.primary : AppColors.textTertiary,
          ),
        ),
      ],
    );
  }
}
