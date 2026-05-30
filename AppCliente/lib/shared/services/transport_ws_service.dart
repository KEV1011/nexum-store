import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
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

/// Singleton WS client for real-time trip updates and GPS tracking.
///
/// Protocol client→server:
///   {"type":"client_auth","token":"..."}
///   {"type":"subscribe_trip","tripId":"..."}
///   {"type":"unsubscribe_trip","tripId":"..."}
///
/// Protocol server→client:
///   {"type":"client_auth_ok","clientId":"..."}
///   {"type":"trip_update","tripId":"...","trip":{...}}
///   {"type":"driver_location","tripId":"...","lat":...,"lng":...}
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

  final _tripCtrl = StreamController<TripUpdateEvent>.broadcast();
  final _locationCtrl = StreamController<DriverLocationEvent>.broadcast();

  Stream<TripUpdateEvent> get tripUpdates => _tripCtrl.stream;
  Stream<DriverLocationEvent> get driverLocations => _locationCtrl.stream;

  bool get isConnected => _channel != null && _authenticated;

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

  void subscribeTrip(String tripId) =>
      _send({'type': 'subscribe_trip', 'tripId': tripId});

  void unsubscribeTrip(String tripId) =>
      _send({'type': 'unsubscribe_trip', 'tripId': tripId});

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
