import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';

/// Resumen de costos (subtotal + domicilio + total) reutilizable.
class CartSummary extends StatelessWidget {
  const CartSummary({
    required this.subtotal,
    required this.deliveryFee,
    required this.total,
    this.intercityFee = 0,
    this.intercityLabel,
    super.key,
  });

  final double subtotal;
  final double deliveryFee;
  final double total;

  /// Flete a otra ciudad. Va en su PROPIA línea y no sumado al domicilio:
  /// son dos servicios distintos con dos destinatarios distintos —la
  /// transportadora y el repartidor—, y el cliente tiene derecho a ver por
  /// qué paga cada peso.
  final double intercityFee;

  /// «Envío a Bucaramanga». Null cuando no hay flete.
  final String? intercityLabel;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.cardDark : context.cardColor2,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : context.outlineColor,
        ),
      ),
      child: Column(
        children: [
          _Row(label: 'Subtotal', value: subtotal),
          const SizedBox(height: AppConstants.spacingS),
          if (intercityFee > 0) ...[
            _Row(label: intercityLabel ?? 'Envío', value: intercityFee),
            const SizedBox(height: AppConstants.spacingS),
          ],
          // Con flete y sin última milla el domicilio es CERO y aun así se
          // muestra: un renglón en cero dice «no te estamos cobrando esto»,
          // que es justo lo que la gente quiere comprobar.
          _Row(label: 'Domicilio', value: deliveryFee),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppConstants.spacingS),
            child: Divider(height: 1),
          ),
          _Row(label: 'Total', value: total, emphasize: true),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.value,
    this.emphasize = false,
  });

  final String label;
  final double value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontFamily: 'Inter',
      fontSize: emphasize ? 16 : 14,
      fontWeight: emphasize ? FontWeight.w700 : FontWeight.w500,
      color: emphasize ? null : context.textSecondaryColor,
    );

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: style),
        Text(CurrencyFormatter.format(value), style: style),
      ],
    );
  }
}
