import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/theme_provider.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';
import 'package:nexum_driver/core/domain/service_type_provider.dart';
import 'package:nexum_driver/core/domain/work_mode.dart';
import 'package:nexum_driver/core/domain/work_mode_provider.dart';
import 'package:nexum_driver/core/mock_data/deliveries_mock.dart';
import 'package:nexum_driver/core/mock_data/driver_mock.dart';
import 'package:nexum_driver/core/mock_data/errands_mock.dart';
import 'package:nexum_driver/core/mock_data/passengers_mock.dart';
import 'package:nexum_driver/core/mock_data/trips_mock.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/active_trip_provider.dart';
import 'package:nexum_driver/features/driver_status/domain/entities/driver_status_entity.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
import 'package:nexum_driver/features/notifications/presentation/providers/notification_provider.dart';
import 'package:nexum_driver/features/ride_pool/domain/entities/ride_entities.dart';
import 'package:nexum_driver/features/ride_pool/presentation/providers/ride_pool_provider.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/delivery_details.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/errand_details.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/passenger_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/services/audio_service.dart';
import 'package:nexum_driver/shared/services/driver_ws_service.dart';

// ── State ──────────────────────────────────────────────────────────────────

class _HomeState {
  const _HomeState({
    this.isOnline = false,
    this.pendingRequest,
    this.requestSecondsLeft = AppConstants.tripRequestTimeoutSeconds,
  });

  final bool isOnline;
  final TripRequestEntity? pendingRequest;
  final int requestSecondsLeft;

  _HomeState copyWith({
    bool? isOnline,
    TripRequestEntity? pendingRequest,
    bool clearPending = false,
    int? requestSecondsLeft,
  }) {
    return _HomeState(
      isOnline: isOnline ?? this.isOnline,
      pendingRequest:
          clearPending ? null : (pendingRequest ?? this.pendingRequest),
      requestSecondsLeft: requestSecondsLeft ?? this.requestSecondsLeft,
    );
  }
}

// ── Pantalla ────────────────────────────────────────────────────────────────

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  _HomeState _state = const _HomeState();
  final _mapController = MapController();
  final _sheetController = DraggableScrollableController();
  bool _showHeatmap = false;
  bool _bannerDismissed = false;

  // Snap points del bottom sheet arrastrable (fracción de la altura).
  static const double _sheetCollapsed = 0.12;
  static const double _sheetHalf = 0.46;
  static const double _sheetFull = 0.92;

  static const _kDailyTripGoal = 10;

  static String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }

  /// Contextual earning opportunity based on the current hour.
  static _Opportunity _currentOpportunity() {
    final h = DateTime.now().hour;
    if (h >= 6 && h < 9) {
      return const _Opportunity(
        icon: Icons.wb_twilight_rounded,
        title: 'Hora pico matutina',
        subtitle: 'Alta demanda hacia el centro · +25% tarifa',
        color: AppColors.warning,
        badge: '+25%',
      );
    }
    if (h >= 11 && h < 14) {
      return const _Opportunity(
        icon: Icons.restaurant_rounded,
        title: 'Hora del almuerzo',
        subtitle: 'Más viajes cerca de restaurantes',
        color: AppColors.serviceTaxi,
        badge: 'Alta',
      );
    }
    if (h >= 17 && h < 20) {
      return const _Opportunity(
        icon: Icons.local_fire_department_rounded,
        title: 'Hora pico · tarifa dinámica',
        subtitle: 'Demanda elevada en toda Pamplona · +30%',
        color: AppColors.error,
        badge: '+30%',
      );
    }
    if (h >= 20 && h < 23) {
      return const _Opportunity(
        icon: Icons.nightlife_rounded,
        title: 'Demanda nocturna',
        subtitle: 'Zona universitaria activa ahora',
        color: AppColors.serviceParticular,
        badge: 'Media',
      );
    }
    return const _Opportunity(
      icon: Icons.insights_rounded,
      title: 'Explora zonas de demanda',
      subtitle: 'Activa el mapa de calor para ver puntos calientes',
      color: AppColors.primary,
      badge: 'Mapa',
    );
  }

  Timer? _countdownTimer;
  Timer? _webMockTimer;
  StreamSubscription<Map<String, dynamic>>? _wsTripSub;
  StreamSubscription<Map<String, dynamic>>? _wsErrandSub;
  StreamSubscription<Map<String, dynamic>>? _wsDeliverySub;
  StreamSubscription<String>? _wsCancelSub;
  StreamSubscription<String>? _wsErrandCancelSub;
  StreamSubscription<String>? _wsDeliveryCancelSub;
  final _rng = math.Random();

  // Solicitudes de negociación que el conductor descartó manualmente: se
  // ocultan sin enviar oferta (puede volver a verlas abriendo el pool).
  final Set<String> _dismissedRideIds = <String>{};

  static const _center = LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _webMockTimer?.cancel();
    _wsTripSub?.cancel();
    _wsErrandSub?.cancel();
    _wsDeliverySub?.cancel();
    _wsCancelSub?.cancel();
    _wsErrandCancelSub?.cancel();
    _wsDeliveryCancelSub?.cancel();
    _mapController.dispose();
    _sheetController.dispose();
    super.dispose();
  }

  // ── Online toggle ──────────────────────────────────────────────────────

  void _toggleOnline() {
    final goingOnline = !_state.isOnline;
    setState(() {
      _state = _state.copyWith(isOnline: goingOnline, clearPending: true);
    });

    if (goingOnline) {
      final modes = ref.read(selectedWorkModesProvider);
      AppSnackbar.showSuccess(
        context,
        'En línea · Recibiendo ${_modesLabel(modes)}',
      );
      _connectWs();
    } else {
      _webMockTimer?.cancel();
      _countdownTimer?.cancel();
      _wsTripSub?.cancel();
      _wsErrandSub?.cancel();
      _wsDeliverySub?.cancel();
      _wsCancelSub?.cancel();
      _wsErrandCancelSub?.cancel();
      _wsDeliveryCancelSub?.cancel();
      ref.read(ridePoolProvider.notifier).clear();
      _dismissedRideIds.clear();
      DriverWsService().disconnect();
      AppSnackbar.showInfo(context, 'Desconectado. No recibirás solicitudes.');
    }
  }

  // ── Work mode label ────────────────────────────────────────────────────

  String _modesLabel(Set<WorkMode> modes) {
    if (modes.length == 1) return '${modes.first.seekingLabel}.';
    return '${modes.length} categorías de trabajo.';
  }

  // ── WebSocket connection ───────────────────────────────────────────────

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<void> _connectWs() async {
    final token = await _storage.read(key: AppConstants.authTokenKey);
    if (token == null || token.isEmpty) {
      _scheduleWebMockRequest();
      return;
    }

    final modes = ref.read(selectedWorkModesProvider);
    final connected = await DriverWsService().connect(token, modes);

    if (!connected || !mounted) {
      _scheduleWebMockRequest();
      return;
    }

    // Subscribe to incoming trip requests from the server.
    _wsTripSub = DriverWsService().tripRequests.listen((tripMap) {
      if (!mounted) return;
      final request = _tripRequestFromMap(tripMap);
      if (request != null) _onTripRequest(request);
    });

    // Subscribe to incoming errand requests from the server.
    _wsErrandSub = DriverWsService().errandRequests.listen((errandMap) {
      if (!mounted) return;
      final request = _errandRequestFromMap(errandMap);
      if (request != null) _onTripRequest(request);
    });

    // Subscribe to incoming delivery requests (pedido / paquete).
    _wsDeliverySub = DriverWsService().deliveryRequests.listen((deliveryMap) {
      if (!mounted) return;
      final request = _deliveryRequestFromMap(deliveryMap);
      if (request != null) _onTripRequest(request);
    });

    // Clear the pending request if the server cancels the trip (timeout).
    _wsCancelSub = DriverWsService().tripCancellations.listen((tripId) {
      if (!mounted) return;
      if (_state.pendingRequest?.id == tripId) {
        _countdownTimer?.cancel();
        setState(() => _state = _state.copyWith(clearPending: true));
      }
    });

    // Clear the pending request if the server cancels the errand (timeout).
    _wsErrandCancelSub =
        DriverWsService().errandCancellations.listen((errandId) {
      if (!mounted) return;
      if (_state.pendingRequest?.id == errandId) {
        _countdownTimer?.cancel();
        setState(() => _state = _state.copyWith(clearPending: true));
      }
    });

    // Clear the pending request if the server cancels the delivery (timeout).
    _wsDeliveryCancelSub =
        DriverWsService().deliveryCancellations.listen((deliveryId) {
      if (!mounted) return;
      if (_state.pendingRequest?.id == deliveryId) {
        _countdownTimer?.cancel();
        setState(() => _state = _state.copyWith(clearPending: true));
      }
    });

    // Únete al pool de negociación (estilo InDrive). Las solicitudes con
    // precio del cliente llegan por aquí y se muestran como tarjeta en el Home.
    ref.read(ridePoolProvider.notifier).register();
  }

  /// Build a [TripRequestEntity] from a raw trip JSON map received via WS.
  TripRequestEntity? _tripRequestFromMap(Map<String, dynamic> t) {
    try {
      final p = t['passenger'] as Map<String, dynamic>;
      final o = t['origin'] as Map<String, dynamic>;
      final d = t['destination'] as Map<String, dynamic>;
      final name = p['name'] as String;
      return TripRequestEntity(
        id: t['id'] as String,
        passenger: PassengerEntity(
          id: (p['id'] as String?) ?? '',
          name: name,
          rating: (p['rating'] as num).toDouble(),
          totalTrips: 0,
          photoUrl:
              'https://ui-avatars.com/api/?name=${Uri.encodeComponent(name)}'
              '&background=00C853&color=fff&size=128',
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
        estimatedFare: (t['estimatedFare'] as num).toDouble(),
        distanceToPickupKm: 0.5,
        etaToPickupMinutes: 3,
        requestedAt: DateTime.now(),
      );
    } catch (_) {
      return null;
    }
  }

  /// Build a [TripRequestEntity] (with [ErrandDetails]) from a raw errand
  /// JSON map received via WS. Uses Pamplona-centre placeholder coords
  /// because the WS errand payload does not include coordinates.
  TripRequestEntity? _errandRequestFromMap(Map<String, dynamic> e) {
    try {
      const double pamplonaCenterLat = MapConstants.pamplonaCenterLat;
      const double pamplonaCenterLng = MapConstants.pamplonaCenterLng;

      final categoryStr = e['category'] as String? ?? 'other';
      final category = ErrandCategory.values.firstWhere(
        (c) => c.name == categoryStr,
        orElse: () => ErrandCategory.other,
      );

      final errand = ErrandDetails(
        category: category,
        description: e['description'] as String? ?? '',
        purchaseBudget:
            e['purchaseBudget'] != null ? (e['purchaseBudget'] as num).toDouble() : null,
        notes: e['notes'] as String?,
      );

      return TripRequestEntity(
        id: e['id'] as String,
        passenger: const PassengerEntity(
          id: '',
          name: 'Cliente',
          rating: 5.0,
          totalTrips: 0,
          photoUrl: '',
        ),
        origin: LocationModel(
          latitude: pamplonaCenterLat,
          longitude: pamplonaCenterLng,
          address: e['pickupAddress'] as String? ?? '',
        ),
        destination: LocationModel(
          latitude: pamplonaCenterLat,
          longitude: pamplonaCenterLng,
          address: e['dropoffAddress'] as String? ?? '',
        ),
        distanceKm: 0,
        durationMinutes: 0,
        estimatedFare:
            e['serviceFee'] != null ? (e['serviceFee'] as num).toDouble() : 0,
        distanceToPickupKm: 0.5,
        etaToPickupMinutes: 3,
        requestedAt: DateTime.now(),
        errand: errand,
      );
    } catch (_) {
      return null;
    }
  }

  /// Build a [TripRequestEntity] (with [DeliveryDetails]) from a raw delivery
  /// JSON map received via WS (pedido / paquete). Uses Pamplona-centre
  /// placeholder coords because the payload has no coordinates.
  TripRequestEntity? _deliveryRequestFromMap(Map<String, dynamic> e) {
    try {
      const double pamplonaCenterLat = MapConstants.pamplonaCenterLat;
      const double pamplonaCenterLng = MapConstants.pamplonaCenterLng;

      final delivery = DeliveryDetails(
        kind: DeliveryKind.fromApi(e['kind'] as String?),
        title: e['title'] as String? ?? 'Entrega',
        itemDescription: e['itemDescription'] as String? ?? '',
        recipientName: e['recipientName'] as String? ?? 'Cliente',
        recipientPhone: e['recipientPhone'] as String? ?? '',
        notes: e['notes'] as String?,
      );

      return TripRequestEntity(
        id: e['id'] as String,
        passenger: PassengerEntity(
          id: '',
          name: delivery.recipientName,
          rating: 5.0,
          totalTrips: 0,
          photoUrl: '',
        ),
        origin: LocationModel(
          latitude: pamplonaCenterLat,
          longitude: pamplonaCenterLng,
          address: e['pickupAddress'] as String? ?? '',
        ),
        destination: LocationModel(
          latitude: pamplonaCenterLat,
          longitude: pamplonaCenterLng,
          address: e['dropoffAddress'] as String? ?? '',
        ),
        distanceKm:
            e['distanceKm'] != null ? (e['distanceKm'] as num).toDouble() : 0,
        durationMinutes: e['estimatedMinutes'] != null
            ? (e['estimatedMinutes'] as num).toInt()
            : 0,
        estimatedFare: e['estimatedFare'] != null
            ? (e['estimatedFare'] as num).toDouble()
            : 0,
        distanceToPickupKm: 0.5,
        etaToPickupMinutes: 3,
        requestedAt: DateTime.now(),
        delivery: delivery,
      );
    } catch (_) {
      return null;
    }
  }

  // ── Mock trip dispatch ─────────────────────────────────────────────────

  void _scheduleWebMockRequest() {
    _webMockTimer?.cancel();
    final delay = Duration(
      seconds: AppConstants.minTripRequestIntervalSeconds +
          _rng.nextInt(
            AppConstants.maxTripRequestIntervalSeconds -
                AppConstants.minTripRequestIntervalSeconds,
          ),
    );
    _webMockTimer = Timer(delay, _fireWebMockRequest);
  }

  void _fireWebMockRequest() {
    if (!mounted || !_state.isOnline) return;
    final tripData =
        TripsMock.tripRequests[_rng.nextInt(TripsMock.tripRequests.length)];
    final passenger = PassengersMock
        .passengers[_rng.nextInt(PassengersMock.passengers.length)];
    final dist = tripData.distanceKm;
    final dur = tripData.durationMinutes;
    final workMode = ref.read(selectedWorkModeProvider);
    final fare = workMode.estimateFare(dist, dur.toDouble()) *
        (1 - workMode.platformCommission);

    // En modo Mandado, adjuntamos un mandado de ejemplo descrito por el
    // cliente. La tarifa para el conductor es la del servicio (sin las
    // compras, que las paga aparte el cliente).
    ErrandDetails? errand;
    if (workMode.isErrand) {
      final mock =
          ErrandsMock.errands[_rng.nextInt(ErrandsMock.errands.length)];
      errand = mock.toDetails();
    }

    // En modo Pedido (domicilio) o Paquete (envío) adjuntamos los datos de la
    // entrega: qué se recoge, a quién se entrega y notas del cliente. Mandado
    // tiene prioridad porque también es un servicio de tipo entrega.
    DeliveryDetails? delivery;
    if (!workMode.isErrand && workMode.isDelivery) {
      final catalog = workMode == WorkMode.paquete
          ? DeliveriesMock.parcels
          : DeliveriesMock.foodOrders;
      delivery = catalog[_rng.nextInt(catalog.length)].toDetails();
    }

    final request = TripRequestEntity(
      id: '${tripData.id}_${DateTime.now().millisecondsSinceEpoch}',
      passenger: passenger,
      origin: LocationModel(
        latitude: tripData.originLat,
        longitude: tripData.originLng,
        address: tripData.originAddress,
      ),
      destination: LocationModel(
        latitude: tripData.destinationLat,
        longitude: tripData.destinationLng,
        address: tripData.destinationAddress,
      ),
      distanceKm: dist,
      durationMinutes: dur,
      estimatedFare: fare,
      distanceToPickupKm: 0.5,
      etaToPickupMinutes: 3,
      requestedAt: DateTime.now(),
      errand: errand,
      delivery: delivery,
    );
    _onTripRequest(request);
  }

  void _onTripRequest(TripRequestEntity request) {
    if (!mounted || !_state.isOnline) return;
    AudioService().playTripRequest();
    setState(() {
      _state = _state.copyWith(
        pendingRequest: request,
        requestSecondsLeft: AppConstants.tripRequestTimeoutSeconds,
      );
    });
    _startCountdown(request);
  }

  void _startCountdown(TripRequestEntity request) {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      final newLeft = _state.requestSecondsLeft - 1;
      if (newLeft <= 0) {
        timer.cancel();
        setState(() => _state = _state.copyWith(clearPending: true));
        if (_state.isOnline && !DriverWsService().isConnected) {
          _scheduleWebMockRequest();
        }
      } else {
        setState(() => _state = _state.copyWith(requestSecondsLeft: newLeft));
      }
    });
  }

  Future<void> _acceptTrip(TripRequestEntity request) async {
    _countdownTimer?.cancel();
    setState(() => _state = _state.copyWith(clearPending: true));
    if (DriverWsService().isConnected) {
      if (request.isErrand) {
        DriverWsService().sendAcceptErrand(request.id);
      } else if (request.isDelivery) {
        DriverWsService().sendAcceptDelivery(request.id);
      } else {
        DriverWsService().sendAccept(request.id);
      }
    }
    await ref.read(activeTripProvider.notifier).beginTrip(request);
    if (mounted) context.push('/active-trip');
  }

  void _rejectTrip(TripRequestEntity request) {
    _countdownTimer?.cancel();
    setState(() => _state = _state.copyWith(clearPending: true));
    if (DriverWsService().isConnected) {
      if (request.isErrand) {
        DriverWsService().sendRejectErrand(request.id);
      } else if (request.isDelivery) {
        DriverWsService().sendRejectDelivery(request.id);
      } else {
        DriverWsService().sendReject(request.id);
      }
    }
    if (_state.isOnline && !DriverWsService().isConnected) {
      _scheduleWebMockRequest();
    }
  }

  List<CircleMarker> _buildHeatmapCircles() {
    return [
      CircleMarker(
        point: const LatLng(7.3752, -72.6479),
        radius: 200,
        color: AppColors.error.withValues(alpha: 0.25),
        borderColor: AppColors.error.withValues(alpha: 0.6),
        borderStrokeWidth: 2,
        useRadiusInMeter: true,
      ),
      CircleMarker(
        point: const LatLng(7.3694, -72.6521),
        radius: 250,
        color: AppColors.error.withValues(alpha: 0.25),
        borderColor: AppColors.error.withValues(alpha: 0.6),
        borderStrokeWidth: 2,
        useRadiusInMeter: true,
      ),
      CircleMarker(
        point: const LatLng(7.3783, -72.6451),
        radius: 200,
        color: AppColors.warning.withValues(alpha: 0.25),
        borderColor: AppColors.warning.withValues(alpha: 0.6),
        borderStrokeWidth: 2,
        useRadiusInMeter: true,
      ),
      CircleMarker(
        point: const LatLng(7.3741, -72.6498),
        radius: 150,
        color: AppColors.warning.withValues(alpha: 0.25),
        borderColor: AppColors.warning.withValues(alpha: 0.6),
        borderStrokeWidth: 2,
        useRadiusInMeter: true,
      ),
      CircleMarker(
        point: const LatLng(7.3758, -72.6472),
        radius: 150,
        color: AppColors.warning.withValues(alpha: 0.25),
        borderColor: AppColors.warning.withValues(alpha: 0.6),
        borderStrokeWidth: 2,
        useRadiusInMeter: true,
      ),
      CircleMarker(
        point: const LatLng(7.3715, -72.6543),
        radius: 150,
        color: AppColors.primary.withValues(alpha: 0.2),
        borderColor: AppColors.primary.withValues(alpha: 0.5),
        borderStrokeWidth: 1,
        useRadiusInMeter: true,
      ),
      CircleMarker(
        point: const LatLng(7.3769, -72.6505),
        radius: 150,
        color: AppColors.primary.withValues(alpha: 0.2),
        borderColor: AppColors.primary.withValues(alpha: 0.5),
        borderStrokeWidth: 1,
        useRadiusInMeter: true,
      ),
    ];
  }

  // ── Map controls ───────────────────────────────────────────────────────

  /// Re-centre the map on the driver's current position with a smooth move.
  void _recenterMap() {
    HapticFeedback.selectionClick();
    _mapController.move(_driverLatLng, MapConstants.initialZoom);
  }

  // ── Build ──────────────────────────────────────────────────────────────

  static const _driverLatLng = LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );

  @override
  Widget build(BuildContext context) {
    final serviceType = ref.watch(selectedServiceTypeProvider);
    final workMode = ref.watch(selectedWorkModeProvider);

    // Negociación InDrive: navega a la vista de viaje activo al hacer match y
    // avisa (sonido) cuando entra una nueva solicitud con precio.
    ref.listen<RidePoolState>(ridePoolProvider, (prev, next) {
      if (prev?.activeRide == null && next.activeRide != null) {
        AppSnackbar.showSuccess(context, '¡El pasajero aceptó tu oferta!');
        context.push('/ride-pool');
        return;
      }
      final prevCount = prev?.openRides.length ?? 0;
      if (_state.isOnline && next.openRides.length > prevCount) {
        AudioService().playTripRequest();
      }
    });

    // La solicitud de negociación visible: la más reciente no descartada,
    // siempre que no haya un modal de dispatch legacy abierto.
    final poolState = ref.watch(ridePoolProvider);
    RideEntity? incomingRide;
    if (_state.isOnline && _state.pendingRequest == null) {
      for (final r in poolState.openRides) {
        if (!_dismissedRideIds.contains(r.id)) {
          incomingRide = r;
          break;
        }
      }
    }

    return Scaffold(
      drawer: _AppDrawer(
        selectedServiceType: serviceType,
        isOnline: _state.isOnline,
      ),
      body: Stack(
        children: [
          // Map
          FlutterMap(
            mapController: _mapController,
            options: const MapOptions(
              initialCenter: _center,
              initialZoom: MapConstants.initialZoom,
            ),
            children: [
              TileLayer(
                urlTemplate:
                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.nexum.driver',
              ),
              if (_showHeatmap)
                CircleLayer(circles: _buildHeatmapCircles()),
              if (_state.isOnline)
                MarkerLayer(
                  markers: [
                    Marker(
                      point: _driverLatLng,
                      width: 48,
                      height: 48,
                      child: Container(
                        decoration: BoxDecoration(
                          color: workMode.color,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 3),
                          boxShadow: [
                            BoxShadow(
                              color: workMode.color.withValues(alpha: 0.45),
                              blurRadius: 12,
                              offset: const Offset(0, 3),
                            ),
                          ],
                        ),
                        child: Icon(
                          workMode.icon,
                          color: Colors.white,
                          size: 22,
                        ),
                      ),
                    ),
                  ],
                ),
            ],
          ),
          // Top bar + opportunity banner
          SafeArea(
            child: Column(
              children: [
                _buildTopBar(serviceType),
                if (!_bannerDismissed)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppConstants.spacingM,
                      0,
                      AppConstants.spacingM,
                      AppConstants.spacingS,
                    ),
                    child: _OpportunityBanner(
                      opportunity: _currentOpportunity(),
                      onTap: () {
                        HapticFeedback.selectionClick();
                        setState(() => _showHeatmap = true);
                      },
                      onDismiss: () =>
                          setState(() => _bannerDismissed = true),
                    ),
                  ),
              ],
            ),
          ),
          // Floating glass map controls — anclados justo encima del sheet
          // colapsado para que el mapa quede lo más visible posible.
          Positioned(
            right: AppConstants.spacingM,
            bottom: MediaQuery.sizeOf(context).height * _sheetCollapsed +
                AppConstants.spacingS,
            child: _MapControlsCluster(
              heatmapOn: _showHeatmap,
              onToggleHeatmap: () => setState(
                () => _showHeatmap = !_showHeatmap,
              ),
              onRecenter: _recenterMap,
            ),
          ),
          // Bottom panel como sheet arrastrable de 3 posiciones. El mapa queda
          // siempre interactivo detrás; el sheet se desliza sobre él.
          DraggableScrollableSheet(
            controller: _sheetController,
            initialChildSize: _sheetHalf,
            minChildSize: _sheetCollapsed,
            maxChildSize: _sheetFull,
            snap: true,
            snapSizes: const [_sheetCollapsed, _sheetHalf, _sheetFull],
            builder: (context, scrollController) =>
                _buildBottomPanel(serviceType, scrollController),
          ),
          // Trip request modal
          if (_state.pendingRequest != null)
            _TripRequestModal(
              trip: _state.pendingRequest!,
              workMode: workMode,
              secondsLeft: _state.requestSecondsLeft,
              onAccept: () => _acceptTrip(_state.pendingRequest!),
              onReject: () => _rejectTrip(_state.pendingRequest!),
            ),
          // Negotiation request modal (InDrive-style "pon tu precio").
          if (incomingRide != null)
            _NegotiationRequestModal(
              ride: incomingRide,
              myBid:
                  ref.read(ridePoolProvider.notifier).myBids[incomingRide.id],
              otherCount: poolState.openRides
                  .where((r) =>
                      r.id != incomingRide!.id &&
                      !_dismissedRideIds.contains(r.id))
                  .length,
              onAccept: () {
                HapticFeedback.mediumImpact();
                ref.read(ridePoolProvider.notifier).bid(
                      incomingRide!.id,
                      incomingRide.offeredFare,
                      incomingRide.etaMinutes,
                    );
              },
              onCounter: (fare) => ref.read(ridePoolProvider.notifier).bid(
                    incomingRide!.id,
                    fare,
                    incomingRide.etaMinutes,
                  ),
              onWithdraw: () =>
                  ref.read(ridePoolProvider.notifier).withdraw(incomingRide!.id),
              onDismiss: () =>
                  setState(() => _dismissedRideIds.add(incomingRide!.id)),
              onSeeAll: () => context.push('/ride-pool'),
            ),
        ],
      ),
    );
  }

  Widget _buildTopBar(ServiceType serviceType) {
    final workMode = ref.watch(selectedWorkModeProvider);
    return Padding(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      child: Row(
        children: [
          // Menu button (opens drawer) — earnings, profile y demás viven aquí.
          Builder(
            builder: (ctx) => _MapActionButton(
              icon: Icons.menu_rounded,
              onTap: () => Scaffold.of(ctx).openDrawer(),
            ),
          ),
          const SizedBox(width: AppConstants.spacingS),
          // Online toggle — acción primaria.
          _OnlineToggle(
            isOnline: _state.isOnline,
            workMode: workMode,
            onTap: _toggleOnline,
          ),
          const Spacer(),
          // Notificaciones — único atajo a la derecha (mantiene el badge visible).
          _NotifBell(onTap: () => context.push('/notifications')),
        ],
      ),
    );
  }

  static const _panelBg = Color(0xFF1A1D27);
  static const _panelHandle = Color(0xFF2E3347);
  static const _panelSubText = Color(0xFF94A3B8);
  static const _panelText = Color(0xFFE2E8F0);

  /// Cabecera compacta del sheet: estado de conexión + botón "ver panel".
  /// Es lo único que se ve cuando el sheet está colapsado (mapa 100% visible).
  Widget _buildSheetHeader() {
    final online = _state.isOnline;
    return Row(
      children: [
        AnimatedContainer(
          duration: AppConstants.shortAnimation,
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: online ? AppColors.online : AppColors.offline,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: (online ? AppColors.online : AppColors.offline)
                    .withValues(alpha: 0.5),
                blurRadius: 6,
              ),
            ],
          ),
        ),
        const SizedBox(width: AppConstants.spacingS),
        Expanded(
          child: Text(
            online ? 'En línea · Recibiendo solicitudes' : 'Desconectado',
            style: TextStyle(
              color: online ? AppColors.online : _panelText,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        GestureDetector(
          onTap: () {
            final current =
                _sheetController.isAttached ? _sheetController.size : _sheetHalf;
            _snapSheetTo(
              current <= _sheetCollapsed + 0.05 ? _sheetHalf : _sheetCollapsed,
            );
          },
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Ver panel',
                  style: TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
                SizedBox(width: 2),
                Icon(
                  Icons.unfold_more_rounded,
                  size: 15,
                  color: AppColors.primary,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// Anima el sheet a una posición concreta (snap point).
  void _snapSheetTo(double size) {
    HapticFeedback.selectionClick();
    _sheetController.animateTo(
      size,
      duration: AppConstants.mediumAnimation,
      curve: Curves.easeOutCubic,
    );
  }

  Widget _buildBottomPanel(
    ServiceType serviceType,
    ScrollController scrollController,
  ) {
    final workModes = ref.watch(selectedWorkModesProvider);
    final driverStatus = ref.watch(driverStatusProvider);

    return Container(
      decoration: const BoxDecoration(
        color: _panelBg,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppConstants.radiusXLarge),
        ),
        boxShadow: [
          BoxShadow(
            color: Color(0x55000000),
            blurRadius: 20,
            offset: Offset(0, -5),
          ),
        ],
      ),
      child: ListView(
        controller: scrollController,
        padding: EdgeInsets.only(
          left: AppConstants.spacingL,
          right: AppConstants.spacingL,
          top: AppConstants.spacingS,
          bottom: MediaQuery.of(context).padding.bottom + AppConstants.spacingL,
        ),
        children: [
          // Handle (zona de arrastre)
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
              decoration: BoxDecoration(
                color: _panelHandle,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Cabecera compacta — visible cuando el sheet está colapsado.
          _buildSheetHeader(),
          const SizedBox(height: AppConstants.spacingM),

          // Greeting + daily goal
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${_greeting()}, '
                '${DriverMock.firstName.split(' ').first}',
                style: const TextStyle(
                  color: _panelText,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
              if (driverStatus.dailyTrips >= _kDailyTripGoal)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.successContainer,
                    borderRadius: BorderRadius.circular(
                      AppConstants.radiusSmall,
                    ),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.check_rounded,
                        size: 12,
                        color: AppColors.success,
                      ),
                      SizedBox(width: 2),
                      Text(
                        'Meta lograda',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.success,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${driverStatus.dailyTrips}/$_kDailyTripGoal viajes hoy',
                style: const TextStyle(
                  color: _panelSubText,
                  fontSize: 12,
                ),
              ),
              Text(
                '${((driverStatus.dailyTrips / _kDailyTripGoal) * 100).round().clamp(0, 100)}%',
                style: TextStyle(
                  // Gris cuando aún no hay progreso; verde al avanzar.
                  color: driverStatus.dailyTrips == 0
                      ? _panelSubText
                      : AppColors.primary,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (driverStatus.dailyTrips / _kDailyTripGoal)
                  .clamp(0.0, 1.0),
              minHeight: 6,
              backgroundColor: _panelHandle,
              valueColor: AlwaysStoppedAnimation<Color>(
                driverStatus.dailyTrips == 0
                    ? _panelSubText
                    : driverStatus.dailyTrips >= _kDailyTripGoal
                        ? AppColors.success
                        : AppColors.primary,
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // Stats summary chips (colapsable por sesión)
          _StatsChipRow(
            driverStatus: driverStatus,
            workModes: workModes,
          ),
          const SizedBox(height: AppConstants.spacingM),

          // Session selector — 3 expandable cards
          _SessionSelector(
            selectedModes: workModes,
            onSelectModes: (modes) {
              ref.read(selectedWorkModesProvider.notifier).state = modes;
              if (_state.isOnline) {
                DriverWsService().changeWorkModes(modes);
              }
            },
            onGoToRequests: () => context.push('/ride-pool'),
            onPublishIntercity: () => context.push('/pooled-publish'),
            onMyIntercityTrips: () => context.push('/pooled-trips'),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // Status message
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedContainer(
                duration: AppConstants.shortAnimation,
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: _state.isOnline ? AppColors.online : AppColors.offline,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              Flexible(
                child: Text(
                  _state.isOnline
                      ? 'En línea · Recibiendo solicitudes...'
                      : 'Desconectado · Selecciona una sesión y activa el toggle',
                  style: TextStyle(
                    color: _state.isOnline
                        ? AppColors.online
                        : _panelSubText,
                    fontWeight: FontWeight.w500,
                    fontSize: 12,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Stats chip row ───────────────────────────────────────────────────────────

class _StatsChipRow extends StatelessWidget {
  const _StatsChipRow({
    required this.driverStatus,
    required this.workModes,
  });

  final DriverStatusEntity driverStatus;
  final Set<WorkMode> workModes;

  // Mock per-session distribution — replace with real per-category tracking.
  int get _passengerTrips =>
      ((driverStatus.dailyTrips * 0.55).round()).clamp(0, driverStatus.dailyTrips);
  int get _intercityTrips =>
      driverStatus.dailyTrips > 3 ? 1 : 0;
  int get _deliveryTrips =>
      (driverStatus.dailyTrips - _passengerTrips - _intercityTrips).clamp(0, driverStatus.dailyTrips);

  double get _passengerEarnings => driverStatus.dailyEarnings * 0.52;
  double get _intercityEarnings => _intercityTrips > 0 ? driverStatus.dailyEarnings * 0.30 : 0;
  double get _deliveryEarnings =>
      driverStatus.dailyEarnings - _passengerEarnings - _intercityEarnings;

  String _fmt(double v) {
    if (v >= 1000) return '\$${(v / 1000).toStringAsFixed(0)}k';
    return '\$${v.round()}';
  }

  void _showDetail(BuildContext context, String title, int trips, double earnings, Color color) {
    HapticFeedback.selectionClick();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _StatDetailSheet(
        title: title,
        trips: trips,
        earnings: earnings,
        color: color,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _Chip(
            icon: Icons.people_alt_rounded,
            label: 'Pasajero',
            value: '$_passengerTrips · ${_fmt(_passengerEarnings)}',
            color: AppColors.serviceParticular,
            onTap: () => _showDetail(
              context, 'Pasajero', _passengerTrips, _passengerEarnings,
              AppColors.serviceParticular,
            ),
          ),
          const SizedBox(width: AppConstants.spacingS),
          _Chip(
            icon: Icons.directions_bus_rounded,
            label: 'Intermunicipal',
            value: '$_intercityTrips · ${_fmt(_intercityEarnings)}',
            color: AppColors.secondary,
            onTap: () => _showDetail(
              context, 'Intermunicipal', _intercityTrips, _intercityEarnings,
              AppColors.secondary,
            ),
          ),
          const SizedBox(width: AppConstants.spacingS),
          _Chip(
            icon: Icons.delivery_dining_rounded,
            label: 'Domicilios',
            value: '$_deliveryTrips · ${_fmt(_deliveryEarnings)}',
            color: AppColors.serviceEnvios,
            onTap: () => _showDetail(
              context, 'Domicilios', _deliveryTrips, _deliveryEarnings,
              AppColors.serviceEnvios,
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final VoidCallback onTap;

  static const _bg = Color(0xFF252836);
  static const _border = Color(0xFF2E3347);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: _bg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: _border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 6),
            Text(
              value,
              style: const TextStyle(
                color: Color(0xFFE2E8F0),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.keyboard_arrow_down_rounded, size: 14, color: Color(0xFF64748B)),
          ],
        ),
      ),
    );
  }
}

class _StatDetailSheet extends StatelessWidget {
  const _StatDetailSheet({
    required this.title,
    required this.trips,
    required this.earnings,
    required this.color,
  });

  final String title;
  final int trips;
  final double earnings;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final commission = earnings * 0.13;
    final net = earnings - commission;

    return Container(
      margin: const EdgeInsets.all(AppConstants.spacingM),
      padding: const EdgeInsets.all(AppConstants.spacingL),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1D27),
        borderRadius: BorderRadius.circular(AppConstants.radiusXLarge),
        border: Border.all(color: const Color(0xFF2E3347)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.bar_chart_rounded, color: color, size: 20),
              ),
              const SizedBox(width: AppConstants.spacingS),
              Text(
                title,
                style: const TextStyle(
                  color: Color(0xFFE2E8F0),
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: const Icon(Icons.close_rounded, color: Color(0xFF64748B), size: 20),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingL),
          _SheetRow(label: 'Viajes completados', value: '$trips viajes'),
          const SizedBox(height: AppConstants.spacingS),
          _SheetRow(
            label: 'Ganancia bruta',
            value: CurrencyFormatter.format(earnings),
          ),
          const SizedBox(height: AppConstants.spacingS),
          _SheetRow(
            label: 'Comisión plataforma (13%)',
            value: '− ${CurrencyFormatter.format(commission)}',
            valueColor: AppColors.error,
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppConstants.spacingS),
            child: Divider(color: Color(0xFF2E3347)),
          ),
          _SheetRow(
            label: 'Ganancia neta',
            value: CurrencyFormatter.format(net),
            valueColor: AppColors.primary,
            bold: true,
          ),
          const SizedBox(height: AppConstants.spacingM),
        ],
      ),
    );
  }
}

class _SheetRow extends StatelessWidget {
  const _SheetRow({
    required this.label,
    required this.value,
    this.valueColor = const Color(0xFFE2E8F0),
    this.bold = false,
  });

  final String label;
  final String value;
  final Color valueColor;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
        ),
        Text(
          value,
          style: TextStyle(
            color: valueColor,
            fontSize: 13,
            fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

// ── Session selector (3 expandable accordion cards) ──────────────────────────

enum _DriverSession { passenger, intercity, domicilios }

/// Acción (botón) dentro de una tarjeta de sesión.
typedef _SessionAction = ({IconData icon, String label, VoidCallback onTap});

class _SessionSelector extends StatefulWidget {
  const _SessionSelector({
    required this.selectedModes,
    required this.onSelectModes,
    required this.onGoToRequests,
    required this.onPublishIntercity,
    required this.onMyIntercityTrips,
  });

  final Set<WorkMode> selectedModes;
  final ValueChanged<Set<WorkMode>> onSelectModes;
  final VoidCallback onGoToRequests;
  final VoidCallback onPublishIntercity;
  final VoidCallback onMyIntercityTrips;

  @override
  State<_SessionSelector> createState() => _SessionSelectorState();
}

class _SessionSelectorState extends State<_SessionSelector> {
  _DriverSession _expanded = _DriverSession.passenger;

  static const _sessions = [
    (
      session: _DriverSession.passenger,
      icon: Icons.people_alt_rounded,
      label: 'Pasajero',
      sublabel: 'Viajes urbanos locales',
      color: AppColors.serviceParticular,
      modes: {WorkMode.pasajero},
    ),
    (
      session: _DriverSession.intercity,
      icon: Icons.directions_bus_rounded,
      label: 'Intermunicipal',
      sublabel: 'Viajes entre ciudades',
      color: AppColors.secondary,
      modes: {WorkMode.pasajero},
    ),
    (
      session: _DriverSession.domicilios,
      icon: Icons.delivery_dining_rounded,
      label: 'Domicilios',
      sublabel: 'Pedidos, paquetes y mandados',
      color: AppColors.serviceEnvios,
      modes: {WorkMode.pedido, WorkMode.paquete, WorkMode.mandado},
    ),
  ];

  void _select(_DriverSession session, Set<WorkMode> modes) {
    HapticFeedback.selectionClick();
    setState(() => _expanded = session);
    widget.onSelectModes(modes);
  }

  /// Botones que muestra cada sesión al expandirse.
  List<_SessionAction> _actionsFor(_DriverSession session) {
    switch (session) {
      case _DriverSession.intercity:
        return [
          (
            icon: Icons.add_road_rounded,
            label: 'Publicar viaje',
            onTap: widget.onPublishIntercity,
          ),
          (
            icon: Icons.event_seat_rounded,
            label: 'Mis viajes',
            onTap: widget.onMyIntercityTrips,
          ),
        ];
      case _DriverSession.passenger:
      case _DriverSession.domicilios:
        return [
          (
            icon: Icons.bolt_rounded,
            label: 'Ver solicitudes',
            onTap: widget.onGoToRequests,
          ),
        ];
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: _sessions.map((s) {
        final isOpen = _expanded == s.session;
        return Padding(
          padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
          child: _SessionCard(
            icon: s.icon,
            label: s.label,
            sublabel: s.sublabel,
            color: s.color,
            isOpen: isOpen,
            isIntercity: s.session == _DriverSession.intercity,
            onTap: () => _select(s.session, s.modes),
            actions: _actionsFor(s.session),
          ),
        );
      }).toList(),
    );
  }
}

class _SessionCard extends StatelessWidget {
  const _SessionCard({
    required this.icon,
    required this.label,
    required this.sublabel,
    required this.color,
    required this.isOpen,
    required this.isIntercity,
    required this.onTap,
    required this.actions,
  });

  final IconData icon;
  final String label;
  final String sublabel;
  final Color color;
  final bool isOpen;
  final bool isIntercity;
  final VoidCallback onTap;
  final List<_SessionAction> actions;

  static const _cardBg = Color(0xFF252836);
  static const _activeBg = Color(0xFF1E2436);
  static const _border = Color(0xFF2E3347);
  static const _subText = Color(0xFF94A3B8);

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: AppConstants.mediumAnimation,
      curve: Curves.easeInOut,
      decoration: BoxDecoration(
        color: isOpen ? _activeBg : _cardBg,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isOpen ? color.withValues(alpha: 0.45) : _border,
          width: isOpen ? 1.5 : 1,
        ),
        boxShadow: isOpen
            ? [
                BoxShadow(
                  color: color.withValues(alpha: 0.18),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header row — always visible
          GestureDetector(
            onTap: onTap,
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingM,
                vertical: 12,
              ),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: isOpen ? 0.20 : 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, color: color, size: 20),
                  ),
                  const SizedBox(width: AppConstants.spacingS),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          label,
                          style: TextStyle(
                            color: isOpen ? const Color(0xFFE2E8F0) : const Color(0xFFCBD5E1),
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          sublabel,
                          style: const TextStyle(
                            color: _subText,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                  AnimatedRotation(
                    turns: isOpen ? 0.5 : 0,
                    duration: AppConstants.mediumAnimation,
                    curve: Curves.easeInOut,
                    child: Icon(
                      Icons.keyboard_arrow_down_rounded,
                      color: isOpen ? color : _subText,
                      size: 20,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Expanded body
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity, height: 0),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppConstants.spacingM,
                0,
                AppConstants.spacingM,
                AppConstants.spacingM,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 1,
                    color: const Color(0xFF2E3347),
                    margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
                  ),
                  // Quick info row
                  Row(
                    children: [
                      _InfoChip(
                        icon: Icons.payments_outlined,
                        label: isIntercity ? 'Desde' : 'Tarifa base',
                        value: isIntercity
                            ? '\$22.000'
                            : label == 'Domicilios'
                                ? '\$3.500'
                                : '\$4.000',
                        color: color,
                      ),
                      const SizedBox(width: AppConstants.spacingS),
                      _InfoChip(
                        icon: isIntercity
                            ? Icons.event_seat_rounded
                            : Icons.add_road_rounded,
                        label: isIntercity ? 'Por puesto' : 'Por km',
                        value: isIntercity ? 'Tú fijas' : '+\$1.000',
                        color: color,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppConstants.spacingS),
                  // Action buttons (1 o 2 según la sesión)
                  Row(
                    children: [
                      for (var i = 0; i < actions.length; i++) ...[
                        if (i > 0)
                          const SizedBox(width: AppConstants.spacingS),
                        Expanded(
                          child: _SessionActionButton(
                            // El primer botón es el primario (relleno tintado).
                            primary: i == 0,
                            action: actions[i],
                            color: color,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            crossFadeState: isOpen ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: AppConstants.mediumAnimation,
            sizeCurve: Curves.easeInOut,
          ),
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xFF1A1D27),
          borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
          border: Border.all(color: const Color(0xFF2E3347)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
            ),
            const SizedBox(height: 2),
            Text(
              value,
              style: TextStyle(
                color: color,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Botón de acción dentro de una tarjeta de sesión. El primario va relleno
/// (tinte del color de la sesión); los secundarios van con borde.
class _SessionActionButton extends StatelessWidget {
  const _SessionActionButton({
    required this.primary,
    required this.action,
    required this.color,
  });

  final bool primary;
  final _SessionAction action;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        action.onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 11),
        decoration: BoxDecoration(
          color: primary
              ? color.withValues(alpha: 0.16)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: Border.all(
            color: color.withValues(alpha: primary ? 0.40 : 0.25),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(action.icon, color: color, size: 18),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                action.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: color,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Opportunity banner ───────────────────────────────────────────────────────

class _Opportunity {
  const _Opportunity({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.badge,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final String badge;
}

class _OpportunityBanner extends StatelessWidget {
  const _OpportunityBanner({
    required this.opportunity,
    required this.onTap,
    required this.onDismiss,
  });

  final _Opportunity opportunity;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Material(
      color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
      elevation: 3,
      shadowColor: AppColors.shadowMedium,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppConstants.spacingM,
            vertical: AppConstants.spacingS + 2,
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: opportunity.color.withValues(alpha: 0.14),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  opportunity.icon,
                  color: opportunity.color,
                  size: 20,
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            opportunity.title,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 1,
                          ),
                          decoration: BoxDecoration(
                            color: opportunity.color,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            opportunity.badge,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ),
                    Text(
                      opportunity.subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                        fontSize: 11,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: onDismiss,
                behavior: HitTestBehavior.opaque,
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(
                    Icons.close_rounded,
                    size: 18,
                    color: AppColors.textTertiary,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Drawer ───────────────────────────────────────────────────────────────────

class _AppDrawer extends ConsumerWidget {
  const _AppDrawer({
    required this.selectedServiceType,
    required this.isOnline,
  });

  final ServiceType selectedServiceType;
  final bool isOnline;

  static String _initials() {
    final first = DriverMock.firstName.split(' ').first;
    final last = DriverMock.lastName.split(' ').first;
    return '${first[0]}${last[0]}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final themeDark = ref.watch(
      themeProvider.select((m) => m == ThemeMode.dark),
    );

    return Drawer(
      backgroundColor:
          isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      child: SafeArea(
        child: Column(
          children: [
            // ── Header ─────────────────────────────────────────────
            InkWell(
              onTap: () {
                Navigator.of(context).pop();
                context.push('/profile');
              },
              child: Padding(
                padding: const EdgeInsets.all(AppConstants.spacingL),
                child: Row(
                  children: [
                    Stack(
                      children: [
                        Container(
                          width: 54,
                          height: 54,
                          decoration: const BoxDecoration(
                            color: AppColors.primary,
                            shape: BoxShape.circle,
                          ),
                          child: Center(
                            child: Text(
                              _initials(),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                        Positioned(
                          right: 2,
                          bottom: 2,
                          child: Container(
                            width: 14,
                            height: 14,
                            decoration: BoxDecoration(
                              color: isOnline
                                  ? AppColors.online
                                  : AppColors.offline,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: isDark
                                    ? AppColors.surfaceDark
                                    : Colors.white,
                                width: 2,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: AppConstants.spacingM),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${DriverMock.firstName} '
                            '${DriverMock.lastName.split(' ').first}',
                            style: theme.textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w700),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              const Icon(
                                Icons.star_rounded,
                                color: AppColors.star,
                                size: 14,
                              ),
                              const SizedBox(width: 2),
                              Text(
                                DriverMock.rating.toStringAsFixed(2),
                                style: theme.textTheme.bodySmall
                                    ?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                '(${DriverMock.totalRatings})',
                                style: theme.textTheme.bodySmall
                                    ?.copyWith(
                                  color: AppColors.textTertiary,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: AppColors.textSecondary,
                    ),
                  ],
                ),
              ),
            ),
            Divider(
              height: 1,
              color:
                  isDark ? AppColors.outlineDark : AppColors.outlineLight,
            ),
            // ── Navigation items ────────────────────────────────────
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(
                  bottom: AppConstants.spacingS,
                ),
                children: [
                  _DrawerSection(label: 'VIAJES'),
                  _DrawerItem(
                    icon: Icons.home_rounded,
                    label: 'Inicio',
                    iconColor: AppColors.primary,
                    onTap: () => Navigator.of(context).pop(),
                  ),
                  _DrawerItem(
                    icon: Icons.history_rounded,
                    label: 'Historial de viajes',
                    iconColor: const Color(0xFF1565C0),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/trip-history');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.star_rounded,
                    label: 'Calificaciones',
                    iconColor: AppColors.star,
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/ratings');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.bolt_rounded,
                    label: 'Solicitudes en vivo',
                    iconColor: const Color(0xFF00C853),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/ride-pool');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.groups_rounded,
                    label: 'Viajes compartidos',
                    iconColor: const Color(0xFF1E3A8A),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/pooled-trips');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.verified_user_rounded,
                    label: 'Verificación',
                    iconColor: const Color(0xFF00C853),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/verification');
                    },
                  ),
                  _DrawerSection(label: 'FINANZAS'),
                  _DrawerItem(
                    icon: Icons.monetization_on_rounded,
                    label: 'Ganancias',
                    iconColor: const Color(0xFF00897B),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/earnings');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.account_balance_wallet_rounded,
                    label: 'Billetera',
                    iconColor: const Color(0xFF7B1FA2),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/wallet');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.local_offer_rounded,
                    label: 'Promociones',
                    iconColor: const Color(0xFFE65100),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/promotions');
                    },
                  ),
                  _DrawerSection(label: 'HERRAMIENTAS'),
                  _DrawerItem(
                    icon: Icons.bar_chart_rounded,
                    label: 'Rendimiento',
                    iconColor: const Color(0xFF283593),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/performance');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.folder_rounded,
                    label: 'Mis documentos',
                    iconColor: const Color(0xFF01579B),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/documents');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.shield_rounded,
                    label: 'Centro de seguridad',
                    iconColor: AppColors.error,
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/safety');
                    },
                  ),
                  _DrawerSection(label: 'ENVÍOS'),
                  _DrawerItem(
                    icon: Icons.storefront_rounded,
                    label: 'Portal del Negocio',
                    iconColor: AppColors.serviceEnvios,
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/business-portal');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.add_business_rounded,
                    label: 'Registrar negocio',
                    iconColor: AppColors.serviceEnvios,
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/business-registration');
                    },
                  ),
                  _DrawerSection(label: 'CUENTA'),
                  _DrawerItem(
                    icon: Icons.person_outline_rounded,
                    label: 'Mi perfil',
                    iconColor: const Color(0xFF2E7D32),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/profile');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.help_outline_rounded,
                    label: 'Soporte y FAQ',
                    iconColor: const Color(0xFF37474F),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/support');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.settings_outlined,
                    label: 'Configuración',
                    iconColor: const Color(0xFF4A148C),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/settings');
                    },
                  ),
                  Divider(
                    color: isDark
                        ? AppColors.outlineDark
                        : AppColors.outlineLight,
                    indent: AppConstants.spacingM,
                    endIndent: AppConstants.spacingM,
                  ),
                  ListTile(
                    leading: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: const Color(0xFF546E7A)
                            .withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(
                          AppConstants.radiusSmall,
                        ),
                      ),
                      child: const Icon(
                        Icons.dark_mode_rounded,
                        size: 20,
                        color: Color(0xFF546E7A),
                      ),
                    ),
                    title: Text(
                      'Modo oscuro',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    trailing: Switch.adaptive(
                      value: themeDark,
                      onChanged: (v) => ref
                          .read(themeProvider.notifier)
                          .setDark(dark: v),
                      activeTrackColor: AppColors.primary,
                    ),
                    horizontalTitleGap: 12,
                  ),
                  _DrawerItem(
                    icon: Icons.logout_rounded,
                    label: 'Cerrar sesión',
                    iconColor: AppColors.error,
                    isAccent: true,
                    onTap: () {
                      Navigator.of(context).pop();
                      context.go('/login');
                    },
                  ),
                ],
              ),
            ),
            // App version
            Padding(
              padding: const EdgeInsets.all(AppConstants.spacingM),
              child: Text(
                'Nexum Driver v${AppConstants.appVersion}',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: AppColors.textTertiary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerSection extends StatelessWidget {
  const _DrawerSection({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppConstants.spacingL,
        AppConstants.spacingM,
        AppConstants.spacingL,
        AppConstants.spacingXS,
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppColors.textTertiary,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
      ),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.iconColor,
    this.isAccent = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color iconColor;
  final bool isAccent;

  @override
  Widget build(BuildContext context) {
    final labelColor =
        isAccent ? iconColor : AppColors.textPrimary;
    return ListTile(
      leading: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: iconColor.withValues(alpha: 0.12),
          borderRadius:
              BorderRadius.circular(AppConstants.radiusSmall),
        ),
        child: Icon(icon, size: 20, color: iconColor),
      ),
      title: Text(
        label,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w500,
              color: labelColor,
            ),
      ),
      onTap: onTap,
      horizontalTitleGap: 12,
    );
  }
}

// ── Sub-widgets ─────────────────────────────────────────────────────────────

class _OnlineToggle extends StatefulWidget {
  const _OnlineToggle({
    required this.isOnline,
    required this.workMode,
    required this.onTap,
  });

  final bool isOnline;
  final WorkMode workMode;
  final VoidCallback onTap;

  @override
  State<_OnlineToggle> createState() => _OnlineToggleState();
}

class _OnlineToggleState extends State<_OnlineToggle>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseCtrl;
  late final Animation<double> _pulseScale;
  late final Animation<double> _pulseOpacity;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    _pulseScale = Tween<double>(begin: 1.0, end: 2.4).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeOut),
    );
    _pulseOpacity = Tween<double>(begin: 0.5, end: 0.0).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeOut),
    );
    if (widget.isOnline) _pulseCtrl.repeat();
  }

  @override
  void didUpdateWidget(_OnlineToggle oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isOnline && !oldWidget.isOnline) {
      _pulseCtrl.repeat();
    } else if (!widget.isOnline && oldWidget.isOnline) {
      _pulseCtrl.stop();
      _pulseCtrl.reset();
    }
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.isOnline ? AppColors.online : AppColors.offline;
    return GestureDetector(
      onTap: widget.onTap,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          // Pulse ring (only when online)
          if (widget.isOnline)
            AnimatedBuilder(
              animation: _pulseCtrl,
              builder: (context, _) {
                return Opacity(
                  opacity: _pulseOpacity.value,
                  child: Transform.scale(
                    scale: _pulseScale.value,
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.online.withValues(alpha: 0.3),
                      ),
                    ),
                  ),
                );
              },
            ),
          // Toggle pill
          AnimatedContainer(
            duration: AppConstants.shortAnimation,
            padding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingM,
              vertical: AppConstants.spacingS,
            ),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: 0.45),
                  blurRadius: 12,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  widget.isOnline ? Icons.wifi_rounded : Icons.wifi_off_rounded,
                  color: Colors.white,
                  size: 18,
                ),
                const SizedBox(width: AppConstants.spacingXS),
                Text(
                  widget.isOnline ? 'En línea' : 'Desconectado',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Frosted-glass circular map control (glassmorphism). Used across the top
/// bar so the controls float crisply above the live map.
class _MapActionButton extends StatelessWidget {
  const _MapActionButton({
    required this.icon,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final glass = isDark
        ? Colors.black.withValues(alpha: 0.32)
        : Colors.white.withValues(alpha: 0.55);
    final border = isDark
        ? Colors.white.withValues(alpha: 0.16)
        : Colors.white.withValues(alpha: 0.70);
    final iconColor = isDark ? AppColors.textOnDark : AppColors.textPrimary;

    return ClipOval(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Material(
          color: glass,
          shape: CircleBorder(
            side: BorderSide(color: border, width: 1.2),
          ),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(AppConstants.spacingS + 2),
              child: Icon(icon, size: 22, color: iconColor),
            ),
          ),
        ),
      ),
    );
  }
}

/// Vertical glass cluster of map-only controls (heatmap + recenter), pinned to
/// the right edge above the operational panel. Frosted pill that keeps the
/// map readable while grouping the tools that belong to the map itself.
class _MapControlsCluster extends StatelessWidget {
  const _MapControlsCluster({
    required this.heatmapOn,
    required this.onToggleHeatmap,
    required this.onRecenter,
  });

  final bool heatmapOn;
  final VoidCallback onToggleHeatmap;
  final VoidCallback onRecenter;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final glass = isDark
        ? Colors.black.withValues(alpha: 0.34)
        : Colors.white.withValues(alpha: 0.62);
    final border = isDark
        ? Colors.white.withValues(alpha: 0.16)
        : Colors.white.withValues(alpha: 0.75);
    final divider = isDark
        ? Colors.white.withValues(alpha: 0.12)
        : AppColors.textPrimary.withValues(alpha: 0.08);

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 16,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: Container(
            decoration: BoxDecoration(
              color: glass,
              borderRadius: BorderRadius.circular(26),
              border: Border.all(color: border, width: 1.2),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _MapControlIcon(
                  icon: heatmapOn
                      ? Icons.layers_rounded
                      : Icons.layers_outlined,
                  active: heatmapOn,
                  onTap: onToggleHeatmap,
                ),
                Container(width: 26, height: 1, color: divider),
                _MapControlIcon(
                  icon: Icons.my_location_rounded,
                  active: false,
                  onTap: onRecenter,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MapControlIcon extends StatelessWidget {
  const _MapControlIcon({
    required this.icon,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base = isDark ? AppColors.textOnDark : AppColors.textPrimary;
    return InkWell(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      customBorder: const CircleBorder(),
      child: Padding(
        padding: const EdgeInsets.all(11),
        child: Icon(
          icon,
          size: 22,
          color: active ? AppColors.primary : base,
        ),
      ),
    );
  }
}

class _NotifBell extends ConsumerWidget {
  const _NotifBell({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(
      notificationProvider.select(
        (list) => list.where((n) => !n.isRead).length,
      ),
    );

    return Stack(
      clipBehavior: Clip.none,
      children: [
        _MapActionButton(
          icon: unread > 0
              ? Icons.notifications_rounded
              : Icons.notifications_outlined,
          onTap: onTap,
        ),
        if (unread > 0)
          Positioned(
            top: -4,
            right: -4,
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: const BoxDecoration(
                color: AppColors.error,
                shape: BoxShape.circle,
              ),
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              child: Text(
                unread > 9 ? '9+' : '$unread',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  height: 1,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
      ],
    );
  }
}

/// Modal que aparece cuando llega una solicitud de viaje nueva.
class _TripRequestModal extends StatelessWidget {
  const _TripRequestModal({
    required this.trip,
    required this.workMode,
    required this.secondsLeft,
    required this.onAccept,
    required this.onReject,
  });

  final TripRequestEntity trip;
  final WorkMode workMode;
  final int secondsLeft;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  /// The badge must reflect the actual request type, not the driver's primary
  /// mode (with multi-select the incoming job may be any enabled category).
  WorkMode get _effectiveMode {
    if (trip.isErrand) return WorkMode.mandado;
    if (trip.isDelivery) {
      return trip.delivery!.kind == DeliveryKind.food
          ? WorkMode.pedido
          : WorkMode.paquete;
    }
    return WorkMode.pasajero;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final progress = secondsLeft / AppConstants.tripRequestTimeoutSeconds;
    final mode = _effectiveMode;

    return Positioned.fill(
      child: GestureDetector(
        onTap: () {},
        child: ColoredBox(
          color: AppColors.overlay,
          child: SafeArea(
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.all(AppConstants.spacingM),
                child: Card(
                  shape: RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.circular(AppConstants.radiusXLarge),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(AppConstants.spacingL),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Work mode badge
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppConstants.spacingS,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: mode.containerColor,
                              borderRadius: BorderRadius.circular(
                                  AppConstants.radiusSmall),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(mode.icon, size: 12, color: mode.color),
                                const SizedBox(width: 4),
                                Text(
                                  mode.displayName,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: mode.color,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: AppConstants.spacingM),
                        // Detalle del mandado (solo en modo Mandado)
                        if (trip.isErrand) ...[
                          _ErrandRequestCard(errand: trip.errand!),
                          const SizedBox(height: AppConstants.spacingM),
                        ],
                        // Detalle de la entrega (modo Pedido / Paquete)
                        if (trip.isDelivery) ...[
                          _DeliveryRequestCard(delivery: trip.delivery!),
                          const SizedBox(height: AppConstants.spacingM),
                        ],
                        // Passenger header
                        Row(
                          children: [
                            const Icon(
                              Icons.person_pin_circle_rounded,
                              color: AppColors.primary,
                              size: 32,
                            ),
                            const SizedBox(width: AppConstants.spacingS),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    trip.passenger.name,
                                    style: theme.textTheme.titleMedium
                                        ?.copyWith(
                                            fontWeight: FontWeight.w700),
                                  ),
                                  Row(
                                    children: [
                                      const Icon(Icons.star_rounded,
                                          color: AppColors.star, size: 14),
                                      const SizedBox(width: 2),
                                      Text(
                                        trip.passenger.rating
                                            .toStringAsFixed(1),
                                        style: theme.textTheme.bodySmall,
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            // Countdown
                            Stack(
                              alignment: Alignment.center,
                              children: [
                                SizedBox(
                                  width: 44,
                                  height: 44,
                                  child: CircularProgressIndicator(
                                    value: progress,
                                    strokeWidth: 3,
                                    backgroundColor: AppColors.outlineLight,
                                    color: progress > 0.4
                                        ? AppColors.primary
                                        : AppColors.warning,
                                  ),
                                ),
                                Text(
                                  '$secondsLeft',
                                  style: theme.textTheme.titleSmall
                                      ?.copyWith(fontWeight: FontWeight.w700),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const Divider(height: AppConstants.spacingL),
                        _RouteRow(
                          icon: Icons.radio_button_checked_rounded,
                          color: AppColors.pickupMarker,
                          label: (trip.isErrand || trip.isDelivery)
                              ? 'Recoger en'
                              : 'Origen',
                          address: trip.origin.address,
                        ),
                        const SizedBox(height: AppConstants.spacingS),
                        _RouteRow(
                          icon: Icons.location_on_rounded,
                          color: AppColors.destinationMarker,
                          label: (trip.isErrand || trip.isDelivery)
                              ? 'Entregar a'
                              : 'Destino',
                          address: trip.destination.address,
                        ),
                        const Divider(height: AppConstants.spacingL),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _FareChip(
                              label: 'Distancia',
                              value:
                                  '${trip.distanceKm.toStringAsFixed(1)} km',
                              icon: Icons.straighten_rounded,
                            ),
                            _FareChip(
                              label: 'Duración',
                              value: '~${trip.durationMinutes} min',
                              icon: Icons.access_time_rounded,
                            ),
                            _FareChip(
                              label: 'Ganancia',
                              value: CurrencyFormatter.format(
                                  trip.estimatedFare),
                              icon: Icons.payments_outlined,
                              highlight: true,
                            ),
                          ],
                        ),
                        const SizedBox(height: AppConstants.spacingL),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: onReject,
                                child: const Text('Rechazar'),
                              ),
                            ),
                            const SizedBox(width: AppConstants.spacingM),
                            Expanded(
                              flex: 2,
                              child: ElevatedButton(
                                onPressed: onAccept,
                                child: const Text('Aceptar viaje'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RouteRow extends StatelessWidget {
  const _RouteRow({
    required this.icon,
    required this.color,
    required this.label,
    required this.address,
  });

  final IconData icon;
  final Color color;
  final String label;
  final String address;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, color: color, size: 18),
        const SizedBox(width: AppConstants.spacingS),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary, fontSize: 10),
            ),
            Text(
              address,
              style:
                  theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ],
    );
  }
}

class _FareChip extends StatelessWidget {
  const _FareChip({
    required this.label,
    required this.value,
    required this.icon,
    this.highlight = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Icon(
          icon,
          size: 18,
          color: highlight ? AppColors.primary : AppColors.textSecondary,
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: theme.textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: highlight ? AppColors.primary : AppColors.textPrimary,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
            fontSize: 10,
          ),
        ),
      ],
    );
  }
}

/// Tarjeta que muestra el detalle del mandado dentro de la solicitud
/// entrante: categoría, descripción en lenguaje natural, presupuesto
/// autorizado para compras y notas del cliente.
class _ErrandRequestCard extends StatelessWidget {
  const _ErrandRequestCard({required this.errand});

  final ErrandDetails errand;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = errand.category.color;

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: accent.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(errand.category.icon, size: 17, color: accent),
              ),
              const SizedBox(width: 10),
              Text(
                errand.category.label,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  color: accent,
                ),
              ),
              const Spacer(),
              if (errand.hasBudget)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: accent,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'Hasta ${CurrencyFormatter.format(errand.purchaseBudget!)}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            errand.description,
            style: theme.textTheme.bodyMedium?.copyWith(
              height: 1.35,
              color: AppColors.textPrimary,
            ),
          ),
          if (errand.notes != null) ...[
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.sticky_note_2_rounded,
                    size: 14, color: AppColors.textSecondary),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    errand.notes!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (errand.hasBudget) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(Icons.account_balance_wallet_rounded,
                    size: 13, color: accent),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'El cliente paga las compras aparte. '
                    'Guarda el comprobante.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ── Delivery request card (pedido / paquete) ──────────────────────────────────

class _DeliveryRequestCard extends StatelessWidget {
  const _DeliveryRequestCard({required this.delivery});

  final DeliveryDetails delivery;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = delivery.kind.color;

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: accent.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(delivery.kind.icon, size: 17, color: accent),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  delivery.title,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: accent,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            delivery.itemDescription,
            style: theme.textTheme.bodyMedium?.copyWith(
              height: 1.35,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.person_outline_rounded,
                  size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '${delivery.recipientName} · ${delivery.recipientPhone}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
            ],
          ),
          if (delivery.hasNotes) ...[
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.sticky_note_2_rounded,
                    size: 14, color: AppColors.textSecondary),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    delivery.notes!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Incoming ride-negotiation request shown on the Home (InDrive-style).
///
/// Lets the driver accept the passenger's offered fare, counter-offer a
/// different price, or dismiss. Once a bid is placed it shows a "waiting"
/// state until the passenger picks a driver (which triggers a match).
class _NegotiationRequestModal extends StatelessWidget {
  const _NegotiationRequestModal({
    required this.ride,
    required this.myBid,
    required this.otherCount,
    required this.onAccept,
    required this.onCounter,
    required this.onWithdraw,
    required this.onDismiss,
    required this.onSeeAll,
  });

  final RideEntity ride;
  final double? myBid;
  final int otherCount;
  final VoidCallback onAccept;
  final void Function(double fare) onCounter;
  final VoidCallback onWithdraw;
  final VoidCallback onDismiss;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasBid = myBid != null;

    return Positioned.fill(
      child: ColoredBox(
        color: AppColors.overlay,
        child: SafeArea(
          child: Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.all(AppConstants.spacingM),
              child: Card(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppConstants.radiusXLarge),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(AppConstants.spacingL),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppConstants.spacingS,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer,
                              borderRadius:
                                  BorderRadius.circular(AppConstants.radiusSmall),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.sell_rounded,
                                    size: 12, color: AppColors.primaryDim),
                                SizedBox(width: 4),
                                Text(
                                  'Pon tu precio',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.primaryDim,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Spacer(),
                          if (!hasBid)
                            IconButton(
                              visualDensity: VisualDensity.compact,
                              onPressed: onDismiss,
                              icon: const Icon(Icons.close_rounded, size: 20),
                              color: AppColors.textSecondary,
                            ),
                        ],
                      ),
                      const SizedBox(height: AppConstants.spacingS),
                      // Passenger + offered fare
                      Row(
                        children: [
                          const Icon(Icons.person_pin_circle_rounded,
                              color: AppColors.primary, size: 30),
                          const SizedBox(width: AppConstants.spacingS),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  ride.clientName,
                                  style: theme.textTheme.titleMedium
                                      ?.copyWith(fontWeight: FontWeight.w700),
                                ),
                                Text(
                                  '${ride.distanceKm.toStringAsFixed(1)} km · '
                                  '${ride.etaMinutes} min',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                      color: AppColors.textSecondary),
                                ),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              const Text('Ofrece',
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: AppColors.textSecondary)),
                              Text(
                                CurrencyFormatter.format(ride.offeredFare),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 18,
                                  color: AppColors.primaryDim,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: AppConstants.spacingM),
                      _routeRow(Icons.trip_origin_rounded, ride.originAddress,
                          AppColors.primary),
                      const SizedBox(height: 4),
                      _routeRow(Icons.place_rounded, ride.destinationAddress,
                          AppColors.error),
                      if (ride.notes != null && ride.notes!.isNotEmpty) ...[
                        const SizedBox(height: AppConstants.spacingS),
                        Text('“${ride.notes}”',
                            style: theme.textTheme.bodySmall?.copyWith(
                                fontStyle: FontStyle.italic,
                                color: AppColors.textSecondary)),
                      ],
                      const SizedBox(height: AppConstants.spacingM),
                      if (hasBid)
                        _waitingState(context)
                      else
                        _actions(context),
                      if (otherCount > 0) ...[
                        const SizedBox(height: AppConstants.spacingXS),
                        Center(
                          child: TextButton(
                            onPressed: onSeeAll,
                            child: Text('Ver $otherCount solicitud(es) más'),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _actions(BuildContext context) => Row(
        children: [
          Expanded(
            child: ElevatedButton(
              onPressed: onAccept,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child:
                  Text('Aceptar ${CurrencyFormatter.format(ride.offeredFare)}'),
            ),
          ),
          const SizedBox(width: AppConstants.spacingS),
          OutlinedButton(
            onPressed: () => _showCounter(context),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.primaryDim,
              side: const BorderSide(color: AppColors.primaryDim),
              padding: const EdgeInsets.symmetric(
                  horizontal: AppConstants.spacingM, vertical: 14),
            ),
            child: const Text('Contraoferta'),
          ),
        ],
      );

  Widget _waitingState(BuildContext context) => Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.infoContainer,
                borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
              ),
              child: Text(
                'Oferta enviada: ${CurrencyFormatter.format(myBid!)}\n'
                'Esperando respuesta del pasajero…',
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: AppColors.info, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(width: AppConstants.spacingS),
          TextButton(
            onPressed: onWithdraw,
            child: const Text('Retirar',
                style: TextStyle(color: AppColors.error)),
          ),
        ],
      );

  Widget _routeRow(IconData icon, String text, Color color) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: const TextStyle(fontSize: 13),
                maxLines: 2,
                overflow: TextOverflow.ellipsis),
          ),
        ],
      );

  void _showCounter(BuildContext context) {
    final ctrl = TextEditingController(
      text: (ride.offeredFare + 1000).toStringAsFixed(0),
    );
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Tu contraoferta',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(
              'El pasajero ofreció ${CurrencyFormatter.format(ride.offeredFare)}.',
              style: const TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration: const InputDecoration(
                prefixText: r'$ ',
                labelText: 'Precio (COP)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: () {
                  final fare = double.tryParse(
                      ctrl.text.replaceAll(RegExp(r'[^0-9.]'), ''));
                  if (fare != null && fare > 0) {
                    onCounter(fare);
                    Navigator.pop(ctx);
                  }
                },
                child: const Text('Enviar contraoferta'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}


