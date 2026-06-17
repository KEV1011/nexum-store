import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';
import 'package:nexum_client/features/orders/presentation/providers/'
    'orders_provider.dart';
import 'package:nexum_client/features/orders/presentation/screens/'
    'order_chat_screen.dart';
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
          if (order.status != CustomerOrderStatus.confirmed &&
              !order.isDelivered) ...[
            _TrackingMap(order: order),
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
          if (order.status == CustomerOrderStatus.confirmed) ...[
            const SizedBox(height: AppConstants.spacingM),
            _CancelButton(onCancel: () => _confirmCancel(context)),
          ],
        ],
      ),
    );
  }

  void _confirmCancel(BuildContext context) {
    final router = GoRouter.of(context);
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text(
          'Cancelar pedido',
          style: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w700),
        ),
        content: const Text(
          '¿Seguro que deseas cancelar tu pedido?',
          style: TextStyle(fontFamily: 'Inter'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('No, mantener'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text(
              'Sí, cancelar',
              style: TextStyle(color: AppColors.error),
            ),
          ),
        ],
      ),
    ).then((confirmed) {
      if (confirmed ?? false) {
        ref.read(ordersProvider.notifier).cancelOrder(widget.orderId);
        router.go(AppRoutes.home);
      }
    });
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
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => OrderChatScreen(
                  orderId: order.id,
                  peerName: order.driverName ?? 'Repartidor',
                ),
              ),
            ),
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

// ── Mapa de seguimiento ──────────────────────────────────────────────────────

class _TrackingMap extends StatefulWidget {
  const _TrackingMap({required this.order});

  final CustomerOrderEntity order;

  @override
  State<_TrackingMap> createState() => _TrackingMapState();
}

class _TrackingMapState extends State<_TrackingMap>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final LatLng _businessPos;
  late final LatLng _deliveryPos;
  late final LatLng _mapCenter;

  static const _pamplonaCenter = LatLng(7.3762, -72.6465);

  static const _animDurations = {
    CustomerOrderStatus.driverToPickup: Duration(seconds: 7),
    CustomerOrderStatus.inTransit: Duration(seconds: 10),
  };

  @override
  void initState() {
    super.initState();
    final bh = widget.order.businessName.hashCode.abs();
    final dh = widget.order.deliveryAddress.hashCode.abs();
    _businessPos = LatLng(
      7.3762 + (bh % 100) * 0.00008,
      -72.6465 - (bh % 137) * 0.00007,
    );
    _deliveryPos = LatLng(
      7.3820 + (dh % 60) * 0.00008,
      -72.6512 - (dh % 50) * 0.00006,
    );
    _mapCenter = LatLng(
      (_businessPos.latitude + _deliveryPos.latitude) / 2,
      (_businessPos.longitude + _deliveryPos.longitude) / 2,
    );
    final dur = _animDurations[widget.order.status] ??
        const Duration(seconds: 10);
    _ctrl = AnimationController(vsync: this, duration: dur);
    _startForStatus(widget.order.status);
  }

  @override
  void didUpdateWidget(_TrackingMap old) {
    super.didUpdateWidget(old);
    final s = widget.order.status;
    if (s == old.order.status) return;
    final dur = _animDurations[s];
    if (dur != null) {
      _ctrl
        ..duration = dur
        ..forward(from: 0);
    } else {
      _ctrl.stop();
    }
  }

  void _startForStatus(CustomerOrderStatus s) {
    if (_animDurations.containsKey(s)) _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  LatLng _lerp(LatLng a, LatLng b, double t) => LatLng(
        a.latitude + (b.latitude - a.latitude) * t,
        a.longitude + (b.longitude - a.longitude) * t,
      );

  LatLng _driverPos(double t) => switch (widget.order.status) {
        CustomerOrderStatus.driverToPickup =>
          _lerp(_pamplonaCenter, _businessPos, t),
        CustomerOrderStatus.atPickup => _businessPos,
        _ => _lerp(_businessPos, _deliveryPos, t),
      };

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      child: SizedBox(
        height: 220,
        child: FlutterMap(
          options: MapOptions(
            initialCenter: _mapCenter,
            initialZoom: 15.2,
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
            ),
          ),
          children: [
            TileLayer(
              urlTemplate:
                  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.nexum.cliente',
            ),
            AnimatedBuilder(
              animation: _ctrl,
              builder: (_, __) => MarkerLayer(
                markers: [
                  Marker(
                    point: _businessPos,
                    width: 36,
                    height: 36,
                    child: const _MapPin(
                      icon: Icons.restaurant_rounded,
                      color: AppColors.primaryDim,
                      bgColor: AppColors.primaryContainer,
                    ),
                  ),
                  Marker(
                    point: _deliveryPos,
                    width: 36,
                    height: 36,
                    child: const _MapPin(
                      icon: Icons.home_rounded,
                      color: AppColors.error,
                      bgColor: AppColors.errorContainer,
                    ),
                  ),
                  Marker(
                    point: _driverPos(_ctrl.value),
                    width: 40,
                    height: 40,
                    child: const _DriverPin(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapPin extends StatelessWidget {
  const _MapPin({
    required this.icon,
    required this.color,
    required this.bgColor,
  });

  final IconData icon;
  final Color color;
  final Color bgColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: bgColor,
        shape: BoxShape.circle,
        boxShadow: const [
          BoxShadow(
            color: AppColors.shadow,
            blurRadius: 4,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Icon(icon, size: 20, color: color),
    );
  }
}

class _DriverPin extends StatelessWidget {
  const _DriverPin();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.primary,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: AppColors.shadowMedium,
            blurRadius: 6,
            offset: Offset(0, 3),
          ),
        ],
      ),
      child: const Icon(
        Icons.delivery_dining_rounded,
        size: 24,
        color: Colors.white,
      ),
    );
  }
}

class _CancelButton extends StatelessWidget {
  const _CancelButton({required this.onCancel});

  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: AppConstants.minTouchTarget + 8,
      child: OutlinedButton.icon(
        onPressed: onCancel,
        icon: const Icon(Icons.cancel_outlined, color: AppColors.error),
        label: const Text(
          'Cancelar pedido',
          style: TextStyle(
            fontFamily: 'Inter',
            fontWeight: FontWeight.w600,
            color: AppColors.error,
          ),
        ),
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: AppColors.error),
        ),
      ),
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
