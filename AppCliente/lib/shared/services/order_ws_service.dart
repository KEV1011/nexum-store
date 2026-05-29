import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Evento de actualización de un pedido recibido por WebSocket.
class OrderUpdateEvent {
  const OrderUpdateEvent({
    required this.orderId,
    required this.payload,
  });

  final String orderId;
  final Map<String, dynamic> payload;
}

/// Singleton WebSocket client para recibir actualizaciones de pedidos
/// en tiempo real desde el backend Nexum.
///
/// Protocolo cliente → servidor:
///   {"type": "auth", "token": "..."}
///   {"type": "subscribe_order", "orderId": "..."}
///   {"type": "unsubscribe_order", "orderId": "..."}
///
/// Protocolo servidor → cliente:
///   {"type": "order_update", "orderId": "...", ...campos del pedido}
///
/// En web/demo (sin backend), connect() retorna false y el caller
/// debe usar la simulación por Timer como fallback.
class OrderWsService {
  factory OrderWsService() => _instance;
  OrderWsService._();
  static final OrderWsService _instance = OrderWsService._();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  bool _authenticated = false;

  final _updateCtrl =
      StreamController<OrderUpdateEvent>.broadcast();

  /// Stream de actualizaciones de pedidos.
  Stream<OrderUpdateEvent> get updates => _updateCtrl.stream;

  bool get isConnected => _channel != null && _authenticated;

  // ── connect ────────────────────────────────────────────────────────────────

  /// Intenta conectar al backend y autenticar con el token guardado.
  ///
  /// Devuelve `true` si la conexión se establece, `false` en caso contrario
  /// (web, sin token, sin backend, timeout).
  Future<bool> connect() async {
    if (kIsWeb) return false;
    if (_channel != null) return _authenticated;

    final token = await _storage.read(key: AppConstants.authTokenKey);
    if (token == null || token.isEmpty) return false;

    try {
      _channel = WebSocketChannel.connect(Uri.parse(ApiConfig.wsUrl));

      // Esperar ready con timeout de 3 s para no bloquear la UI.
      await _channel!.ready.timeout(const Duration(seconds: 3));

      _channel!.sink.add(jsonEncode({'type': 'auth', 'token': token}));
      _authenticated = true;

      _sub = _channel!.stream.listen(
        _onMessage,
        onError: (_) => _cleanup(),
        onDone: _cleanup,
        cancelOnError: true,
      );
      return true;
    } catch (_) {
      _channel = null;
      _authenticated = false;
      return false;
    }
  }

  // ── subscribeOrder ─────────────────────────────────────────────────────────

  void subscribeOrder(String orderId) {
    _send({'type': 'subscribe_order', 'orderId': orderId});
  }

  void unsubscribeOrder(String orderId) {
    _send({'type': 'unsubscribe_order', 'orderId': orderId});
  }

  // ── disconnect ─────────────────────────────────────────────────────────────

  void disconnect() {
    _sub?.cancel();
    _channel?.sink.close();
    _cleanup();
  }

  void _cleanup() {
    _channel = null;
    _sub = null;
    _authenticated = false;
  }

  // ── message handler ────────────────────────────────────────────────────────

  void _onMessage(dynamic raw) {
    try {
      final msg = jsonDecode(raw as String) as Map<String, dynamic>;
      if (msg['type'] == 'order_update') {
        final orderId = msg['orderId'] as String?;
        if (orderId != null) {
          _updateCtrl.add(OrderUpdateEvent(orderId: orderId, payload: msg));
        }
      }
    } catch (_) {}
  }

  void _send(Map<String, dynamic> msg) {
    if (_channel == null) return;
    try {
      _channel!.sink.add(jsonEncode(msg));
    } catch (_) {}
  }
}
