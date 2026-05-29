import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/date_formatter.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';
import 'package:nexum_client/features/orders/presentation/providers/'
    'orders_provider.dart';
import 'package:nexum_client/features/orders/presentation/widgets/'
    'rating_bottom_sheet.dart';
import 'package:nexum_client/shared/widgets/skeleton_loader.dart';

/// Pestaña "Pedidos": activos arriba, historial debajo.
class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(ordersProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Mis pedidos')),
      body: state.isLoading
          ? _buildLoading()
          : state.orders.isEmpty
              ? const _EmptyOrders()
              : _buildList(context, state),
    );
  }

  Widget _buildLoading() {
    return ListView.separated(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      itemCount: 4,
      separatorBuilder: (_, __) =>
          const SizedBox(height: AppConstants.spacingM),
      itemBuilder: (_, __) => const SkeletonLoader(child: SkeletonTripTile()),
    );
  }

  Widget _buildList(BuildContext context, OrdersState state) {
    final active = state.active;
    final past = state.past;

    return ListView(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      children: [
        if (active.isNotEmpty) ...[
          const _SectionLabel(label: 'En curso'),
          ...active.map(
            (o) => Padding(
              padding: const EdgeInsets.only(bottom: AppConstants.spacingM),
              child: _OrderCard(order: o),
            ),
          ),
        ],
        if (past.isNotEmpty) ...[
          const _SectionLabel(label: 'Historial'),
          ...past.map(
            (o) => Padding(
              padding: const EdgeInsets.only(bottom: AppConstants.spacingM),
              child: _OrderCard(order: o),
            ),
          ),
        ],
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
      child: Text(
        label,
        style: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 16,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Material(
      color: isDark ? AppColors.cardDark : AppColors.cardLight,
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      child: InkWell(
        onTap: () => context.push(AppRoutes.orderPath(order.id)),
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        child: Container(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          decoration: BoxDecoration(
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
                  Expanded(
                    child: Text(
                      order.businessName,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  _StatusBadge(order: order),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                '${order.orderRef}  •  '
                '${DateFormatter.formatRelativeDate(order.createdAt)}',
                style: const TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 13,
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: AppConstants.spacingS),
              Row(
                children: [
                  const Icon(
                    Icons.shopping_bag_outlined,
                    size: 15,
                    color: AppColors.textSecondary,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${order.lines.length} producto(s)',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    CurrencyFormatter.format(order.total),
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              if (order.hasFullCustody || order.isRated) ...[
                const SizedBox(height: AppConstants.spacingS),
                Row(
                  children: [
                    if (order.hasFullCustody) ...[
                      const Icon(
                        Icons.verified_user_rounded,
                        size: 14,
                        color: AppColors.primary,
                      ),
                      const SizedBox(width: 4),
                      const Text(
                        'Custodia verificada',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                        ),
                      ),
                      if (order.isRated)
                        const SizedBox(width: AppConstants.spacingM),
                    ],
                    if (order.isRated)
                      RatingDisplay(rating: order.rating!, small: true),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.order});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg) = switch (true) {
      _ when order.isCancelled => (
          'Cancelado',
          AppColors.errorContainer,
          AppColors.error,
        ),
      _ when order.isDelivered => (
          'Entregado',
          AppColors.surfaceVariantLight,
          AppColors.textSecondary,
        ),
      _ => ('En curso', AppColors.primaryContainer, AppColors.primaryDim),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: fg,
        ),
      ),
    );
  }
}

class _EmptyOrders extends StatelessWidget {
  const _EmptyOrders();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.receipt_long_outlined,
            size: 64,
            color: AppColors.textTertiary,
          ),
          const SizedBox(height: AppConstants.spacingM),
          const Text(
            'Aún no tienes pedidos',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppConstants.spacingXS),
          const Text(
            'Haz tu primer pedido desde un negocio',
            style: TextStyle(color: AppColors.textSecondary),
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
