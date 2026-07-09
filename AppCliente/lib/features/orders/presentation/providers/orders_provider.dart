import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/cart/presentation/providers/'
    'cart_provider.dart';
import 'package:nexum_client/features/orders/data/datasources/'
    'orders_datasource.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';
import 'package:nexum_client/shared/services/order_ws_service.dart';

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
      orders.where((o) => !o.isActive).toList();

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
  OrdersNotifier(this._dataSource, this._wsService, this._dio)
      : super(const OrdersState()) {
    _loadHistory();
    _listenToWs();
  }

  final OrdersDataSource _dataSource;
  final OrderWsService _wsService;
  final Dio _dio;

  /// Timers de simulación por pedido (fallback cuando WS no conecta).
  final _timers = <String, List<Timer>>{};

  /// Pedidos actualmente suscritos via WS (para no duplicar suscripción).
  final _wsSubscribed = <String>{};

  StreamSubscription<OrderUpdateEvent>? _wsSub;

  // ── init ───────────────────────────────────────────────────────────────────

  Future<void> _loadHistory() async {
    List<CustomerOrderEntity> history;
    try {
      // Historial REAL desde el backend (GET /client/orders).
      final res = await _dio.get<Map<String, dynamic>>('/client/orders');
      final list = res.data?['data'] as List<dynamic>?;
      if (list == null) throw Exception('sin datos');
      final remote = list
          .map((e) => CustomerOrderEntity.fromApi(e as Map<String, dynamic>))
          .toList();
      // La calificación es local del cliente (el backend no la guarda en el
      // resumen): se conserva superponiéndola por id sobre el historial remoto.
      final local = await _dataSource.fetchOrderHistory();
      final ratedById = {
        for (final o in local)
          if (o.isRated) o.id: o,
      };
      history = remote.map((o) {
        final r = ratedById[o.id];
        return r == null
            ? o
            : o.copyWith(
                rating: r.rating,
                ratingComment: r.ratingComment,
                ratedAt: r.ratedAt,
              );
      }).toList();
      unawaited(_dataSource.saveOrders(history));
    } catch (_) {
      // Sin conexión: historial local (cache).
      history = await _dataSource.fetchOrderHistory();
    }
    if (!mounted) return;
    state = state.copyWith(orders: history, isLoading: false);
    unawaited(_resumeActiveTracking(history));
  }

  /// Al reabrir la app, reconecta el WS y se resuscribe a los pedidos que siguen
  /// activos para reanudar el seguimiento en vivo. El backend reenvía el estado
  /// actual al suscribirse, así que el pedido se reconcilia solo. En web el WS
  /// está deshabilitado y esto es un no-op.
  Future<void> _resumeActiveTracking(List<CustomerOrderEntity> orders) async {
    final active = orders.where((o) => o.isActive).toList();
    if (active.isEmpty) return;
    final wsOk = await _wsService.connect();
    if (!wsOk || !mounted) return;
    for (final o in active) {
      if (_wsSubscribed.add(o.id)) {
        _wsService.subscribeOrder(o.id);
      }
    }
  }

  void _listenToWs() {
    _wsSub = _wsService.updates.listen(_applyWsUpdate);
  }

  // ── placeOrder ─────────────────────────────────────────────────────────────

  /// Crea un pedido desde el carrito contra el backend real. Si no hay red,
  /// lanza (el checkout muestra el error): un pedido que el negocio nunca
  /// recibió no debe aparecer como confirmado.
  ///
  /// Devuelve el id del pedido para navegar al tracking.
  Future<String> placeOrder({
    required CartState cart,
    required String deliveryAddress,
  }) async {
    final business = cart.business!;

    String id;
    String orderRef;

    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/client/orders',
        data: {
          'businessId': business.id,
          'deliveryAddress': deliveryAddress,
          'items': cart.items
              .map(
                (item) => {
                  'productId': item.product.id,
                  'quantity': item.quantity,
                  'unitPrice': item.product.price,
                },
              )
              .toList(),
        },
      );
      final data = res.data!['data'] as Map<String, dynamic>;
      id = data['id'] as String;
      orderRef = data['orderRef'] as String;
    } catch (_) {
      throw Exception('No se pudo enviar el pedido. Revisa tu conexión.');
    }

    final order = CustomerOrderEntity(
      id: id,
      orderRef: orderRef,
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

    final newOrders = [order, ...state.orders];
    state = state.copyWith(orders: newOrders);
    unawaited(_dataSource.saveOrders(newOrders));

    final wsOk = await _wsService.connect();
    if (wsOk) {
      if (_wsSubscribed.add(id)) _wsService.subscribeOrder(id);
    } else {
      // Sin WS (p. ej. web): seguimiento real por polling del backend.
      _startPolling(id);
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

  // ── Polling REST (fallback sin WS) ─────────────────────────────────────────

  /// Consulta el estado real del pedido cada 5 s cuando no hay WebSocket
  /// disponible; el DTO del backend es el mismo del `order_update` del WS.
  void _startPolling(String id) {
    final timer = Timer.periodic(const Duration(seconds: 5), (t) async {
      if (!mounted) {
        t.cancel();
        return;
      }
      try {
        final res = await _dio.get<Map<String, dynamic>>('/client/orders/$id');
        final data = res.data?['data'] as Map<String, dynamic>?;
        if (data == null || !mounted) return;
        _applyWsUpdate(OrderUpdateEvent(orderId: id, payload: data));
        final status = data['status'] as String?;
        if (status == 'delivered' || status == 'cancelled') t.cancel();
      } catch (_) {
        // Red intermitente: se reintenta en el siguiente tick.
      }
    });
    _timers.putIfAbsent(id, () => []).add(timer);
  }

  // ── cancelOrder ────────────────────────────────────────────────────────────

  void cancelOrder(String id) {
    for (final t in _timers[id] ?? <Timer>[]) {
      t.cancel();
    }
    _timers.remove(id);
    _wsService.unsubscribeOrder(id);
    _updateOrder(id, (o) => o.copyWith(status: CustomerOrderStatus.cancelled));
    // Cancela también en el backend: libera y avisa al repartidor asignado.
    unawaited(_cancelOnServer(id));
  }

  Future<void> _cancelOnServer(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>('/client/orders/$id/cancel');
    } catch (_) {
      // Silencioso: la cancelación local ya se reflejó en la UI.
    }
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

  /// Solicita una propina para el pedido [id]. Devuelve la URL de checkout de
  /// Wompi para abrir el pago, o null si falla. El 100% va al repartidor.
  Future<String?> tipOrder(String id, double amount) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/client/orders/$id/tip',
        data: {'amount': amount},
      );
      return (res.data?['data'] as Map<String, dynamic>?)?['paymentUrl'] as String?;
    } catch (_) {
      return null;
    }
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
    unawaited(_dataSource.saveOrders(updated));
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
    ref.read(apiClientProvider),
  );
});

/// Observa un pedido individual por id (para la pantalla de tracking).
final orderByIdProvider =
    Provider.family<CustomerOrderEntity?, String>((ref, id) {
  return ref.watch(ordersProvider).byId(id);
});
