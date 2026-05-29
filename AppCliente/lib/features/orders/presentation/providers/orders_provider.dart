import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/features/cart/presentation/providers/'
    'cart_provider.dart';
import 'package:nexum_client/features/orders/data/datasources/'
    'orders_datasource.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';

/// Conductores mock asignados a los pedidos (rotan por cada nuevo pedido).
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
  OrdersNotifier(this._dataSource) : super(const OrdersState()) {
    _loadHistory();
  }

  final OrdersDataSource _dataSource;
  final _random = Random();

  /// Timers de simulación de cada pedido activo, para poder cancelarlos.
  final _timers = <String, List<Timer>>{};

  Future<void> _loadHistory() async {
    final history = await _dataSource.fetchOrderHistory();
    if (!mounted) return;
    state = state.copyWith(orders: history, isLoading: false);
  }

  /// Crea un pedido a partir del carrito y arranca la simulación en vivo.
  ///
  /// Devuelve el id del nuevo pedido para navegar a su seguimiento.
  String placeOrder({
    required CartState cart,
    required String deliveryAddress,
  }) {
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
    _startSimulation(id);
    return id;
  }

  /// Simula la cadena de custodia avanzando en el tiempo (modo demo).
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

    // 1. Conductor asignado y en camino al local.
    schedule(
      5,
      (o) => o.copyWith(
        status: CustomerOrderStatus.driverToPickup,
        driverName: driver.$1,
        driverPhone: driver.$2,
      ),
    );

    // 2. Conductor en el local recogiendo (toma la foto del pedido).
    schedule(
      12,
      (o) => o.copyWith(status: CustomerOrderStatus.atPickup),
    );

    // 3. Pedido recogido con foto de custodia, en camino al cliente.
    schedule(
      18,
      (o) => o.copyWith(
        status: CustomerOrderStatus.inTransit,
        pickedUpAt: DateTime.now(),
        pickupPhotoPath: 'assets://pickup/$id',
      ),
    );

    // 4. Entregado con prueba (foto + firma).
    schedule(
      28,
      (o) => o.copyWith(
        status: CustomerOrderStatus.delivered,
        deliveredAt: DateTime.now(),
        deliveryPhotoPath: 'assets://delivery/$id',
        hasSignature: true,
      ),
    );
  }

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
    super.dispose();
  }
}

final _ordersDataSourceProvider = Provider<OrdersDataSource>((ref) {
  return OrdersDataSource();
});

final ordersProvider =
    StateNotifierProvider<OrdersNotifier, OrdersState>((ref) {
  return OrdersNotifier(ref.read(_ordersDataSourceProvider));
});

/// Observa un pedido individual por id (para la pantalla de seguimiento).
final orderByIdProvider =
    Provider.family<CustomerOrderEntity?, String>((ref, id) {
  return ref.watch(ordersProvider).byId(id);
});
