import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'package:nexum_driver/core/config/api_config.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/domain/work_mode.dart';
import 'package:nexum_driver/features/intercity/domain/entities/intercity_request_entity.dart';
import 'package:nexum_driver/shared/services/ws_service.dart' show IntercityLifecycleEvent;

/// Liquidación real de un viaje calculada por el backend. Llega dentro del
/// `trip_status_ack` cuando el conductor reporta `completed`.
class TripSettlement {
  const TripSettlement({
    required this.tripId,
    required this.finalFare,
    required this.netEarning,
    required this.commission,
  });

  final String tripId;
  final double finalFare;
  final double netEarning;
  final double commission;
}

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

  // Auto-reconexión: mantenemos el socket vivo entre caídas (un conductor en
  // viaje no puede dejar de reportar su posición ni de recibir eventos) y
  // reautenticamos con las credenciales y el modo de trabajo vigentes.
  bool _shouldReconnect = false;
  bool _connecting = false;
  int _reconnectAttempts = 0;
  Timer? _reconnectTimer;
  String? _token;
  WorkMode? _workMode;
  // Estado a restaurar tras reconectar: registro en el pool de ofertas y
  // suscripciones activas (ride/chat), por clave '<tipo>:<id>'.
  bool _registeredForRides = false;
  final Map<String, Map<String, dynamic>> _activeSubs = {};

  final _tripCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _errandCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _orderCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _tripCancelCtrl = StreamController<String>.broadcast();
  final _errandCancelCtrl = StreamController<String>.broadcast();
  final _orderCancelCtrl = StreamController<String>.broadcast();
  // Ride negotiation (inDriver-style) + chat.
  final _rideRequestCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _rideUpdateCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _chatCtrl = StreamController<Map<String, dynamic>>.broadcast();
  // Chat persistente del viaje normal: emite {tripId?, message?, history?}.
  final _tripChatCtrl = StreamController<Map<String, dynamic>>.broadcast();
  // Intermunicipal (unificado en la socket principal para recibir en el home).
  final _intercityCtrl = StreamController<IntercityRequestEntity>.broadcast();
  final _intercityCancelCtrl = StreamController<String>.broadcast();
  final _intercityLifecycleCtrl = StreamController<IntercityLifecycleEvent>.broadcast();
  final _wsErrorCtrl = StreamController<String>.broadcast();
  // Liquidaciones confirmadas por el backend, bufferizadas por tripId porque
  // el ack suele llegar antes de que la pantalla de resumen se suscriba.
  final _settlementCtrl = StreamController<TripSettlement>.broadcast();
  final Map<String, TripSettlement> _settlements = {};

  // ── Public streams ────────────────────────────────────────────────────────

  /// Emits the raw `trip` JSON map from every `trip_request` server message.
  Stream<Map<String, dynamic>> get tripRequests => _tripCtrl.stream;

  /// Emits the raw errand JSON map from every `errand_request` server message.
  Stream<Map<String, dynamic>> get errandRequests => _errandCtrl.stream;

  /// Ofertas de PEDIDOS a negocios (`order_request`): el repartidor recibe el
  /// negocio de recogida, la dirección de entrega y el domicilio a ganar.
  Stream<Map<String, dynamic>> get orderRequests => _orderCtrl.stream;

  /// Emits the `tripId` from every `trip_cancelled` server message.
  Stream<String> get tripCancellations => _tripCancelCtrl.stream;

  /// Emits the `errandId` from every `errand_cancelled` server message.
  Stream<String> get errandCancellations => _errandCancelCtrl.stream;

  /// Emits the `orderId` from every `order_cancelled` server message (el cliente
  /// canceló el pedido antes de que el repartidor lo recogiera).
  Stream<String> get orderCancellations => _orderCancelCtrl.stream;

  /// Emits the raw `ride` JSON for every new open request (`ride_request_new`).
  Stream<Map<String, dynamic>> get rideRequests => _rideRequestCtrl.stream;

  /// Emits the raw `ride` JSON for every `ride_update` (matched ride lifecycle).
  Stream<Map<String, dynamic>> get rideUpdates => _rideUpdateCtrl.stream;

  /// Emits the raw `message` JSON for every `chat_message`.
  Stream<Map<String, dynamic>> get chatMessages => _chatCtrl.stream;

  /// Chat del viaje normal: emite {tripId, message?} en vivo o {tripId, history?}.
  Stream<Map<String, dynamic>> get tripChatEvents => _tripChatCtrl.stream;

  /// Ofertas intermunicipales (`intercity_request`) — llegan en el home.
  Stream<IntercityRequestEntity> get intercityRequests => _intercityCtrl.stream;
  Stream<String> get intercityCancellations => _intercityCancelCtrl.stream;
  Stream<IntercityLifecycleEvent> get intercityLifecycle => _intercityLifecycleCtrl.stream;
  Stream<String> get wsErrors => _wsErrorCtrl.stream;

  /// Liquidaciones reales del backend (`trip_status_ack` con `settlement`).
  Stream<TripSettlement> get settlements => _settlementCtrl.stream;

  /// Última liquidación conocida de [tripId], si su ack ya llegó.
  TripSettlement? settlementFor(String tripId) => _settlements[tripId];

  bool get isConnected => _channel != null;

  /// Id del viaje activo. Lo fija la pantalla de viaje activo y lo usa
  /// [LocationService] para etiquetar los `location_update` que transmite
  /// mientras el conductor lleva un pasajero (cuando es null, el GPS alimenta
  /// solo el matching geoespacial sin asociarse a un viaje).
  String? activeTripId;

  // ── connect ───────────────────────────────────────────────────────────────

  /// Connects to the backend WebSocket, sends an `auth` frame with the
  /// driver's JWT and [workMode], and waits up to 4 seconds for `auth_ok`.
  ///
  /// If [token] is `null` the JWT is read from [FlutterSecureStorage].
  /// Returns `true` on successful authentication, `false` otherwise.
  Future<bool> connect(String? token, WorkMode workMode) async {
    _shouldReconnect = true;

    final jwt = token ?? await _storage.read(key: AppConstants.authTokenKey);
    if (jwt == null || jwt.isEmpty) return false;
    _token = jwt;
    _workMode = workMode;

    if (_channel != null) return true;
    return _openAndAuth();
  }

  Future<bool> _openAndAuth() async {
    if (_channel != null) return true;
    if (_connecting) return false;
    final jwt = _token;
    final workMode = _workMode;
    if (jwt == null || jwt.isEmpty || workMode == null) return false;
    _connecting = true;

    try {
      _channel = WebSocketChannel.connect(Uri.parse(ApiConfig.wsUrl));
      await _channel!.ready;

      _authCompleter = Completer<bool>();

      _sub = _channel!.stream.listen(
        _onMessage,
        onError: (_) => _handleDrop(),
        onDone: _handleDrop,
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

      if (authenticated) {
        _reconnectAttempts = 0;
        _replayState();
      } else {
        _handleDrop();
      }

      return authenticated;
    } catch (_) {
      _handleDrop();
      return false;
    } finally {
      _connecting = false;
    }
  }

  /// Maneja una caída (error, cierre o auth fallida): completa el handshake
  /// pendiente, limpia el socket y, si seguimos queriendo estar conectados,
  /// programa una reconexión con backoff exponencial.
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

  /// Tras reautenticar, restaura el registro en el pool de ofertas y las
  /// suscripciones activas (ride/chat) para no perder eventos.
  void _replayState() {
    if (_registeredForRides) _send({'type': 'driver_register'});
    for (final msg in _activeSubs.values) {
      _send(msg);
    }
  }

  // ── disconnect ────────────────────────────────────────────────────────────

  void disconnect() {
    _shouldReconnect = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    activeTripId = null;
    _registeredForRides = false;
    _activeSubs.clear();
    _cleanup();
  }

  void _cleanup() {
    _sub?.cancel();
    _channel?.sink.close();
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

  /// Accept a business-order delivery offer.
  void sendAcceptOrder(String orderId) =>
      _send({'type': 'accept_order', 'orderId': orderId});

  /// Reject a business-order delivery offer.
  void sendRejectOrder(String orderId) =>
      _send({'type': 'reject_order', 'orderId': orderId});

  /// Advance a business-order delivery.
  ///
  /// [status] ∈ {'at_pickup', 'in_transit', 'delivered'}. Al entregar, el
  /// backend liquida el domicilio en la billetera del repartidor.
  void sendOrderStatus(String orderId, String status) =>
      _send({'type': 'order_status', 'orderId': orderId, 'status': status});

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
  void changeWorkMode(WorkMode workMode) {
    // Recordar el modo para reautenticar con él si el socket se reconecta.
    _workMode = workMode;
    _send({'type': 'driver_mode', 'workMode': workMode.name});
  }

  // ── Ride negotiation (inDriver-style) ───────────────────────────────────────

  /// Opt into the live ride pool to start receiving open ride requests.
  void registerForRides() {
    _registeredForRides = true;
    _send({'type': 'driver_register'});
  }

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
      _recordSub('ride:$rideId', {'type': 'subscribe_ride', 'rideId': rideId});

  void unsubscribeRide(String rideId) =>
      _dropSub('ride:$rideId', {'type': 'unsubscribe_ride', 'rideId': rideId});

  // ── Chat ────────────────────────────────────────────────────────────────────

  void subscribeChat(String rideId) =>
      _recordSub('chat:$rideId', {'type': 'subscribe_chat', 'rideId': rideId});

  void unsubscribeChat(String rideId) =>
      _dropSub('chat:$rideId', {'type': 'unsubscribe_chat', 'rideId': rideId});

  void sendChat(String rideId, String text) =>
      _send({'type': 'chat_send', 'rideId': rideId, 'text': text});

  // ── Chat del viaje normal (persistente) ─────────────────────────────────────

  void subscribeTripChat(String tripId) => _recordSub(
      'tripchat:$tripId', {'type': 'subscribe_trip_chat', 'tripId': tripId});

  void unsubscribeTripChat(String tripId) => _dropSub(
      'tripchat:$tripId', {'type': 'unsubscribe_trip_chat', 'tripId': tripId});

  void sendTripChat(String tripId, String text) =>
      _send({'type': 'trip_chat_send', 'tripId': tripId, 'text': text});

  // ── Intermunicipal ──────────────────────────────────────────────────────────

  void acceptIntercity(String bookingId, {double? counterFare}) => _send({
        'type': 'intercity_accept',
        'bookingId': bookingId,
        if (counterFare != null) 'counterFare': counterFare,
      });

  void rejectIntercity(String bookingId) =>
      _send({'type': 'intercity_reject', 'bookingId': bookingId});

  void startIntercity(String bookingId) =>
      _send({'type': 'intercity_start', 'bookingId': bookingId});

  void completeIntercity(String bookingId) =>
      _send({'type': 'intercity_complete', 'bookingId': bookingId});

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

        case 'order_request':
          final order = msg['order'];
          if (order is Map<String, dynamic>) {
            _orderCtrl.add(order);
          }

        case 'trip_cancelled':
          final tripId = msg['tripId'] as String?;
          if (tripId != null) _tripCancelCtrl.add(tripId);

        case 'trip_status_ack':
          final tripId = msg['tripId'] as String?;
          final settlement = msg['settlement'];
          if (tripId != null && settlement is Map<String, dynamic>) {
            final s = TripSettlement(
              tripId: tripId,
              finalFare: (settlement['finalFare'] as num?)?.toDouble() ?? 0,
              netEarning: (settlement['netEarning'] as num?)?.toDouble() ?? 0,
              commission: (settlement['commission'] as num?)?.toDouble() ?? 0,
            );
            _settlements[tripId] = s;
            _settlementCtrl.add(s);
          }

        case 'errand_cancelled':
          final errandId = msg['errandId'] as String?;
          if (errandId != null) _errandCancelCtrl.add(errandId);

        case 'order_cancelled':
          final orderId = msg['orderId'] as String?;
          if (orderId != null) _orderCancelCtrl.add(orderId);

        case 'ride_request_new':
          final ride = msg['ride'];
          if (ride is Map<String, dynamic>) _rideRequestCtrl.add(ride);

        case 'ride_update':
          final ride = msg['ride'];
          if (ride is Map<String, dynamic>) _rideUpdateCtrl.add(ride);

        case 'chat_message':
          final m = msg['message'];
          if (m is Map<String, dynamic>) _chatCtrl.add(m);

        case 'trip_chat_message':
          final tm = msg['message'];
          if (tm is Map<String, dynamic>) {
            _tripChatCtrl.add({'tripId': tm['tripId'], 'message': tm});
          }

        case 'trip_chat_history':
          final list = msg['messages'];
          if (list is List) {
            _tripChatCtrl.add({
              'tripId': msg['tripId'],
              'history': list.whereType<Map<String, dynamic>>().toList(),
            });
          }

        // ── Intermunicipal (unificado en esta socket) ─────────────────────────
        case 'intercity_request':
          _intercityCtrl.add(IntercityRequestEntity.fromWs(msg));

        case 'intercity_cancelled':
          final bId = msg['bookingId'] as String?;
          if (bId != null) _intercityCancelCtrl.add(bId);

        case 'intercity_accept_ok':
        case 'intercity_start_ok':
        case 'intercity_complete_ok':
        case 'intercity_update':
          final ev = _parseIntercityLifecycle(type!, msg);
          if (ev != null) _intercityLifecycleCtrl.add(ev);

        case 'error':
          final m = msg['message'] as String?;
          if (m != null && m.isNotEmpty) _wsErrorCtrl.add(m);

        default:
          break;
      }
    } catch (_) {}
  }

  IntercityLifecycleEvent? _parseIntercityLifecycle(String type, Map<String, dynamic> msg) {
    final bookingId = msg['bookingId'] as String?;
    if (bookingId == null) return null;
    final booking = msg['booking'] as Map<String, dynamic>?;
    return IntercityLifecycleEvent(
      type: type.replaceFirst('intercity_', ''),
      bookingId: bookingId,
      status: booking?['status'] as String?,
      finalFare: (booking?['finalFare'] as num?)?.toDouble(),
    );
  }
}
