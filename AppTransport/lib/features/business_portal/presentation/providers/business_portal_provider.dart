import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/features/business_portal/data/datasources/business_portal_datasource.dart';
import 'package:nexum_driver/features/business_portal/data/datasources/catalog_datasource.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/business_earnings_entity.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/business_order_entity.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/business_product_entity.dart';

// ── Infrastructure ────────────────────────────────────────────────────────────

final _dsProvider = Provider<BusinessPortalDataSource>(
  (_) => const BusinessPortalDataSource(),
);

final catalogDataSourceProvider = Provider<CatalogDataSource>(
  (_) => CatalogDataSource(),
);

// ── Orders ────────────────────────────────────────────────────────────────────

class _OrdersNotifier extends AsyncNotifier<List<BusinessOrderEntity>> {
  @override
  Future<List<BusinessOrderEntity>> build() async =>
      ref.read(_dsProvider).fetchTodayOrders('default_business');

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(_dsProvider).fetchTodayOrders('default_business'),
    );
  }
}

final businessOrdersProvider =
    AsyncNotifierProvider<_OrdersNotifier, List<BusinessOrderEntity>>(
  _OrdersNotifier.new,
);

// ── Incoming order (pending acceptance) ──────────────────────────────────────

class _IncomingOrderNotifier
    extends AsyncNotifier<BusinessOrderEntity?> {
  @override
  Future<BusinessOrderEntity?> build() async =>
      ref.read(_dsProvider).fetchIncomingOrder('default_business');

  Future<void> accept(String orderId, int prepMinutes) async {
    await ref.read(_dsProvider).acceptOrder(orderId, prepMinutes);
    state = const AsyncData(null);
    ref.read(businessOrdersProvider.notifier).refresh();
  }

  Future<void> reject(String orderId, String reason) async {
    await ref.read(_dsProvider).rejectOrder(orderId, reason);
    state = const AsyncData(null);
  }

  Future<void> poll() async {
    final order = await ref
        .read(_dsProvider)
        .fetchIncomingOrder('default_business');
    state = AsyncData(order);
  }
}

final incomingOrderProvider =
    AsyncNotifierProvider<_IncomingOrderNotifier, BusinessOrderEntity?>(
  _IncomingOrderNotifier.new,
);

// ── Products ──────────────────────────────────────────────────────────────────

class _ProductsNotifier
    extends AsyncNotifier<List<BusinessProductEntity>> {
  @override
  Future<List<BusinessProductEntity>> build() async =>
      ref.read(_dsProvider).fetchProducts('default_business');

  Future<void> toggle(String productId, bool isAvailable) async {
    await ref.read(_dsProvider).toggleProductAvailability(productId, isAvailable);
    state = state.whenData(
      (list) => list
          .map((p) => p.id == productId ? p.copyWith(isAvailable: isAvailable) : p)
          .toList(),
    );
  }

  /// Inserta un producto recién agregado al inicio de la lista (feedback inmediato).
  void addLocal(BusinessProductEntity product) {
    state = state.whenData((list) => [product, ...list]);
  }
}

final businessProductsProvider =
    AsyncNotifierProvider<_ProductsNotifier, List<BusinessProductEntity>>(
  _ProductsNotifier.new,
);

// ── Earnings ──────────────────────────────────────────────────────────────────

final selectedPeriodProvider =
    StateProvider<EarningsPeriod>((_) => EarningsPeriod.today);

final businessEarningsProvider =
    FutureProvider.family<BusinessEarningsEntity, EarningsPeriod>(
  (ref, period) async {
    final ds = ref.read(_dsProvider);
    return ds.fetchEarnings('default_business', period);
  },
);

// ── Business settings ─────────────────────────────────────────────────────────

class _SettingsNotifier extends AsyncNotifier<BusinessSettings> {
  @override
  Future<BusinessSettings> build() async =>
      ref.read(_dsProvider).fetchSettings('default_business');

  Future<void> toggleOpen(bool isOpen) async {
    state = state.whenData((s) => s.copyWith(isOpen: isOpen));
    await ref.read(_dsProvider).saveSettings(
          state.value!,
        );
  }

  Future<void> setPrepMinutes(int minutes) async {
    state = state.whenData((s) => s.copyWith(defaultPrepMinutes: minutes));
  }

  Future<void> setWhatsapp(String number) async {
    state = state.whenData((s) => s.copyWith(whatsappNumber: number));
  }
}

final businessSettingsProvider =
    AsyncNotifierProvider<_SettingsNotifier, BusinessSettings>(
  _SettingsNotifier.new,
);

// ── Derived stats ─────────────────────────────────────────────────────────────

final orderStatsProvider = Provider<OrderStats>((ref) {
  return ref.watch(businessOrdersProvider).maybeWhen(
        data: (orders) {
          final delivered = orders.where((o) => o.isDelivered).toList();
          final fullCustody = delivered.where((o) => o.hasFullCustody).length;
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
            fullCustodyRate:
                delivered.isEmpty ? 0.0 : fullCustody / delivered.length,
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
  final double fullCustodyRate;
}
