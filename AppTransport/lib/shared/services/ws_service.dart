import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'package:nexum_driver/core/config/api_config.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/intercity/domain/entities/intercity_request_entity.dart';

/// Evento de ciclo de vida de una reserva intermunicipal ya aceptada.
/// `type`: accept_ok | start_ok | complete_ok | update.
class IntercityLifecycleEvent {
  const IntercityLifecycleEvent({
    required this.type,
    required this.bookingId,
    this.status,
    this.finalFare,
  });

  final String type;
  final String bookingId;

  /// Estado del booking según el backend:
  /// searching | driver_found | confirmed | in_progress | completed | cancelled.
  final String? status;
  final double? finalFare;
}

/// Cliente WebSocket singleton para el flujo INTERMUNICIPAL del conductor
/// (ofertas, aceptación/contraoferta, inicio y fin del viaje). Los viajes
/// urbanos usan [DriverWsService]; aquí solo se conserva el tracking de
/// `activeTripId` que consume la pantalla de seguridad.
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

  final _intercityCtrl =
      StreamController<IntercityRequestEntity>.broadcast();
  final _intercityCancelCtrl = StreamController<String>.broadcast();
  final _intercityLifecycleCtrl =
      StreamController<IntercityLifecycleEvent>.broadcast();
  final _errorCtrl = StreamController<String>.broadcast();

  /// Ofertas de reservas intermunicipales (`intercity_request`).
  Stream<IntercityRequestEntity> get intercityRequests =>
      _intercityCtrl.stream;

  /// IDs de reservas intermunicipales canceladas por el cliente.
  Stream<String> get intercityCancellations => _intercityCancelCtrl.stream;

  /// Confirmaciones del backend sobre la reserva aceptada
  /// (accept_ok / start_ok / complete_ok / update).
  Stream<IntercityLifecycleEvent> get intercityLifecycle =>
      _intercityLifecycleCtrl.stream;

  /// Errores enviados por el backend (`{type:'error', message}`), p. ej.
  /// "La reserva ya no está disponible" cuando otro conductor ganó la carrera.
  Stream<String> get wsErrors => _errorCtrl.stream;

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

  /// Acepta una reserva intermunicipal; con [counterFare] propone otra tarifa.
  void acceptIntercity(String bookingId, {double? counterFare}) => _send({
        'type': 'intercity_accept',
        'bookingId': bookingId,
        if (counterFare != null) 'counterFare': counterFare,
      });

  void rejectIntercity(String bookingId) =>
      _send({'type': 'intercity_reject', 'bookingId': bookingId});

  /// Inicia el viaje confirmado (CONFIRMED → IN_PROGRESS).
  void startIntercity(String bookingId) =>
      _send({'type': 'intercity_start', 'bookingId': bookingId});

  /// Finaliza el viaje: el backend liquida y responde `intercity_complete_ok`.
  void completeIntercity(String bookingId) =>
      _send({'type': 'intercity_complete', 'bookingId': bookingId});

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

      if (type == 'trip_accepted') {
        // Extract trip ID from either trip.id or top-level tripId
        final tripData = msg['trip'];
        if (tripData is Map) {
          _activeTripId = tripData['id'] as String?;
        }
        _activeTripId ??= msg['tripId'] as String?;
      } else if (type == 'trip_completed' || type == 'trip_cancelled') {
        _activeTripId = null;
      } else if (type == 'intercity_request') {
        _intercityCtrl.add(IntercityRequestEntity.fromWs(msg));
      } else if (type == 'intercity_cancelled') {
        final bookingId = msg['bookingId'] as String?;
        if (bookingId != null) _intercityCancelCtrl.add(bookingId);
      } else if (type == 'intercity_accept_ok' ||
          type == 'intercity_start_ok' ||
          type == 'intercity_complete_ok' ||
          type == 'intercity_update') {
        final event = _parseLifecycle(type!, msg);
        if (event != null) _intercityLifecycleCtrl.add(event);
      } else if (type == 'error') {
        final message = msg['message'] as String?;
        if (message != null && message.isNotEmpty) _errorCtrl.add(message);
      }
    } catch (_) {}
  }

  IntercityLifecycleEvent? _parseLifecycle(
    String type,
    Map<String, dynamic> msg,
  ) {
    final bookingId = msg['bookingId'] as String?;
    if (bookingId == null) return null;
    final booking = msg['booking'] as Map<String, dynamic>?;
    return IntercityLifecycleEvent(
      // 'intercity_accept_ok' → 'accept_ok', 'intercity_update' → 'update'.
      type: type.replaceFirst('intercity_', ''),
      bookingId: bookingId,
      status: booking?['status'] as String?,
      finalFare: (booking?['finalFare'] as num?)?.toDouble(),
    );
  }
}
