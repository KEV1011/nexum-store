import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/cart/presentation/providers/'
    'cart_provider.dart';
import 'package:nexum_client/features/cart/presentation/widgets/'
    'cart_summary.dart';

/// Pantalla del carrito: revisión de ítems antes del checkout.
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final notifier = ref.read(cartProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tu carrito'),
        actions: [
          if (!cart.isEmpty)
            TextButton(
              onPressed: notifier.clear,
              child: const Text('Vaciar'),
            ),
        ],
      ),
      body: cart.isEmpty ? const _EmptyCart() : _CartContent(cart: cart),
      bottomNavigationBar: cart.isEmpty
          ? null
          : _CheckoutBar(
              total: cart.total,
              onCheckout: () => context.push(AppRoutes.checkout),
            ),
    );
  }
}

class _CartContent extends ConsumerWidget {
  const _CartContent({required this.cart});

  final CartState cart;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(cartProvider.notifier);

    return ListView(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      children: [
        _BusinessBanner(name: cart.business?.name ?? ''),
        const SizedBox(height: AppConstants.spacingM),
        ...cart.items.map(
          (item) => Padding(
            padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
            child: _CartLine(
              item: item,
              onAdd: () =>
                  notifier.addProduct(item.product, cart.business!),
              onRemove: () => notifier.removeOne(item.product.id),
            ),
          ),
        ),
        const SizedBox(height: AppConstants.spacingM),
        CartSummary(
          subtotal: cart.subtotal,
          deliveryFee: cart.deliveryFee,
          total: cart.total,
        ),
      ],
    );
  }
}

class _BusinessBanner extends StatelessWidget {
  const _BusinessBanner({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.primaryContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.storefront_rounded,
            color: AppColors.primaryDim,
            size: 20,
          ),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Text(
              name,
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.primaryDim,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CartLine extends StatelessWidget {
  const _CartLine({
    required this.item,
    required this.onAdd,
    required this.onRemove,
  });

  final CartItem item;
  final VoidCallback onAdd;
  final VoidCallback onRemove;

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
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.product.name,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  CurrencyFormatter.format(item.product.price),
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 13,
                    color: context.textSecondaryColor,
                  ),
                ),
              ],
            ),
          ),
          Row(
            children: [
              IconButton(
                onPressed: onRemove,
                icon: Icon(
                  item.quantity == 1
                      ? Icons.delete_outline_rounded
                      : Icons.remove_circle_outline_rounded,
                  color: context.textSecondaryColor,
                ),
              ),
              Text(
                '${item.quantity}',
                style: const TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              IconButton(
                onPressed: onAdd,
                icon: const Icon(
                  Icons.add_circle_rounded,
                  color: AppColors.primary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CheckoutBar extends StatelessWidget {
  const _CheckoutBar({required this.total, required this.onCheckout});

  final double total;
  final VoidCallback onCheckout;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: SizedBox(
          height: 54,
          child: ElevatedButton(
            onPressed: onCheckout,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('Continuar  •  '),
                Text(CurrencyFormatter.format(total)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyCart extends StatelessWidget {
  const _EmptyCart();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.shopping_cart_outlined,
            size: 64,
            color: context.textTertiaryColor,
          ),
          const SizedBox(height: AppConstants.spacingM),
          const Text(
            'Tu carrito está vacío',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppConstants.spacingXS),
          Text(
            'Agrega productos desde un negocio',
            style: TextStyle(color: context.textSecondaryColor),
          ),
          const SizedBox(height: AppConstants.spacingL),
          OutlinedButton(
            onPressed: () => context.go(AppRoutes.home),
            child: const Text('Explorar negocios'),
          ),
        ],
      ),
    );
  }
}
