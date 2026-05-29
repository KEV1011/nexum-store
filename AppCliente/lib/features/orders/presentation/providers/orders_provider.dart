import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/features/cart/presentation/providers/'
    'cart_provider.dart';
import 'package:nexum_client/features/orders/data/datasources/'
    'orders_datasource.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';
import 'package:nexum_client/shared/services/order_ws_service.dart';

/// Conductores mock para la simulación de demo.
const _mockDrivers = <(String, String)>[
  ('Andrés Villamizar', '+57 312 678 9012'),
  ('Laura Sepúlveda', '+57 318 234 5678'),
  ('Jorge Contreras', '+57 320 987 6543'),
  ('Diana Rangel', '+57 315 456 7788'),
];

/// Estado de la lista de pedidos del cliente (activos + historial).
class OrdersState {
  const OrdersState({
    this.orders = const [],
    this.isLoading = true,
  });

  final List<CustomerOrderEntity> orders;
  final bool isLoading;

  List<CustomerOrderEntity> get active =>
      orders.where((o) => o.isActive).toList();

  List<CustomerOrderEntity> get past =>
      orders.where((o) => o.isDelivered).toList();

  CustomerOrderEntity? byId(String id) {
    for (final o in orders) {
      if (o.id == id) return o;
    }
    return null;
  }

  OrdersState copyWith({
    List<CustomerOrderEntity>? orders,
    bool? isLoading,
  }) {
    return OrdersState(
      orders: orders ?? this.orders,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class OrdersNotifier extends StateNotifier<OrdersState> {
  OrdersNotifier(this._dataSource, this._wsService)
      : super(const OrdersState()) {
    _loadHistory();
    _listenToWs();
  }

  final OrdersDataSource _dataSource;
  final OrderWsService _wsService;
  final _random = Random();

  /// Timers de simulación por pedido (fallback cuando WS no conecta).
  final _timers = <String, List<Timer>>{};

  /// Pedidos actualmente suscritos via WS (para no duplicar suscripción).
  final _wsSubscribed = <String>{};

  StreamSubscription<OrderUpdateEvent>? _wsSub;

  // ── init ───────────────────────────────────────────────────────────────────

  Future<void> _loadHistory() async {
    final history = await _dataSource.fetchOrderHistory();
    if (!mounted) return;
    state = state.copyWith(orders: history, isLoading: false);
  }

  void _listenToWs() {
    _wsSub = _wsService.updates.listen(_applyWsUpdate);
  }

  // ── placeOrder ─────────────────────────────────────────────────────────────

  /// Crea un pedido desde el carrito, intenta conectar WS y cae en simulación
  /// por Timer si el backend no está disponible.
  ///
  /// Devuelve el id del nuevo pedido para navegar al tracking.
  Future<String> placeOrder({
    required CartState cart,
    required String deliveryAddress,
  }) async {
    final business = cart.business!;
    final ref = 'NX-${1000 + _random.nextInt(8000)}';
    final id = 'ord-${DateTime.now().millisecondsSinceEpoch}';

    final order = CustomerOrderEntity(
      id: id,
      orderRef: ref,
      businessName: business.name,
      businessAddress: business.address,
      deliveryAddress: deliveryAddress,
      status: CustomerOrderStatus.confirmed,
      lines: cart.items
          .map(
            (item) => OrderLineEntity(
              productName: item.product.name,
              quantity: item.quantity,
              unitPrice: item.product.price,
            ),
          )
          .toList(),
      subtotal: cart.subtotal,
      deliveryFee: business.deliveryFee,
      createdAt: DateTime.now(),
      etaMinutes: business.etaMinutes,
    );

    state = state.copyWith(orders: [order, ...state.orders]);

    // Intentar WS real; si falla usar simulación local.
    final wsOk = await _wsService.connect();
    if (wsOk && !_wsSubscribed.contains(id)) {
      _wsSubscribed.add(id);
      _wsService.subscribeOrder(id);
    } else {
      _startSimulation(id);
    }

    return id;
  }

  // ── WS update handler ──────────────────────────────────────────────────────

  void _applyWsUpdate(OrderUpdateEvent event) {
    if (!mounted) return;
    final payload = event.payload;

    _updateOrder(event.orderId, (order) {
      final statusStr = payload['status'] as String?;
      final status = statusStr != null
          ? CustomerOrderStatus.values.firstWhere(
              (s) => s.name == statusStr,
              orElse: () => order.status,
            )
          : order.status;

      final pickedUpAtStr = payload['pickedUpAt'] as String?;
      final deliveredAtStr = payload['deliveredAt'] as String?;

      return order.copyWith(
        status: status,
        driverName: payload['driverName'] as String? ?? order.driverName,
        driverPhone:
            payload['driverPhone'] as String? ?? order.driverPhone,
        etaMinutes:
            payload['etaMinutes'] as int? ?? order.etaMinutes,
        pickedUpAt: pickedUpAtStr != null
            ? DateTime.tryParse(pickedUpAtStr)
            : order.pickedUpAt,
        deliveredAt: deliveredAtStr != null
            ? DateTime.tryParse(deliveredAtStr)
            : order.deliveredAt,
        pickupPhotoPath: payload['pickupPhotoUrl'] as String? ??
            order.pickupPhotoPath,
        deliveryPhotoPath: payload['deliveryPhotoUrl'] as String? ??
            order.deliveryPhotoPath,
        hasSignature:
            payload['hasSignature'] as bool? ?? order.hasSignature,
      );
    });
  }

  // ── Timer simulation (fallback) ────────────────────────────────────────────

  void _startSimulation(String id) {
    final driver = _mockDrivers[_random.nextInt(_mockDrivers.length)];

    void schedule(
      int seconds,
      CustomerOrderEntity Function(CustomerOrderEntity) update,
    ) {
      final timer = Timer(Duration(seconds: seconds), () {
        if (!mounted) return;
        _updateOrder(id, update);
      });
      _timers.putIfAbsent(id, () => []).add(timer);
    }

    schedule(
      5,
      (o) => o.copyWith(
        status: CustomerOrderStatus.driverToPickup,
        driverName: driver.$1,
        driverPhone: driver.$2,
      ),
    );
    schedule(
      12,
      (o) => o.copyWith(status: CustomerOrderStatus.atPickup),
    );
    schedule(
      18,
      (o) => o.copyWith(
        status: CustomerOrderStatus.inTransit,
        pickedUpAt: DateTime.now(),
        pickupPhotoPath: 'mock://pickup/$id',
      ),
    );
    schedule(
      28,
      (o) => o.copyWith(
        status: CustomerOrderStatus.delivered,
        deliveredAt: DateTime.now(),
        deliveryPhotoPath: 'mock://delivery/$id',
        hasSignature: true,
      ),
    );
  }

  // ── rateOrder ──────────────────────────────────────────────────────────────

  void rateOrder(String id, int stars, {String? comment}) {
    _updateOrder(
      id,
      (o) => o.copyWith(
        rating: stars,
        ratingComment: comment,
        ratedAt: DateTime.now(),
      ),
    );
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  void _updateOrder(
    String id,
    CustomerOrderEntity Function(CustomerOrderEntity) update,
  ) {
    final updated = [
      for (final o in state.orders)
        if (o.id == id) update(o) else o,
    ];
    state = state.copyWith(orders: updated);
  }

  @override
  void dispose() {
    for (final timers in _timers.values) {
      for (final t in timers) {
        t.cancel();
      }
    }
    _wsSub?.cancel();
    super.dispose();
  }
}

// ── Providers ────────────────────────────────────────────────────────────────

final _ordersDataSourceProvider = Provider<OrdersDataSource>((ref) {
  return OrdersDataSource();
});

final _orderWsServiceProvider = Provider<OrderWsService>((ref) {
  return OrderWsService();
});

final ordersProvider =
    StateNotifierProvider<OrdersNotifier, OrdersState>((ref) {
  return OrdersNotifier(
    ref.read(_ordersDataSourceProvider),
    ref.read(_orderWsServiceProvider),
  );
});

/// Observa un pedido individual por id (para la pantalla de tracking).
final orderByIdProvider =
    Provider.family<CustomerOrderEntity?, String>((ref, id) {
  return ref.watch(ordersProvider).byId(id);
});
