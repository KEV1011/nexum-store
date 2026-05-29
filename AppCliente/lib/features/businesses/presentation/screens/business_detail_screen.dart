import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/providers/'
    'businesses_provider.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'business_visuals.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'product_tile.dart';
import 'package:nexum_client/features/cart/presentation/providers/'
    'cart_provider.dart';

/// Detalle del negocio: cabecera + menú agrupado por categoría.
class BusinessDetailScreen extends ConsumerWidget {
  const BusinessDetailScreen({
    required this.businessId,
    this.initialBusiness,
    super.key,
  });

  final String businessId;
  final BusinessEntity? initialBusiness;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (initialBusiness != null) {
      return _DetailView(business: initialBusiness!);
    }

    final async = ref.watch(businessByIdProvider(businessId));
    return async.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('No se pudo cargar el negocio')),
      ),
      data: (business) => _DetailView(business: business),
    );
  }
}

class _DetailView extends ConsumerWidget {
  const _DetailView({required this.business});

  final BusinessEntity business;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final cartNotifier = ref.read(cartProvider.notifier);

    final grouped = <String, List<ProductEntity>>{};
    for (final product in business.products) {
      grouped.putIfAbsent(product.category, () => []).add(product);
    }

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          _BusinessAppBar(business: business),
          for (final entry in grouped.entries) ...[
            SliverToBoxAdapter(child: _SectionHeader(title: entry.key)),
            SliverPadding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingM,
              ),
              sliver: SliverList.separated(
                itemCount: entry.value.length,
                separatorBuilder: (_, __) =>
                    const SizedBox(height: AppConstants.spacingS),
                itemBuilder: (context, i) {
                  final product = entry.value[i];
                  return ProductTile(
                    product: product,
                    quantity: cart.business?.id == business.id
                        ? cartNotifier.quantityOf(product.id)
                        : 0,
                    onAdd: () =>
                        cartNotifier.addProduct(product, business),
                    onRemove: () => cartNotifier.removeOne(product.id),
                  );
                },
              ),
            ),
          ],
          const SliverToBoxAdapter(
            child: SizedBox(height: 96),
          ),
        ],
      ),
      bottomNavigationBar: _CartBar(cart: cart),
    );
  }
}

class _BusinessAppBar extends StatelessWidget {
  const _BusinessAppBar({required this.business});

  final BusinessEntity business;

  @override
  Widget build(BuildContext context) {
    return SliverAppBar(
      pinned: true,
      expandedHeight: 180,
      flexibleSpace: FlexibleSpaceBar(
        title: Text(
          business.name,
          style: const TextStyle(
            fontFamily: 'Inter',
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
        titlePadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingXL,
          vertical: AppConstants.spacingM,
        ),
        background: ColoredBox(
          color: business.category.containerColor,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(height: AppConstants.spacingL),
              Icon(
                business.category.icon,
                size: 64,
                color: business.category.color,
              ),
              const SizedBox(height: AppConstants.spacingS),
              _InfoRow(business: business),
              const SizedBox(height: AppConstants.spacingXL),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.business});

  final BusinessEntity business;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.star_rounded, color: AppColors.star, size: 16),
        const SizedBox(width: 2),
        Text(
          business.rating.toStringAsFixed(1),
          style: const TextStyle(
            fontFamily: 'Inter',
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        _dot(),
        Text(
          '${business.etaMinutes} min',
          style: _metaStyle,
        ),
        _dot(),
        Text(
          'Envío ${CurrencyFormatter.format(business.deliveryFee)}',
          style: _metaStyle,
        ),
      ],
    );
  }

  static const _metaStyle = TextStyle(
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
  );

  Widget _dot() => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 6),
        child: Text('•', style: TextStyle(color: AppColors.textSecondary)),
      );
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppConstants.spacingM,
        AppConstants.spacingL,
        AppConstants.spacingM,
        AppConstants.spacingS,
      ),
      child: Text(
        title,
        style: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 17,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// Barra inferior que aparece cuando hay ítems en el carrito.
class _CartBar extends StatelessWidget {
  const _CartBar({required this.cart});

  final CartState cart;

  @override
  Widget build(BuildContext context) {
    if (cart.isEmpty) return const SizedBox.shrink();

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: SizedBox(
          height: 54,
          child: ElevatedButton(
            onPressed: () => context.push(AppRoutes.cart),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.25),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${cart.totalItems}',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: AppConstants.spacingM),
                const Text('Ver carrito'),
                const Spacer(),
                Text(CurrencyFormatter.format(cart.subtotal)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
