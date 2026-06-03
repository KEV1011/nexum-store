import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';

/// Tipo de método de pago disponible en Nexum.
enum PaymentMethodType { card, nequi, pse, cash }

extension PaymentMethodTypeX on PaymentMethodType {
  IconData get icon => switch (this) {
        PaymentMethodType.card => Icons.credit_card_rounded,
        PaymentMethodType.nequi => Icons.account_balance_wallet_rounded,
        PaymentMethodType.pse => Icons.account_balance_rounded,
        PaymentMethodType.cash => Icons.payments_rounded,
      };

  Color get color => switch (this) {
        PaymentMethodType.nequi => const Color(0xFF7B2D8B),
        PaymentMethodType.pse => AppColors.secondary,
        PaymentMethodType.cash => AppColors.primary,
        PaymentMethodType.card => AppColors.primary,
      };
}

/// Un método de pago guardado por el cliente.
class PaymentMethod {
  const PaymentMethod({
    required this.id,
    required this.type,
    required this.label,
    required this.detail,
    this.isDefault = false,
  });

  final String id;
  final PaymentMethodType type;
  final String label;
  final String detail;
  final bool isDefault;

  PaymentMethod copyWith({bool? isDefault}) => PaymentMethod(
        id: id,
        type: type,
        label: label,
        detail: detail,
        isDefault: isDefault ?? this.isDefault,
      );
}
