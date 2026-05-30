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
///   {"type": "client_auth", "token": "..."}   ← autenticación
///   {"type": "subscribe_order", "orderId": "..."}
///   {"type": "unsubscribe_order", "orderId": "..."}
///
/// Protocolo servidor → cliente:
///   {"type": "client_auth_ok", "clientId": "..."}
///   {"type": "client_auth_error", "message": "..."}
///   {"type": "order_update", "orderId": "...", ...campos del pedido}
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
  bool _waitingForAuth = false;
  Completer<bool>? _authCompleter;

  final _updateCtrl = StreamController<OrderUpdateEvent>.broadcast();

  Stream<OrderUpdateEvent> get updates => _updateCtrl.stream;

  bool get isConnected => _channel != null && _authenticated;

  // ── connect ────────────────────────────────────────────────────────────────

  /// Intenta conectar al backend y autenticar con el token de cliente guardado.
  ///
  /// Devuelve `true` si `client_auth_ok` llega en menos de 3 s.
  Future<bool> connect() async {
    if (kIsWeb) return false;
    if (_channel != null) return _authenticated;

    final token = await _storage.read(key: AppConstants.authTokenKey);
    if (token == null || token.isEmpty) return false;

    try {
      _channel = WebSocketChannel.connect(Uri.parse(ApiConfig.wsUrl));
      await _channel!.ready.timeout(const Duration(seconds: 3));

      _waitingForAuth = true;
      _authCompleter = Completer<bool>();

      _sub = _channel!.stream.listen(
        _onMessage,
        onError: (_) {
          _authCompleter?.complete(false);
          _cleanup();
        },
        onDone: () {
          _authCompleter?.complete(false);
          _cleanup();
        },
        cancelOnError: true,
      );

      // Use 'client_auth' — not 'auth' which is the driver message type.
      _channel!.sink.add(jsonEncode({'type': 'client_auth', 'token': token}));

      final ok = await _authCompleter!.future.timeout(
        const Duration(seconds: 4),
        onTimeout: () => false,
      );
      if (!ok) _cleanup();
      return ok;
    } catch (_) {
      _cleanup();
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
    _waitingForAuth = false;
  }

  // ── message handler ────────────────────────────────────────────────────────

  void _onMessage(dynamic raw) {
    try {
      final msg = jsonDecode(raw as String) as Map<String, dynamic>;
      final type = msg['type'] as String?;

      // Handshake phase
      if (_waitingForAuth) {
        if (type == 'client_auth_ok') {
          _authenticated = true;
          _waitingForAuth = false;
          _authCompleter?.complete(true);
        } else if (type == 'client_auth_error') {
          _waitingForAuth = false;
          _authCompleter?.complete(false);
        }
        return;
      }

      // Normal messages
      if (type == 'order_update') {
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
