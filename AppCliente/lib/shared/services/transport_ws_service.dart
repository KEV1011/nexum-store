import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class TripUpdateEvent {
  const TripUpdateEvent({required this.tripId, required this.payload});
  final String tripId;
  final Map<String, dynamic> payload;
}

class DriverLocationEvent {
  const DriverLocationEvent({
    required this.tripId,
    required this.lat,
    required this.lng,
  });
  final String tripId;
  final double lat;
  final double lng;
}

class ErrandUpdateEvent {
  const ErrandUpdateEvent({required this.errandId, required this.payload});
  final String errandId;
  final Map<String, dynamic> payload;
}

class IntercityUpdateEvent {
  const IntercityUpdateEvent({required this.bookingId, required this.payload});
  final String bookingId;
  final Map<String, dynamic> payload;
}

class PooledUpdateEvent {
  const PooledUpdateEvent({required this.tripId, required this.payload});
  final String tripId;
  final Map<String, dynamic> payload;
}

class RideUpdateEvent {
  const RideUpdateEvent({required this.ride});
  final Map<String, dynamic> ride;
}

class RideLocationEvent {
  const RideLocationEvent({
    required this.rideId,
    required this.lat,
    required this.lng,
  });
  final String rideId;
  final double lat;
  final double lng;
}

class ChatMessageEvent {
  const ChatMessageEvent({required this.message});
  final Map<String, dynamic> message;
}

/// Singleton WS client for real-time trip, errand, and intercity updates.
///
/// Protocol client→server:
///   {"type":"client_auth","token":"..."}
///   {"type":"subscribe_trip","tripId":"..."}
///   {"type":"unsubscribe_trip","tripId":"..."}
///   {"type":"subscribe_errand","errandId":"..."}
///   {"type":"unsubscribe_errand","errandId":"..."}
///   {"type":"subscribe_intercity","bookingId":"..."}
///   {"type":"unsubscribe_intercity","bookingId":"..."}
///
/// Protocol server→client:
///   {"type":"client_auth_ok","clientId":"..."}
///   {"type":"trip_update","tripId":"...","trip":{...}}
///   {"type":"driver_location","tripId":"...","lat":...,"lng":...}
///   {"type":"errand_update","errandId":"...","errand":{...}}
///   {"type":"intercity_update","bookingId":"...","booking":{...}}
class TransportWsService {
  factory TransportWsService() => _instance;
  TransportWsService._();
  static final TransportWsService _instance = TransportWsService._();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  bool _authenticated = false;
  bool _waitingForAuth = false;
  Completer<bool>? _authCompleter;

  // Auto-reconexión: una vez que la app pidió conectar, mantenemos el socket
  // vivo entre caídas (un viaje en curso no puede perder el seguimiento) y
  // reenviamos las suscripciones activas en cada (re)autenticación. La clave
  // del mapa es '<tipo>:<id>' para deduplicar; el valor es el mensaje a reenviar.
  bool _shouldReconnect = false;
  bool _connecting = false;
  int _reconnectAttempts = 0;
  Timer? _reconnectTimer;
  final Map<String, Map<String, dynamic>> _activeSubs = {};

  final _tripCtrl = StreamController<TripUpdateEvent>.broadcast();
  final _locationCtrl = StreamController<DriverLocationEvent>.broadcast();
  final _errandCtrl = StreamController<ErrandUpdateEvent>.broadcast();
  final _intercityCtrl = StreamController<IntercityUpdateEvent>.broadcast();
  final _pooledCtrl = StreamController<PooledUpdateEvent>.broadcast();
  final _rideCtrl = StreamController<RideUpdateEvent>.broadcast();
  final _rideLocationCtrl = StreamController<RideLocationEvent>.broadcast();
  final _chatCtrl = StreamController<ChatMessageEvent>.broadcast();

  Stream<TripUpdateEvent> get tripUpdates => _tripCtrl.stream;
  Stream<DriverLocationEvent> get driverLocations => _locationCtrl.stream;
  Stream<ErrandUpdateEvent> get errandUpdates => _errandCtrl.stream;
  Stream<IntercityUpdateEvent> get intercityUpdates => _intercityCtrl.stream;
  Stream<PooledUpdateEvent> get pooledUpdates => _pooledCtrl.stream;
  Stream<RideUpdateEvent> get rideUpdates => _rideCtrl.stream;
  Stream<RideLocationEvent> get rideLocations => _rideLocationCtrl.stream;
  Stream<ChatMessageEvent> get chatMessages => _chatCtrl.stream;

  bool get isConnected => _channel != null && _authenticated;

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

  /// Maneja una caída (error, cierre o auth fallida): completa el handshake
  /// pendiente, limpia el socket y, si seguimos queriendo estar conectados,
  /// programa una reconexión con backoff.
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

  /// Reenvía todas las suscripciones activas tras una (re)autenticación. El
  /// backend responde a cada `subscribe_*` con un snapshot, así que el estado
  /// se reconcilia sin pasos extra.
  void _replaySubs() {
    for (final msg in _activeSubs.values) {
      _send(msg);
    }
  }

  void subscribeTrip(String tripId) =>
      _recordSub('trip:$tripId', {'type': 'subscribe_trip', 'tripId': tripId});

  void unsubscribeTrip(String tripId) =>
      _dropSub('trip:$tripId', {'type': 'unsubscribe_trip', 'tripId': tripId});

  void subscribeErrand(String errandId) => _recordSub(
      'errand:$errandId', {'type': 'subscribe_errand', 'errandId': errandId});

  void unsubscribeErrand(String errandId) => _dropSub(
      'errand:$errandId', {'type': 'unsubscribe_errand', 'errandId': errandId});

  void subscribeIntercity(String bookingId) => _recordSub('intercity:$bookingId',
      {'type': 'subscribe_intercity', 'bookingId': bookingId});

  void unsubscribeIntercity(String bookingId) => _dropSub(
      'intercity:$bookingId',
      {'type': 'unsubscribe_intercity', 'bookingId': bookingId});

  void subscribePooled(String tripId) =>
      _recordSub('pooled:$tripId', {'type': 'subscribe_pooled', 'tripId': tripId});

  void unsubscribePooled(String tripId) => _dropSub(
      'pooled:$tripId', {'type': 'unsubscribe_pooled', 'tripId': tripId});

  // ── Ride negotiation (inDriver-style) + chat ────────────────────────────────

  void subscribeRide(String rideId) =>
      _recordSub('ride:$rideId', {'type': 'subscribe_ride', 'rideId': rideId});

  void unsubscribeRide(String rideId) =>
      _dropSub('ride:$rideId', {'type': 'unsubscribe_ride', 'rideId': rideId});

  /// Accept a driver's bid on the ride.
  void acceptBid(String rideId, String bidId) =>
      _send({'type': 'ride_accept_bid', 'rideId': rideId, 'bidId': bidId});

  void cancelRide(String rideId) =>
      _send({'type': 'ride_cancel', 'rideId': rideId});

  void subscribeChat(String rideId) =>
      _recordSub('chat:$rideId', {'type': 'subscribe_chat', 'rideId': rideId});

  void unsubscribeChat(String rideId) =>
      _dropSub('chat:$rideId', {'type': 'unsubscribe_chat', 'rideId': rideId});

  void sendChat(String rideId, String text) =>
      _send({'type': 'chat_send', 'rideId': rideId, 'text': text});

  // Registra/borra una suscripción y la envía. El registro permite reenviarla
  // automáticamente tras una reconexión.
  void _recordSub(String key, Map<String, dynamic> msg) {
    _activeSubs[key] = msg;
    _send(msg);
  }

  void _dropSub(String key, Map<String, dynamic> msg) {
    _activeSubs.remove(key);
    _send(msg);
  }

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

  void _onMessage(dynamic raw) {
    try {
      final msg = jsonDecode(raw as String) as Map<String, dynamic>;
      final type = msg['type'] as String?;

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

      if (type == 'trip_update') {
        final tripId = msg['tripId'] as String?;
        if (tripId != null) {
          _tripCtrl.add(TripUpdateEvent(tripId: tripId, payload: msg));
        }
      } else if (type == 'driver_location') {
        final tripId = msg['tripId'] as String?;
        final lat = (msg['lat'] as num?)?.toDouble();
        final lng = (msg['lng'] as num?)?.toDouble();
        if (tripId != null && lat != null && lng != null) {
          _locationCtrl.add(
            DriverLocationEvent(tripId: tripId, lat: lat, lng: lng),
          );
        }
      } else if (type == 'errand_update') {
        final errandId = msg['errandId'] as String?;
        if (errandId != null) {
          _errandCtrl.add(ErrandUpdateEvent(errandId: errandId, payload: msg));
        }
      } else if (type == 'intercity_update') {
        final bookingId = msg['bookingId'] as String?;
        if (bookingId != null) {
          _intercityCtrl.add(
            IntercityUpdateEvent(bookingId: bookingId, payload: msg),
          );
        }
      } else if (type == 'pooled_update') {
        final tripId = msg['tripId'] as String?;
        if (tripId != null) {
          _pooledCtrl.add(PooledUpdateEvent(tripId: tripId, payload: msg));
        }
      } else if (type == 'ride_update') {
        final ride = msg['ride'];
        if (ride is Map<String, dynamic>) {
          _rideCtrl.add(RideUpdateEvent(ride: ride));
        }
      } else if (type == 'ride_location') {
        final rideId = msg['rideId'] as String?;
        final lat = (msg['lat'] as num?)?.toDouble();
        final lng = (msg['lng'] as num?)?.toDouble();
        if (rideId != null && lat != null && lng != null) {
          _rideLocationCtrl.add(
            RideLocationEvent(rideId: rideId, lat: lat, lng: lng),
          );
        }
      } else if (type == 'chat_message') {
        final m = msg['message'];
        if (m is Map<String, dynamic>) {
          _chatCtrl.add(ChatMessageEvent(message: m));
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
