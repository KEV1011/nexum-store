import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/features/business_portal/data/datasources/'
    'business_portal_datasource.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/'
    'business_order_entity.dart';

// ── Infrastructure ───────────────────────────────────────────────────────────

final _businessPortalDataSourceProvider =
    Provider<BusinessPortalDataSource>((ref) {
  return BusinessPortalDataSource();
});

// ── AsyncNotifier ────────────────────────────────────────────────────────────

class _BusinessOrdersNotifier
    extends AsyncNotifier<List<BusinessOrderEntity>> {
  @override
  Future<List<BusinessOrderEntity>> build() async {
    return ref
        .read(_businessPortalDataSourceProvider)
        .fetchTodayOrders('default_business');
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref
          .read(_businessPortalDataSourceProvider)
          .fetchTodayOrders('default_business'),
    );
  }
}

// ── Public providers ─────────────────────────────────────────────────────────

/// Lista de pedidos del día para el portal del negocio.
final businessOrdersProvider = AsyncNotifierProvider<_BusinessOrdersNotifier,
    List<BusinessOrderEntity>>(
  _BusinessOrdersNotifier.new,
);

/// Pedidos en tránsito activos en este momento.
final activeOrdersProvider = Provider<List<BusinessOrderEntity>>((ref) {
  return ref.watch(businessOrdersProvider).maybeWhen(
        data: (orders) => orders
            .where(
              (o) =>
                  o.status == BusinessOrderStatus.inTransit ||
                  o.status == BusinessOrderStatus.pending ||
                  o.status == BusinessOrderStatus.atPickup,
            )
            .toList(),
        orElse: () => [],
      );
});

/// Estadísticas de pedidos del día.
final orderStatsProvider = Provider<OrderStats>((ref) {
  return ref.watch(businessOrdersProvider).maybeWhen(
        data: (orders) {
          final delivered =
              orders.where((o) => o.isDelivered).toList();
          final fullCustody =
              delivered.where((o) => o.hasFullCustody).length;
          return OrderStats(
            total: orders.length,
            pending: orders.where((o) => o.isPending).length,
            inTransit: orders
                .where(
                  (o) =>
                      o.status == BusinessOrderStatus.inTransit ||
                      o.status == BusinessOrderStatus.atPickup,
                )
                .length,
            delivered: delivered.length,
            fullCustodyRate: delivered.isEmpty
                ? 0.0
                : fullCustody / delivered.length,
          );
        },
        orElse: OrderStats.empty,
      );
});

class OrderStats {
  const OrderStats({
    required this.total,
    required this.pending,
    required this.inTransit,
    required this.delivered,
    required this.fullCustodyRate,
  });

  factory OrderStats.empty() => const OrderStats(
        total: 0,
        pending: 0,
        inTransit: 0,
        delivered: 0,
        fullCustodyRate: 0,
      );

  final int total;
  final int pending;
  final int inTransit;
  final int delivered;

  /// 0.0–1.0: proporción de pedidos entregados con cadena completa.
  final double fullCustodyRate;
}
