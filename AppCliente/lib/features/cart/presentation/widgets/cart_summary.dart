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
    super.key,
  });

  final double subtotal;
  final double deliveryFee;
  final double total;

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
