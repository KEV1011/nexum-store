import 'dart:async';
import 'dart:convert';

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
  // Ride negotiation (inDriver-style) + chat.
  final _rideRequestCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _rideUpdateCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _chatCtrl = StreamController<Map<String, dynamic>>.broadcast();

  // ── Public streams ────────────────────────────────────────────────────────

  /// Emits the raw `trip` JSON map from every `trip_request` server message.
  Stream<Map<String, dynamic>> get tripRequests => _tripCtrl.stream;

  /// Emits the raw errand JSON map from every `errand_request` server message.
  Stream<Map<String, dynamic>> get errandRequests => _errandCtrl.stream;

  /// Emits the `tripId` from every `trip_cancelled` server message.
  Stream<String> get tripCancellations => _tripCancelCtrl.stream;

  /// Emits the `errandId` from every `errand_cancelled` server message.
  Stream<String> get errandCancellations => _errandCancelCtrl.stream;

  /// Emits the raw `ride` JSON for every new open request (`ride_request_new`).
  Stream<Map<String, dynamic>> get rideRequests => _rideRequestCtrl.stream;

  /// Emits the raw `ride` JSON for every `ride_update` (matched ride lifecycle).
  Stream<Map<String, dynamic>> get rideUpdates => _rideUpdateCtrl.stream;

  /// Emits the raw `message` JSON for every `chat_message`.
  Stream<Map<String, dynamic>> get chatMessages => _chatCtrl.stream;

  bool get isConnected => _channel != null;

  // ── connect ───────────────────────────────────────────────────────────────

  /// Connects to the backend WebSocket, sends an `auth` frame with the
  /// driver's JWT and [workMode], and waits up to 4 seconds for `auth_ok`.
  ///
  /// If [token] is `null` the JWT is read from [FlutterSecureStorage].
  /// Returns `true` on successful authentication, `false` otherwise.
  Future<bool> connect(String? token, WorkMode workMode) async {
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

  /// Notify the server of a driver-initiated trip status change so the client
  /// is updated in real-time.
  ///
  /// [status] must be one of: `'arriving'`, `'arrived'`, `'in_progress'`, `'completed'`.
  void sendTripStatus(String tripId, String status) =>
      _send({'type': 'trip_status', 'tripId': tripId, 'status': status});

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

  // ── Ride negotiation (inDriver-style) ───────────────────────────────────────

  /// Opt into the live ride pool to start receiving open ride requests.
  void registerForRides() => _send({'type': 'driver_register'});

  /// Bid on an open ride: accept the offered fare or counter-offer with [fare].
  void placeBid(String rideId, double fare, int etaMinutes) => _send({
        'type': 'ride_bid',
        'rideId': rideId,
        'fare': fare,
        'etaMinutes': etaMinutes,
      });

  /// Withdraw a previously-placed bid.
  void withdrawBid(String rideId) =>
      _send({'type': 'ride_bid_withdraw', 'rideId': rideId});

  /// Advance the matched ride lifecycle.
  /// [status] ∈ {arriving, arrived, in_progress, completed}.
  void sendRideStatus(String rideId, String status) =>
      _send({'type': 'ride_status', 'rideId': rideId, 'status': status});

  /// Cancel the matched ride.
  void cancelRide(String rideId) =>
      _send({'type': 'ride_cancel', 'rideId': rideId});

  /// Stream the driver's GPS to the matched passenger.
  void sendRideLocation(String rideId, double lat, double lng) =>
      _send({'type': 'ride_location', 'rideId': rideId, 'lat': lat, 'lng': lng});

  /// Watch a specific ride for live updates.
  void subscribeRide(String rideId) =>
      _send({'type': 'subscribe_ride', 'rideId': rideId});

  void unsubscribeRide(String rideId) =>
      _send({'type': 'unsubscribe_ride', 'rideId': rideId});

  // ── Chat ────────────────────────────────────────────────────────────────────

  void subscribeChat(String rideId) =>
      _send({'type': 'subscribe_chat', 'rideId': rideId});

  void unsubscribeChat(String rideId) =>
      _send({'type': 'unsubscribe_chat', 'rideId': rideId});

  void sendChat(String rideId, String text) =>
      _send({'type': 'chat_send', 'rideId': rideId, 'text': text});

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

        case 'ride_request_new':
          final ride = msg['ride'];
          if (ride is Map<String, dynamic>) _rideRequestCtrl.add(ride);

        case 'ride_update':
          final ride = msg['ride'];
          if (ride is Map<String, dynamic>) _rideUpdateCtrl.add(ride);

        case 'chat_message':
          final m = msg['message'];
          if (m is Map<String, dynamic>) _chatCtrl.add(m);

        default:
          break;
      }
    } catch (_) {}
  }
}
