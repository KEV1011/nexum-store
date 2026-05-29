import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/cart/presentation/providers/'
    'cart_provider.dart';
import 'package:nexum_client/features/cart/presentation/widgets/'
    'cart_summary.dart';
import 'package:nexum_client/features/orders/presentation/providers/'
    'orders_provider.dart';

/// Métodos de pago disponibles (mock para MVP).
enum PaymentMethod { cash, card, nequi }

extension on PaymentMethod {
  String get label {
    switch (this) {
      case PaymentMethod.cash:
        return 'Efectivo';
      case PaymentMethod.card:
        return 'Tarjeta';
      case PaymentMethod.nequi:
        return 'Nequi';
    }
  }

  IconData get icon {
    switch (this) {
      case PaymentMethod.cash:
        return Icons.payments_rounded;
      case PaymentMethod.card:
        return Icons.credit_card_rounded;
      case PaymentMethod.nequi:
        return Icons.phone_android_rounded;
    }
  }
}

/// Pantalla de confirmación: dirección, pago y envío del pedido.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _addressController =
      TextEditingController(text: 'Calle 6 #2-30, Barrio Belén');
  final _notesController = TextEditingController();
  PaymentMethod _payment = PaymentMethod.cash;
  bool _placing = false;

  @override
  void dispose() {
    _addressController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _placeOrder(CartState cart) async {
    if (_addressController.text.trim().isEmpty) {
      AppSnackbar.showError(context, 'Ingresa una dirección de entrega');
      return;
    }

    setState(() => _placing = true);
    await Future<void>.delayed(const Duration(milliseconds: 800));
    if (!mounted) return;

    final orderId = await ref.read(ordersProvider.notifier).placeOrder(
          cart: cart,
          deliveryAddress: _addressController.text.trim(),
        );
    if (!mounted) return;
    ref.read(cartProvider.notifier).clear();

    context.go(AppRoutes.orderPath(orderId));
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);

    if (cart.isEmpty) {
      // El carrito quedó vacío (p. ej. tras enviar el pedido).
      return Scaffold(
        appBar: AppBar(title: const Text('Confirmar pedido')),
        body: const Center(child: Text('No hay nada por confirmar')),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Confirmar pedido')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          const _SectionTitle(
            icon: Icons.location_on_rounded,
            title: 'Dirección de entrega',
          ),
          const SizedBox(height: AppConstants.spacingS),
          TextField(
            controller: _addressController,
            decoration: const InputDecoration(
              hintText: 'Calle, número, barrio',
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),
          TextField(
            controller: _notesController,
            decoration: const InputDecoration(
              hintText: 'Indicaciones (opcional): apto, color de puerta…',
            ),
            maxLines: 2,
          ),
          const SizedBox(height: AppConstants.spacingL),
          const _SectionTitle(
            icon: Icons.account_balance_wallet_rounded,
            title: 'Método de pago',
          ),
          const SizedBox(height: AppConstants.spacingS),
          ...PaymentMethod.values.map(
            (method) => _PaymentOption(
              method: method,
              selected: _payment == method,
              onTap: () => setState(() => _payment = method),
            ),
          ),
          const SizedBox(height: AppConstants.spacingL),
          const _SectionTitle(
            icon: Icons.receipt_long_rounded,
            title: 'Resumen',
          ),
          const SizedBox(height: AppConstants.spacingS),
          CartSummary(
            subtotal: cart.subtotal,
            deliveryFee: cart.deliveryFee,
            total: cart.total,
          ),
          const SizedBox(height: AppConstants.spacingM),
          const _CustodyNotice(),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          child: SizedBox(
            height: 54,
            child: ElevatedButton(
              onPressed: _placing ? null : () => _placeOrder(cart),
              child: _placing
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        valueColor: AlwaysStoppedAnimation(Colors.white),
                      ),
                    )
                  : const Text('Realizar pedido'),
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.primary),
        const SizedBox(width: AppConstants.spacingS),
        Text(
          title,
          style: const TextStyle(
            fontFamily: 'Inter',
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _PaymentOption extends StatelessWidget {
  const _PaymentOption({
    required this.method,
    required this.selected,
    required this.onTap,
  });

  final PaymentMethod method;
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
                : (isDark ? AppColors.cardDark : AppColors.cardLight),
            borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            border: Border.all(
              color: selected
                  ? AppColors.primary
                  : (isDark
                      ? AppColors.outlineDark
                      : AppColors.outlineLight),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(
                method.icon,
                size: 20,
                color: selected
                    ? AppColors.primaryDim
                    : AppColors.textSecondary,
              ),
              const SizedBox(width: AppConstants.spacingM),
              Text(
                method.label,
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: selected ? AppColors.primaryDim : null,
                ),
              ),
              const Spacer(),
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

/// Aviso del diferenciador anti-Rappi: foto de custodia en el local.
class _CustodyNotice extends StatelessWidget {
  const _CustodyNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.infoContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: const Row(
        children: [
          Icon(Icons.verified_user_rounded, color: AppColors.info, size: 20),
          SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Text(
              'Verás la foto de tu pedido al salir del local y la prueba '
              'de entrega. Tu domicilio, con cadena de custodia.',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 12.5,
                height: 1.35,
                color: AppColors.secondaryDark,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
