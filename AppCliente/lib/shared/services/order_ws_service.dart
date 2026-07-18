import 'dart:async';
import 'dart:convert';

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
/// en tiempo real desde el backend ZIPA.
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

  // Auto-reconexión: mantenemos el socket vivo entre caídas y reenviamos las
  // suscripciones de pedidos activas en cada (re)autenticación.
  bool _shouldReconnect = false;
  bool _connecting = false;
  int _reconnectAttempts = 0;
  Timer? _reconnectTimer;
  final Map<String, Map<String, dynamic>> _activeSubs = {};

  final _updateCtrl = StreamController<OrderUpdateEvent>.broadcast();

  Stream<OrderUpdateEvent> get updates => _updateCtrl.stream;

  bool get isConnected => _channel != null && _authenticated;

  // ── connect ────────────────────────────────────────────────────────────────

  /// Intenta conectar al backend y autenticar con el token de cliente guardado.
  ///
  /// Devuelve `true` si `client_auth_ok` llega en menos de 3 s.
  Future<bool> connect() async {
    _shouldReconnect = true;
    if (_channel != null) return _authenticated;
    return _openAndAuth();
  }

  Future<bool> _openAndAuth() async {
    if (_channel != null) return _authenticated;
    if (_connecting) return false;
    _connecting = true;

    try {
      final token = await _storage.read(key: AppConstants.authTokenKey);
      if (token == null || token.isEmpty) return false;

      _channel = WebSocketChannel.connect(Uri.parse(ApiConfig.wsUrl));
      await _channel!.ready.timeout(const Duration(seconds: 3));

      _waitingForAuth = true;
      _authCompleter = Completer<bool>();

      _sub = _channel!.stream.listen(
        _onMessage,
        onError: (_) => _handleDrop(),
        onDone: _handleDrop,
        cancelOnError: true,
      );

      // Use 'client_auth' — not 'auth' which is the driver message type.
      _channel!.sink.add(jsonEncode({'type': 'client_auth', 'token': token}));

      final ok = await _authCompleter!.future.timeout(
        const Duration(seconds: 4),
        onTimeout: () => false,
      );
      if (ok) {
        _reconnectAttempts = 0;
        _replaySubs();
      } else {
        _handleDrop();
      }
      return ok;
    } catch (_) {
      _handleDrop();
      return false;
    } finally {
      _connecting = false;
    }
  }

  /// Maneja una caída: completa el handshake pendiente, limpia el socket y, si
  /// seguimos queriendo estar conectados, programa una reconexión con backoff.
  void _handleDrop() {
    if (_authCompleter != null && !_authCompleter!.isCompleted) {
      _authCompleter!.complete(false);
    }
    _cleanup();
    if (_shouldReconnect) _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (_reconnectTimer != null) return;
    if (_reconnectAttempts < 10) _reconnectAttempts++;
    // Backoff exponencial 2,4,8,16,… con techo de 30 s.
    final backoff = 1 << _reconnectAttempts;
    final seconds = backoff > 30 ? 30 : backoff;
    _reconnectTimer = Timer(Duration(seconds: seconds), () {
      _reconnectTimer = null;
      if (_shouldReconnect && _channel == null) unawaited(_openAndAuth());
    });
  }

  void _replaySubs() {
    for (final msg in _activeSubs.values) {
      _send(msg);
    }
  }

  // ── subscribeOrder ─────────────────────────────────────────────────────────

  void subscribeOrder(String orderId) {
    _activeSubs['order:$orderId'] = {
      'type': 'subscribe_order',
      'orderId': orderId,
    };
    _send({'type': 'subscribe_order', 'orderId': orderId});
  }

  void unsubscribeOrder(String orderId) {
    _activeSubs.remove('order:$orderId');
    _send({'type': 'unsubscribe_order', 'orderId': orderId});
  }

  // ── disconnect ─────────────────────────────────────────────────────────────

  void disconnect() {
    _shouldReconnect = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _activeSubs.clear();
    _cleanup();
  }

  void _cleanup() {
    _sub?.cancel();
    _channel?.sink.close();
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
