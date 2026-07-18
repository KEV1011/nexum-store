import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/safe_back.dart';

/// Método de pago preferido del cliente. El cobro real ocurre en el checkout
/// (efectivo al conductor o pago en línea con Wompi: tarjeta/Nequi/PSE); aquí
/// se elige la preferencia por defecto que llega preseleccionada al pagar.
enum PayMethod { cash, online }

const _kPrefKey = 'nx_pay_method';

final payMethodProvider =
    StateNotifierProvider<PayMethodNotifier, PayMethod>((ref) {
  return PayMethodNotifier();
});

class PayMethodNotifier extends StateNotifier<PayMethod> {
  PayMethodNotifier() : super(PayMethod.cash) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getString(_kPrefKey);
    if (v == 'online') state = PayMethod.online;
  }

  Future<void> set(PayMethod m) async {
    state = m;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kPrefKey, m == PayMethod.online ? 'online' : 'cash');
  }
}

class PaymentMethodsScreen extends ConsumerWidget {
  const PaymentMethodsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(payMethodProvider);
    final notifier = ref.read(payMethodProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Métodos de pago'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => safeBack(context),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          Text(
            'Elige tu método preferido. Al pagar un servicio llegará '
            'preseleccionado; siempre puedes cambiarlo en el momento.',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 13,
              color: context.textSecondaryColor,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          _MethodCard(
            icon: Icons.payments_rounded,
            title: 'Efectivo',
            subtitle: 'Le pagas directo al conductor al terminar.',
            selected: selected == PayMethod.cash,
            onTap: () => notifier.set(PayMethod.cash),
          ),
          const SizedBox(height: AppConstants.spacingS),
          _MethodCard(
            icon: Icons.credit_card_rounded,
            title: 'Pago en línea',
            subtitle: 'Tarjeta, Nequi o PSE con Wompi (seguro, de Bancolombia).',
            selected: selected == PayMethod.online,
            onTap: () => notifier.set(PayMethod.online),
          ),
          const SizedBox(height: AppConstants.spacingL),
          Container(
            padding: const EdgeInsets.all(AppConstants.spacingM),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            ),
            child: Row(
              children: [
                const Icon(Icons.lock_rounded,
                    size: 18, color: AppColors.primaryDim),
                const SizedBox(width: AppConstants.spacingS),
                Expanded(
                  child: Text(
                    'Tus pagos en línea se procesan por Wompi, vigilado por la '
                    'Superintendencia Financiera. ZIPA no almacena tu tarjeta.',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 12,
                      color: AppColors.primaryDim,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MethodCard extends StatelessWidget {
  const _MethodCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      child: Container(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        decoration: BoxDecoration(
          color: isDark ? AppColors.cardDark : context.cardColor2,
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: Border.all(
            color: selected ? AppColors.primary : context.outlineColor,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, color: AppColors.primary),
            const SizedBox(width: AppConstants.spacingM),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 12,
                      color: context.textSecondaryColor,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              selected
                  ? Icons.radio_button_checked_rounded
                  : Icons.radio_button_unchecked_rounded,
              color: selected ? AppColors.primary : context.textTertiaryColor,
            ),
          ],
        ),
      ),
    );
  }
}
