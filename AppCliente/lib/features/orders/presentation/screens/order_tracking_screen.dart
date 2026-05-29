import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';
import 'package:nexum_client/features/orders/presentation/providers/'
    'orders_provider.dart';
import 'package:nexum_client/features/orders/presentation/widgets/'
    'custody_proof_card.dart';
import 'package:nexum_client/features/orders/presentation/widgets/'
    'order_status_timeline.dart';
import 'package:nexum_client/features/orders/presentation/widgets/'
    'rating_bottom_sheet.dart';

/// Seguimiento en vivo del pedido con su cadena de custodia.
class OrderTrackingScreen extends ConsumerStatefulWidget {
  const OrderTrackingScreen({required this.orderId, super.key});

  final String orderId;

  @override
  ConsumerState<OrderTrackingScreen> createState() =>
      _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends ConsumerState<OrderTrackingScreen> {
  bool _ratingShown = false;
  CustomerOrderEntity? _pendingRatingOrder;

  @override
  Widget build(BuildContext context) {
    final order = ref.watch(orderByIdProvider(widget.orderId));

    ref.listen(orderByIdProvider(widget.orderId), (prev, next) {
      if (next == null || !next.isDelivered || next.isRated) return;
      if (prev != null && prev.isDelivered) return;
      if (_ratingShown) return;
      _ratingShown = true;
      _pendingRatingOrder = next;
    });

    if (_pendingRatingOrder != null) {
      final pending = _pendingRatingOrder!;
      _pendingRatingOrder = null;
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        showRatingSheet(context, pending);
      });
    }

    if (order == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Pedido no encontrado')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('Pedido ${order.orderRef}'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.go(AppRoutes.home),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          _StatusHeader(order: order),
          const SizedBox(height: AppConstants.spacingL),
          if (order.driverName != null) ...[
            _DriverCard(order: order),
            const SizedBox(height: AppConstants.spacingM),
          ],
          CustodyProofCard(order: order),
          const SizedBox(height: AppConstants.spacingL),
          _Card(
            child: OrderStatusTimeline(status: order.status),
          ),
          if (order.isDelivered) ...[
            const SizedBox(height: AppConstants.spacingL),
            _RatingCard(order: order),
          ],
          const SizedBox(height: AppConstants.spacingL),
          _OrderSummary(order: order),
        ],
      ),
    );
  }
}

class _RatingCard extends StatelessWidget {
  const _RatingCard({required this.order});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    if (order.isRated) {
      return _Card(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(
                  Icons.star_rounded,
                  color: AppColors.star,
                  size: 18,
                ),
                SizedBox(width: AppConstants.spacingS),
                Text(
                  'Tu calificación',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingS),
            RatingDisplay(rating: order.rating!),
            if (order.ratingComment != null) ...[
              const SizedBox(height: AppConstants.spacingS),
              Text(
                order.ratingComment!,
                style: const TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 14,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ],
        ),
      );
    }

    return _Card(
      child: Row(
        children: [
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '¿Cómo estuvo tu pedido?',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Tu opinión ayuda a mejorar el servicio',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 13,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Builder(
            builder: (ctx) => OutlinedButton(
              onPressed: () => showRatingSheet(ctx, order),
              child: const Text('Calificar'),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({required this.order});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingL),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primaryDim],
        ),
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                order.isDelivered
                    ? Icons.check_circle_rounded
                    : Icons.delivery_dining_rounded,
                color: Colors.white,
                size: 28,
              ),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Text(
                  order.status.label,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingS),
          Text(
            order.isDelivered
                ? 'Tu pedido de ${order.businessName} fue entregado.'
                : order.etaMinutes != null
                    ? 'Llega en ~${order.etaMinutes} min desde '
                        '${order.businessName}'
                    : 'Preparando tu pedido de ${order.businessName}',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 14,
              color: Colors.white.withValues(alpha: 0.9),
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverCard extends StatelessWidget {
  const _DriverCard({required this.order});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: AppColors.primaryContainer,
            child: Text(
              order.driverName!.substring(0, 1),
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.primaryDim,
              ),
            ),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.driverName!,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Text(
                  'Tu repartidor',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 13,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          _CircleAction(
            icon: Icons.call_rounded,
            onTap: () => AppSnackbar.showInfo(
              context,
              'Llamando a ${order.driverName}…',
            ),
          ),
          const SizedBox(width: AppConstants.spacingS),
          _CircleAction(
            icon: Icons.chat_rounded,
            onTap: () =>
                AppSnackbar.showInfo(context, 'Chat no disponible en demo'),
          ),
        ],
      ),
    );
  }
}

class _CircleAction extends StatelessWidget {
  const _CircleAction({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: const BoxDecoration(
          color: AppColors.primaryContainer,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 20, color: AppColors.primaryDim),
      ),
    );
  }
}

class _OrderSummary extends StatelessWidget {
  const _OrderSummary({required this.order});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Detalle del pedido',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          ...order.lines.map(
            (line) => Padding(
              padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
              child: Row(
                children: [
                  Text(
                    '${line.quantity}×',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(width: AppConstants.spacingS),
                  Expanded(
                    child: Text(
                      line.productName,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 14,
                      ),
                    ),
                  ),
                  Text(
                    CurrencyFormatter.format(line.subtotal),
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const Divider(height: AppConstants.spacingL),
          _SummaryRow(label: 'Subtotal', value: order.subtotal),
          const SizedBox(height: 4),
          _SummaryRow(label: 'Domicilio', value: order.deliveryFee),
          const SizedBox(height: 4),
          _SummaryRow(label: 'Total', value: order.total, emphasize: true),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
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
      color: emphasize ? null : AppColors.textSecondary,
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

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

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
      child: child,
    );
  }
}
