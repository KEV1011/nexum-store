import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'package:nexum_driver/core/config/api_config.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/domain/work_mode.dart';

/// Singleton WebSocket driver service for real-time communication with the
/// Nexum backend.
///
/// Lifecycle:
///   await connect(token, workMode)  → authenticate → returns true on auth_ok
///   disconnect()                    → clean close
///
/// Streams exposed (raw JSON maps — callers are responsible for mapping to
/// domain entities so this service stays free of UI dependencies):
///   tripRequests        → raw trip JSON maps
///   errandRequests      → raw errand JSON maps
///   tripCancellations   → tripId strings
///   errandCancellations → errandId strings
class DriverWsService {
  DriverWsService._();
  static final DriverWsService _instance = DriverWsService._();
  factory DriverWsService() => _instance;

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Completer<bool>? _authCompleter;

  final _tripCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _errandCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _tripCancelCtrl = StreamController<String>.broadcast();
  final _errandCancelCtrl = StreamController<String>.broadcast();

  // ── Public streams ────────────────────────────────────────────────────────

  /// Emits the raw `trip` JSON map from every `trip_request` server message.
  Stream<Map<String, dynamic>> get tripRequests => _tripCtrl.stream;

  /// Emits the raw errand JSON map from every `errand_request` server message.
  Stream<Map<String, dynamic>> get errandRequests => _errandCtrl.stream;

  /// Emits the `tripId` from every `trip_cancelled` server message.
  Stream<String> get tripCancellations => _tripCancelCtrl.stream;

  /// Emits the `errandId` from every `errand_cancelled` server message.
  Stream<String> get errandCancellations => _errandCancelCtrl.stream;

  bool get isConnected => _channel != null;

  // ── connect ───────────────────────────────────────────────────────────────

  /// Connects to the backend WebSocket, sends an `auth` frame with the
  /// driver's JWT and [workMode], and waits up to 4 seconds for `auth_ok`.
  ///
  /// If [token] is `null` the JWT is read from [FlutterSecureStorage].
  /// Returns `true` on successful authentication, `false` otherwise.
  Future<bool> connect(String? token, WorkMode workMode) async {
    if (kIsWeb) return false;
    if (_channel != null) return true;

    final jwt = token ?? await _storage.read(key: AppConstants.authTokenKey);
    if (jwt == null || jwt.isEmpty) return false;

    try {
      _channel = WebSocketChannel.connect(Uri.parse(ApiConfig.wsUrl));
      await _channel!.ready;

      _authCompleter = Completer<bool>();

      _sub = _channel!.stream.listen(
        _onMessage,
        onError: (_) {
          if (_authCompleter != null && !_authCompleter!.isCompleted) {
            _authCompleter!.complete(false);
          }
          _cleanup();
        },
        onDone: () {
          if (_authCompleter != null && !_authCompleter!.isCompleted) {
            _authCompleter!.complete(false);
          }
          _cleanup();
        },
        cancelOnError: true,
      );

      _send({
        'type': 'auth',
        'token': jwt,
        'workMode': workMode.name,
      });

      final authenticated = await _authCompleter!.future.timeout(
        const Duration(seconds: 4),
        onTimeout: () => false,
      );

      if (!authenticated) {
        _cleanup();
      }

      return authenticated;
    } catch (_) {
      _cleanup();
      return false;
    }
  }

  // ── disconnect ────────────────────────────────────────────────────────────

  void disconnect() {
    _sub?.cancel();
    _channel?.sink.close();
    _cleanup();
  }

  void _cleanup() {
    _channel = null;
    _sub = null;
    _authCompleter = null;
  }

  // ── send helpers ──────────────────────────────────────────────────────────

  /// Accept a trip request.
  void sendAccept(String tripId) =>
      _send({'type': 'accept', 'tripId': tripId});

  /// Reject a trip request.
  void sendReject(String tripId) =>
      _send({'type': 'reject', 'tripId': tripId});

  /// Accept an errand request.
  void sendAcceptErrand(String errandId) =>
      _send({'type': 'accept_errand', 'errandId': errandId});

  /// Reject an errand request.
  void sendRejectErrand(String errandId) =>
      _send({'type': 'reject_errand', 'errandId': errandId});

  /// Update errand progress.
  ///
  /// [status] must be one of `'shopping'`, `'on_the_way'`, or `'delivered'`.
  void sendErrandStatus(
    String errandId,
    String status, {
    double? actualCost,
  }) {
    _send({
      'type': 'errand_status',
      'errandId': errandId,
      'status': status,
      if (actualCost != null) 'actualCost': actualCost,
    });
  }

  /// Send a GPS location update, optionally associated with an active trip.
  void sendLocationUpdate(double lat, double lng, {String? tripId}) {
    _send({
      'type': 'location_update',
      'lat': lat,
      'lng': lng,
      if (tripId != null) 'tripId': tripId,
    });
  }

  /// Notify the backend that the driver is switching work mode.
  void changeWorkMode(WorkMode workMode) =>
      _send({'type': 'driver_mode', 'workMode': workMode.name});

  void _send(Map<String, dynamic> msg) {
    if (_channel == null) return;
    try {
      _channel!.sink.add(jsonEncode(msg));
    } catch (_) {}
  }

  // ── message handler ───────────────────────────────────────────────────────

  void _onMessage(dynamic raw) {
    try {
      final msg = jsonDecode(raw as String) as Map<String, dynamic>;
      final type = msg['type'] as String?;

      switch (type) {
        case 'auth_ok':
          if (_authCompleter != null && !_authCompleter!.isCompleted) {
            _authCompleter!.complete(true);
          }

        case 'auth_error':
          if (_authCompleter != null && !_authCompleter!.isCompleted) {
            _authCompleter!.complete(false);
          }

        case 'trip_request':
          final trip = msg['trip'];
          if (trip is Map<String, dynamic>) {
            _tripCtrl.add(trip);
          }

        case 'errand_request':
          final errand = msg['errand'];
          if (errand is Map<String, dynamic>) {
            _errandCtrl.add(errand);
          }

        case 'trip_cancelled':
          final tripId = msg['tripId'] as String?;
          if (tripId != null) _tripCancelCtrl.add(tripId);

        case 'errand_cancelled':
          final errandId = msg['errandId'] as String?;
          if (errandId != null) _errandCancelCtrl.add(errandId);

        default:
          break;
      }
    } catch (_) {}
  }
}
