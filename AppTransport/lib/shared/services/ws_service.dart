import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'package:nexum_driver/core/config/api_config.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/passenger_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';

/// Singleton WebSocket client for real-time driver ↔ backend communication.
///
/// Lifecycle:
///   connect()    → authenticate → stream trip_request events
///   acceptTrip() / rejectTrip() → send WS messages
///   disconnect() → clean close
class WsService {
  WsService._();
  static final WsService _instance = WsService._();
  factory WsService() => _instance;

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;

  String? _activeTripId;

  final _tripCtrl = StreamController<TripRequestEntity>.broadcast();

  /// Emits every incoming trip request dispatched by the backend.
  Stream<TripRequestEntity> get tripRequests => _tripCtrl.stream;

  /// The ID of the currently active trip, or `null` when no trip is in progress.
  String? get activeTripId => _activeTripId;
  void setActiveTripId(String? tripId) => _activeTripId = tripId;

  bool get isConnected => _channel != null;

  // ── connect ────────────────────────────────────────────────────────────────

  Future<void> connect() async {
    if (kIsWeb) return; // Web demo uses local mock dispatch in HomeScreen
    if (_channel != null) return;

    final token = await _storage.read(key: AppConstants.authTokenKey);
    if (token == null || token.isEmpty) return;

    try {
      _channel = WebSocketChannel.connect(Uri.parse(ApiConfig.wsUrl));
      await _channel!.ready;

      _channel!.sink.add(jsonEncode({'type': 'auth', 'token': token}));

      _sub = _channel!.stream.listen(
        _onMessage,
        onError: (_) => _cleanup(),
        onDone: _cleanup,
        cancelOnError: true,
      );
    } catch (_) {
      _channel = null;
    }
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
  }

  // ── actions ────────────────────────────────────────────────────────────────

  void acceptTrip(String tripId) =>
      _send({'type': 'accept', 'tripId': tripId});

  void rejectTrip(String tripId) =>
      _send({'type': 'reject', 'tripId': tripId});

  void sendLocationUpdate(double lat, double lng, String? tripId) {
    _send({
      'type': 'location_update',
      'lat': lat,
      'lng': lng,
      if (tripId != null) 'tripId': tripId,
    });
  }

  void _send(Map<String, dynamic> msg) {
    if (_channel == null) return;
    try {
      _channel!.sink.add(jsonEncode(msg));
    } catch (_) {}
  }

  // ── message handler ────────────────────────────────────────────────────────

  void _onMessage(dynamic raw) {
    try {
      final msg = jsonDecode(raw as String) as Map<String, dynamic>;
      final type = msg['type'] as String?;

      if (type == 'trip_request') {
        final trip =
            _parseTripRequest(msg['trip'] as Map<String, dynamic>);
        if (trip != null) _tripCtrl.add(trip);
      } else if (type == 'trip_accepted') {
        // Extract trip ID from either trip.id or top-level tripId
        final tripData = msg['trip'];
        if (tripData is Map) {
          _activeTripId = tripData['id'] as String?;
        }
        _activeTripId ??= msg['tripId'] as String?;
      } else if (type == 'trip_completed' || type == 'trip_cancelled') {
        _activeTripId = null;
      }
    } catch (_) {}
  }

  TripRequestEntity? _parseTripRequest(Map<String, dynamic> t) {
    try {
      final p = t['passenger'] as Map<String, dynamic>;
      final o = t['origin'] as Map<String, dynamic>;
      final d = t['destination'] as Map<String, dynamic>;

      final name = p['name'] as String;
      return TripRequestEntity(
        id: t['id'] as String,
        passenger: PassengerEntity(
          id: p['id'] as String,
          name: name,
          rating: (p['rating'] as num).toDouble(),
          totalTrips: 0,
          photoUrl:
              'https://ui-avatars.com/api/?name=${Uri.encodeComponent(name)}&background=00C853&color=fff&size=128',
        ),
        origin: LocationModel(
          latitude: (o['lat'] as num).toDouble(),
          longitude: (o['lng'] as num).toDouble(),
          address: o['address'] as String,
        ),
        destination: LocationModel(
          latitude: (d['lat'] as num).toDouble(),
          longitude: (d['lng'] as num).toDouble(),
          address: d['address'] as String,
        ),
        distanceKm: (t['distanceKm'] as num).toDouble(),
        durationMinutes: (t['estimatedMinutes'] as num).toInt(),
        estimatedFare: (t['netEarning'] as num).toDouble(),
        distanceToPickupKm: 0.5,
        etaToPickupMinutes: 3,
        requestedAt: DateTime.now(),
      );
    } catch (_) {
      return null;
    }
  }
}
