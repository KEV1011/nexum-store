import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/theme_provider.dart';
import 'package:nexum_driver/core/config/api_config.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';
import 'package:nexum_driver/core/domain/service_type_provider.dart';
import 'package:nexum_driver/core/domain/work_mode.dart';
import 'package:nexum_driver/core/domain/work_mode_provider.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/active_trip_provider.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/service_prefs_provider.dart';
import 'package:nexum_driver/features/intercity/presentation/providers/intercity_driver_provider.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_profile_provider.dart';
import 'package:nexum_driver/features/notifications/presentation/providers/notification_provider.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/errand_details.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/passenger_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/services/audio_service.dart';
import 'package:nexum_driver/shared/services/driver_ws_service.dart';
import 'package:nexum_driver/shared/services/location_service.dart';
import 'package:nexum_driver/shared/services/push_notification_service.dart';

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
  bool _showHeatmap = false;
  bool _bannerDismissed = false;

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
        subtitle: 'Demanda elevada en tu zona · +30%',
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
  StreamSubscription<Map<String, dynamic>>? _wsTripSub;
  StreamSubscription<Map<String, dynamic>>? _wsErrandSub;
  StreamSubscription<Map<String, dynamic>>? _wsOrderSub;
  StreamSubscription<String>? _wsCancelSub;
  StreamSubscription<String>? _wsErrandCancelSub;
  StreamSubscription<String>? _wsOrderCancelSub;

  static const _center = LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );

  @override
  void initState() {
    super.initState();
    // Load driver profile so isVerified is available when toggle is pressed.
    WidgetsBinding.instance.addPostFrameCallback(
      (_) {
        ref.read(driverProfileProvider.notifier).load();
        // Estado real del modo intermunicipal para el switch del panel.
        ref.read(intercityDriverProvider.notifier).loadAvailability();
        // Preferencias de servicio (qué solicitudes recibe).
        ref.read(servicePrefsProvider.notifier).load();
      },
    );
    // Con sesión activa, registrar el token FCM en el backend para recibir
    // solicitudes de viaje aunque la app esté en background.
    unawaited(PushNotificationService().syncTokenToBackend());
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _wsTripSub?.cancel();
    _wsErrandSub?.cancel();
    _wsOrderSub?.cancel();
    _wsCancelSub?.cancel();
    _wsErrandCancelSub?.cancel();
    _wsOrderCancelSub?.cancel();
    _mapController.dispose();
    super.dispose();
  }

  // ── Online toggle ──────────────────────────────────────────────────────

  void _toggleOnline() {
    final goingOnline = !_state.isOnline;

    // Block going online when the driver is not yet verified.
    if (goingOnline) {
      final profile = ref.read(driverProfileProvider).profile;
      if (profile != null && !profile.isVerified) {
        context.push(AppRoutes.verification);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Debes completar la verificación antes de recibir viajes.',
            ),
            backgroundColor: Color(0xFFF57F17),
          ),
        );
        return;
      }
    }

    setState(() {
      _state = _state.copyWith(isOnline: goingOnline, clearPending: true);
    });

    if (goingOnline) {
      AppSnackbar.showSuccess(
        context,
        'En línea · Recibes viajes, envíos, mandados y pedidos',
      );
      _connectWs();
    } else {
      _countdownTimer?.cancel();
      _wsTripSub?.cancel();
      _wsErrandSub?.cancel();
      _wsOrderSub?.cancel();
      _wsCancelSub?.cancel();
      _wsErrandCancelSub?.cancel();
      _wsOrderCancelSub?.cancel();
      LocationService().stopTracking();
      DriverWsService().disconnect();
      AppSnackbar.showInfo(context, 'Desconectado. No recibirás solicitudes.');
    }
  }

  // ── WebSocket connection ───────────────────────────────────────────────

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<void> _connectWs() async {
    final token = await _storage.read(key: AppConstants.authTokenKey);
    if (token == null || token.isEmpty) {
      if (mounted) {
        AppSnackbar.showInfo(
          context, 'Tu sesión expiró. Cierra sesión y vuelve a entrar.');
      }
      return;
    }

    final workMode = ref.read(selectedWorkModeProvider);
    final connected = await DriverWsService().connect(token, workMode);

    if (!connected || !mounted) {
      // App real: sin conexión NO inventamos pedidos. Avisamos y el socket
      // reintenta solo (auto-reconexión en DriverWsService).
      if (mounted) {
        AppSnackbar.showInfo(
          context, 'No se pudo conectar con el servidor. Reintentando…');
      }
      return;
    }

    // Transmite el GPS al backend: alimenta el matching geoespacial para que
    // este conductor sea asignable y, durante un viaje, mueve su punto en el
    // mapa del pasajero. Arranca el tracking tras resolver el permiso, con o
    // sin GPS: si se deniega (p. ej. web), LocationService reporta el centro de
    // Pamplona como heartbeat para que el conductor siga siendo asignable.
    unawaited(
      LocationService().requestPermissions().then((_) {
        LocationService().startTracking();
      }),
    );

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

    // Subscribe to incoming business-order delivery offers.
    _wsOrderSub = DriverWsService().orderRequests.listen((orderMap) {
      if (!mounted) return;
      final request = _orderRequestFromMap(orderMap);
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

    // El cliente canceló un pedido pendiente (aún sin recoger): retira la oferta.
    _wsOrderCancelSub = DriverWsService().orderCancellations.listen((orderId) {
      if (!mounted) return;
      if (_state.pendingRequest?.orderId == orderId) {
        _countdownTimer?.cancel();
        setState(() => _state = _state.copyWith(clearPending: true));
        AppSnackbar.showInfo(context, 'El cliente canceló el pedido.');
      }
    });
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

  /// Build a [TripRequestEntity] from a raw `order_request` (entrega de pedido
  /// a negocio). Origen = el negocio donde recoger; destino = dirección de
  /// entrega; tarifa = el domicilio que gana el repartidor.
  TripRequestEntity? _orderRequestFromMap(Map<String, dynamic> o) {
    try {
      const double fallbackLat = MapConstants.pamplonaCenterLat;
      const double fallbackLng = MapConstants.pamplonaCenterLng;
      final businessName = o['businessName'] as String? ?? 'Negocio';
      final itemsCount = (o['itemsCount'] as num?)?.toInt() ?? 0;
      // Coordenadas reales del backend: negocio (recogida) y entrega. La entrega
      // cae al negocio si el pedido no trajo coords de destino.
      final bizLat = (o['businessLat'] as num?)?.toDouble() ?? fallbackLat;
      final bizLng = (o['businessLng'] as num?)?.toDouble() ?? fallbackLng;
      final delLat = (o['deliveryLat'] as num?)?.toDouble() ?? bizLat;
      final delLng = (o['deliveryLng'] as num?)?.toDouble() ?? bizLng;

      return TripRequestEntity(
        id: o['id'] as String,
        orderId: o['id'] as String,
        passenger: PassengerEntity(
          id: '',
          name: businessName,
          rating: 5.0,
          totalTrips: 0,
          photoUrl: '',
        ),
        origin: LocationModel(
          latitude: bizLat,
          longitude: bizLng,
          address: o['businessAddress'] as String? ?? businessName,
        ),
        destination: LocationModel(
          latitude: delLat,
          longitude: delLng,
          address: o['deliveryAddress'] as String? ?? '',
        ),
        distanceKm: 0,
        durationMinutes: 0,
        estimatedFare: (o['deliveryFee'] as num?)?.toDouble() ?? 0,
        distanceToPickupKm: 0.5,
        etaToPickupMinutes: 3,
        requestedAt: DateTime.now(),
        errand: ErrandDetails(
          category: ErrandCategory.other,
          description:
              'Pedido ${o['orderRef'] ?? ''} · $itemsCount producto(s) de $businessName',
        ),
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
      } else {
        setState(() => _state = _state.copyWith(requestSecondsLeft: newLeft));
      }
    });
  }

  Future<void> _acceptTrip(TripRequestEntity request) async {
    _countdownTimer?.cancel();
    setState(() => _state = _state.copyWith(clearPending: true));
    if (DriverWsService().isConnected) {
      if (request.isOrder) {
        DriverWsService().sendAcceptOrder(request.orderId!);
      } else if (request.isErrand) {
        DriverWsService().sendAcceptErrand(request.id);
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
      if (request.isOrder) {
        DriverWsService().sendRejectOrder(request.orderId!);
      } else if (request.isErrand) {
        DriverWsService().sendRejectErrand(request.id);
      } else {
        DriverWsService().sendReject(request.id);
      }
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

  // ── Build ──────────────────────────────────────────────────────────────

  static const _driverLatLng = LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );

  @override
  Widget build(BuildContext context) {
    final serviceType = ref.watch(selectedServiceTypeProvider);
    final workMode = ref.watch(selectedWorkModeProvider);

    return Scaffold(
      drawer: _AppDrawer(
        selectedServiceType: serviceType,
        isOnline: _state.isOnline,
      ),
      // El cuerpo se extiende bajo la barra de vidrio (efecto Rappi/Instagram).
      extendBody: true,
      // Sin barra mientras hay una oferta en pantalla: nada debe estorbar el
      // aceptar/rechazar. El CENTRO de la barra es Conectar/Desconectar
      // (Ganancias vive en la píldora superior — sin duplicados).
      bottomNavigationBar: _state.pendingRequest == null
          ? _GlassNavBar(
              isOnline: _state.isOnline,
              onConnectTap: _toggleOnline,
              items: [
                _GlassNavItem(
                  icon: Icons.home_rounded,
                  label: 'Inicio',
                  active: true,
                  onTap: () {},
                ),
                _GlassNavItem(
                  icon: Icons.person_rounded,
                  label: 'Perfil',
                  onTap: () => context.push(AppRoutes.profile),
                ),
              ],
            )
          : null,
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
          // Panel inferior ARRASTRABLE (como la app cliente): colapsado deja
          // ver el mapa; se sube para ver servicios, stats e intermunicipal.
          DraggableScrollableSheet(
            minChildSize: _sheetMin,
            initialChildSize: _sheetInitial,
            maxChildSize: _sheetMax,
            snap: true,
            snapSizes: const [_sheetMin, _sheetInitial, _sheetMax],
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
        ],
      ),
    );
  }

  Widget _buildTopBar(ServiceType serviceType) {
    final earnings = ref.watch(
      driverStatusProvider.select((s) => s.dailyEarnings),
    );
    return Padding(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      child: Row(
        children: [
          // Menu button (opens drawer)
          Builder(
            builder: (ctx) => _MapActionButton(
              icon: Icons.menu_rounded,
              onTap: () => Scaffold.of(ctx).openDrawer(),
            ),
          ),
          const Spacer(),
          // Píldora de ganancias del día (estilo DiDi): arriba, al centro.
          _EarningsPill(
            amount: earnings,
            onTap: () => context.push('/earnings'),
          ),
          const Spacer(),
          _MapActionButton(
            icon: _showHeatmap
                ? Icons.layers_rounded
                : Icons.layers_outlined,
            onTap: () =>
                setState(() => _showHeatmap = !_showHeatmap),
          ),
          const SizedBox(width: AppConstants.spacingS),
          _NotifBell(onTap: () => context.push('/notifications')),
        ],
      ),
    );
  }

  static const _panelBg = Color(0xFF1A1D27);
  static const _panelHandle = Color(0xFF2E3347);
  static const _panelSubText = Color(0xFF94A3B8);
  static const _panelText = Color(0xFFE2E8F0);

  // Tamaños del panel arrastrable (fracción de la pantalla), como la app cliente:
  // colapsado deja el mapa usable; expandido muestra todo el panel.
  static const _sheetMin = 0.30;
  static const _sheetInitial = 0.52;
  static const _sheetMax = 0.92;

  /// Guarda una preferencia de servicio y muestra el error si falla.
  Future<void> _setPref({bool? trips, bool? errands, bool? orders}) async {
    HapticFeedback.selectionClick();
    final error = await ref
        .read(servicePrefsProvider.notifier)
        .set(trips: trips, errands: errands, orders: orders);
    if (error != null && mounted) AppSnackbar.showError(context, error);
  }

  Widget _buildBottomPanel(
    ServiceType serviceType,
    ScrollController scrollController,
  ) {
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
      // El contenido vive dentro del scrollController del sheet: arrastrar el
      // asa sube/baja el panel; con contenido de sobra hace scroll interno.
      child: ListView(
        controller: scrollController,
        padding: EdgeInsets.only(
          left: AppConstants.spacingL,
          right: AppConstants.spacingL,
          top: AppConstants.spacingM,
          // +92: la barra de vidrio flota ENCIMA del panel (extendBody) y el
          // MediaQuery de este context (sobre el Scaffold) no incluye su inset —
          // sin esta compensación el último contenido queda oculto tras la barra.
          bottom: MediaQuery.of(context).padding.bottom + 92,
        ),
        children: [
          // Asa para arrastrar (centrada)
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: _panelHandle,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // Greeting + daily goal
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                // Nombre real del perfil; solo el saludo mientras carga.
                switch (ref.watch(driverProfileProvider
                    .select((s) => s.profile?.fullName))) {
                  final String name when name.trim().isNotEmpty =>
                    '${_greeting()}, ${name.trim().split(' ').first}',
                  _ => _greeting(),
                },
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
                style: const TextStyle(
                  color: AppColors.primary,
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
                driverStatus.dailyTrips >= _kDailyTripGoal
                    ? AppColors.success
                    : AppColors.primary,
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // Tus servicios: DOS opciones reales (no 4 chips decorativos).
          // Pasajeros = viajes; Encargos = pedidos + paquetes + mandados.
          // El backend RESPETA cada toggle al despachar (service-prefs).
          Row(
            children: [
              Expanded(
                child: _ServiceToggleCard(
                  icon: Icons.people_alt_rounded,
                  label: 'Pasajeros',
                  sublabel: 'Viajes en tu ciudad',
                  color: AppColors.primary,
                  value: ref.watch(
                    servicePrefsProvider.select((s) => s.trips),
                  ),
                  onChanged: (v) => _setPref(trips: v),
                ),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: _ServiceToggleCard(
                  icon: Icons.inventory_2_rounded,
                  label: 'Encargos',
                  sublabel: 'Pedidos, paquetes y mandados',
                  color: const Color(0xFFF59E0B),
                  value: ref.watch(
                    servicePrefsProvider
                        .select((s) => s.errands && s.orders),
                  ),
                  onChanged: (v) => _setPref(errands: v, orders: v),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),

          // Stats row
          Row(
            children: [
              _StatCard(
                label: 'Hoy',
                value: DateFormatter.formatRelativeDate(DateTime.now()),
                icon: Icons.calendar_today_outlined,
              ),
              const SizedBox(width: AppConstants.spacingM),
              _StatCard(
                label: 'Ganancias',
                value: CurrencyFormatter.format(driverStatus.dailyEarnings),
                icon: Icons.payments_outlined,
                highlight: true,
              ),
              const SizedBox(width: AppConstants.spacingM),
              _StatCard(
                label: 'Viajes',
                value: driverStatus.dailyTrips.toString(),
                icon: Icons.route_rounded,
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),

          // Intermunicipal: el plus de Nexum — switch de disponibilidad + acceso
          // directo a las reservas (antes vivía escondido en el drawer).
          _IntercityPanelCard(
            onOpen: () => context.push('/intercity-requests'),
          ),
          const SizedBox(height: AppConstants.spacingS),

          // Preferencias de servicio: el conductor elige qué solicitudes recibe.
          InkWell(
            onTap: _openServicePrefs,
            borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
              child: Row(
                children: [
                  const Icon(Icons.tune_rounded,
                      size: 18, color: _panelSubText),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Preferencias de servicio',
                      style: TextStyle(
                        color: _panelText,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Text(
                    _servicePrefsSummary(),
                    style:
                        const TextStyle(color: _panelSubText, fontSize: 11.5),
                  ),
                  const Icon(Icons.chevron_right_rounded,
                      size: 18, color: _panelSubText),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),

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
                      ? 'En línea · Recibes las solicitudes que activaste'
                      : 'Desconectado · Conéctate para recibir solicitudes',
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

  String _servicePrefsSummary() {
    final prefs = ref.watch(servicePrefsProvider);
    final intercity =
        ref.watch(intercityDriverProvider.select((s) => s.enabled));
    final active = [
      if (prefs.trips) 'Pasajeros',
      if (prefs.errands && prefs.orders) 'Encargos',
      if (intercity) 'Intermunicipal',
    ];
    if (active.isEmpty) return 'Nada activo';
    if (active.length == 3) return 'Todo activo';
    return active.join(' · ');
  }

  void _openServicePrefs() {
    HapticFeedback.selectionClick();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _panelBg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppConstants.radiusXLarge),
        ),
      ),
      builder: (ctx) => const _ServicePrefsSheet(),
    );
  }
}

/// Hoja de preferencias de servicio: switches que el backend RESPETA al
/// despachar (matching filtra candidatos por acceptsTrips/Errands/Orders;
/// intermunicipal usa su propio flujo intercityEnabled).
class _ServicePrefsSheet extends ConsumerWidget {
  const _ServicePrefsSheet();

  static const _text = Color(0xFFE2E8F0);
  static const _sub = Color(0xFF94A3B8);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(servicePrefsProvider);
    final intercity =
        ref.watch(intercityDriverProvider.select((s) => s.enabled));

    Future<void> showIfError(Future<String?> op) async {
      final error = await op;
      if (error != null && context.mounted) {
        AppSnackbar.showError(context, error);
      }
    }

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Preferencias de servicio',
              style: TextStyle(
                color: _text,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Elige qué solicitudes recibes estando en línea. '
              'Cada una la decides tú al momento.',
              style: TextStyle(color: _sub, fontSize: 12.5),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              value: prefs.trips,
              onChanged: (v) =>
                  showIfError(ref.read(servicePrefsProvider.notifier).set(trips: v)),
              title: const Text('Pasajeros',
                  style: TextStyle(color: _text, fontSize: 14.5)),
              subtitle: const Text('Viajes en tu ciudad',
                  style: TextStyle(color: _sub, fontSize: 11.5)),
              secondary: const Icon(Icons.people_alt_rounded,
                  color: _sub, size: 22),
              contentPadding: EdgeInsets.zero,
            ),
            // Encargos agrupa pedidos + paquetes + mandados: para el conductor
            // es UNA sola decisión (¿llevo cosas además de personas?).
            SwitchListTile(
              value: prefs.errands && prefs.orders,
              onChanged: (v) => showIfError(ref
                  .read(servicePrefsProvider.notifier)
                  .set(errands: v, orders: v)),
              title: const Text('Encargos',
                  style: TextStyle(color: _text, fontSize: 14.5)),
              subtitle: const Text('Pedidos, paquetes y mandados',
                  style: TextStyle(color: _sub, fontSize: 11.5)),
              secondary: const Icon(Icons.inventory_2_rounded,
                  color: _sub, size: 22),
              contentPadding: EdgeInsets.zero,
            ),
            SwitchListTile(
              value: intercity,
              onChanged: (v) => showIfError(ref
                  .read(intercityDriverProvider.notifier)
                  .setAvailability(enabled: v)),
              title: const Text('Intermunicipal',
                  style: TextStyle(color: _text, fontSize: 14.5)),
              subtitle: const Text('Reservas entre ciudades',
                  style: TextStyle(color: _sub, fontSize: 11.5)),
              secondary:
                  const Icon(Icons.route_rounded, color: _sub, size: 22),
              contentPadding: EdgeInsets.zero,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Barra de vidrio flotante ─────────────────────────────────────────────────
// Píldora translúcida con blur (estilo Rappi/Instagram). En el conductor no es
// un shell de pestañas: Inicio es esta pantalla y el resto navega con push.

class _GlassNavItem {
  const _GlassNavItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;
}

class _GlassNavBar extends StatelessWidget {
  const _GlassNavBar({
    required this.items,
    required this.isOnline,
    required this.onConnectTap,
  });

  /// Ítems laterales: el primero a la izquierda y el resto a la derecha del
  /// botón central Conectar/Desconectar (integrado en la píldora, sin flotar).
  final List<_GlassNavItem> items;
  final bool isOnline;
  final VoidCallback onConnectTap;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(18, 0, 18, 10),
      child: Container(
        // Sombra fuera del clip: un clip recorta su propia sombra.
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(30),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.30),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(30),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
            child: Container(
              height: 66,
              decoration: BoxDecoration(
                color: const Color(0xFF1A1D27).withValues(alpha: 0.66),
                borderRadius: BorderRadius.circular(30),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.16),
                ),
              ),
              child: Stack(
                children: [
                  // Lupa de vidrio (referencia Rappi/iOS liquid glass) sobre el
                  // ítem activo. Columnas visuales: [ítem0, Conectar, resto].
                  Builder(builder: (context) {
                    final cols = items.length + 1;
                    final activeIdx = items.indexWhere((i) => i.active);
                    final visualCol = activeIdx <= 0 ? 0 : activeIdx + 1;
                    return AnimatedAlign(
                      duration: const Duration(milliseconds: 420),
                      curve: Curves.easeOutBack,
                      alignment: Alignment(
                        cols <= 1 ? 0 : -1 + (2 * visualCol / (cols - 1)),
                        0,
                      ),
                      child: FractionallySizedBox(
                        widthFactor: 1 / cols,
                        child: Center(
                          child: Container(
                            width: 54,
                            height: 54,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  Colors.white.withValues(alpha: 0.22),
                                  Colors.white.withValues(alpha: 0.05),
                                ],
                              ),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.30),
                                width: 1.2,
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                  Row(
                    children: [
                      Expanded(child: _buildItem(items[0])),
                      Expanded(child: _buildConnect()),
                      for (final item in items.skip(1))
                        Expanded(child: _buildItem(item)),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Botón central integrado: círculo compacto dentro de la píldora.
  Widget _buildConnect() {
    return InkWell(
      onTap: () {
        HapticFeedback.mediumImpact();
        onConnectTap();
      },
      borderRadius: BorderRadius.circular(30),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: isOnline ? const Color(0xFF2E3347) : AppColors.primary,
              shape: BoxShape.circle,
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.28),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: (isOnline ? Colors.black : AppColors.primary)
                      .withValues(alpha: 0.45),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Icon(
              Icons.power_settings_new_rounded,
              color: isOnline ? const Color(0xFFFCA5A5) : Colors.white,
              size: 19,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            isOnline ? 'Desconectar' : 'Conectar',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: isOnline
                  ? const Color(0xFF94A3B8)
                  : AppColors.primary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItem(_GlassNavItem item) {
    return InkWell(
      onTap: () {
        HapticFeedback.selectionClick();
        item.onTap();
      },
      borderRadius: BorderRadius.circular(30),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            item.icon,
            size: 23,
            color: item.active ? AppColors.primary : const Color(0xFF94A3B8),
          ),
          const SizedBox(height: 3),
          Text(
            item.label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: item.active ? FontWeight.w800 : FontWeight.w600,
              color:
                  item.active ? AppColors.primary : const Color(0xFF94A3B8),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Tarjeta intermunicipal del panel ─────────────────────────────────────────
// Switch de disponibilidad (GET/PUT /driver/intercity/availability vía
// intercityDriverProvider) + navegación a las reservas, con badge de
// solicitudes pendientes. Tocar la tarjeta abre /intercity-requests.

class _IntercityPanelCard extends ConsumerWidget {
  const _IntercityPanelCard({required this.onOpen});

  final VoidCallback onOpen;

  static const _text = Color(0xFFE2E8F0);
  static const _sub = Color(0xFF94A3B8);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final intercity = ref.watch(intercityDriverProvider);
    final pending = intercity.requests.length;

    return Material(
      color: AppColors.intercityBrand.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
            border: Border.all(
              color: AppColors.intercityBrand.withValues(alpha: 0.45),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppColors.intercityBrand,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.route_rounded,
                  color: Colors.white,
                  size: 21,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text(
                          'Intermunicipal',
                          style: TextStyle(
                            color: _text,
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                          ),
                        ),
                        if (pending > 0) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.error,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              '$pending',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      intercity.enabled
                          ? 'Recibes reservas entre ciudades'
                          : 'Actívalo y recibe reservas entre ciudades',
                      style: const TextStyle(color: _sub, fontSize: 11.5),
                    ),
                  ],
                ),
              ),
              Switch(
                value: intercity.enabled,
                onChanged: (v) async {
                  HapticFeedback.selectionClick();
                  final error = await ref
                      .read(intercityDriverProvider.notifier)
                      .setAvailability(enabled: v);
                  if (error != null && context.mounted) {
                    AppSnackbar.showError(context, error);
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Tarjeta-toggle de servicio (Pasajeros / Encargos) ───────────────────────
// Dos opciones reales conectadas a service-prefs: el backend respeta cada
// toggle al despachar. Reemplaza el selector de "enfoque" de 4 chips.

class _ServiceToggleCard extends StatelessWidget {
  const _ServiceToggleCard({
    required this.icon,
    required this.label,
    required this.sublabel,
    required this.color,
    required this.value,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final String sublabel;
  final Color color;
  final bool value;
  final ValueChanged<bool> onChanged;

  static const _text = Color(0xFFE2E8F0);
  static const _sub = Color(0xFF94A3B8);
  static const _offBg = Color(0xFF232736);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onChanged(!value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: value ? color.withValues(alpha: 0.16) : _offBg,
          borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
          border: Border.all(
            color: value
                ? color.withValues(alpha: 0.55)
                : Colors.white.withValues(alpha: 0.06),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: value ? color : _offBg,
                borderRadius: BorderRadius.circular(10),
                border: value
                    ? null
                    : Border.all(color: Colors.white.withValues(alpha: 0.10)),
              ),
              child: Icon(
                icon,
                size: 19,
                color: value ? Colors.white : _sub,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      color: value ? _text : _sub,
                      fontWeight: FontWeight.w800,
                      fontSize: 13.5,
                    ),
                  ),
                  Text(
                    value ? sublabel : 'Desactivado',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: _sub, fontSize: 10),
                  ),
                ],
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

  static String _initials(String? fullName) {
    final parts = (fullName ?? '').trim().split(RegExp(r'\s+'))
      ..removeWhere((p) => p.isEmpty);
    if (parts.isEmpty) return '·';
    final first = parts.first[0];
    final last = parts.length > 1 ? parts.last[0] : '';
    return '$first$last'.toUpperCase();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final themeDark = ref.watch(
      themeProvider.select((m) => m == ThemeMode.dark),
    );
    // Identidad real del conductor (perfil del backend); mientras carga se
    // muestra un encabezado neutro, nunca datos de demostración.
    final profile = ref.watch(driverProfileProvider).profile;

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
                          clipBehavior: Clip.antiAlias,
                          child: profile?.photoUrl != null
                              ? Image.network(
                                  ApiConfig.resolveUrl(profile!.photoUrl!),
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Center(
                                    child: Text(
                                      _initials(profile?.fullName),
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 20,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                )
                              : Center(
                                  child: Text(
                                    _initials(profile?.fullName),
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
                            profile?.fullName ?? 'Tu perfil',
                            style: theme.textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w700),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          if (profile == null)
                            Text(
                              'Completa tu registro',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: AppColors.textTertiary,
                              ),
                            )
                          else
                            Row(
                              children: [
                                const Icon(
                                  Icons.star_rounded,
                                  color: AppColors.star,
                                  size: 14,
                                ),
                                const SizedBox(width: 2),
                                Text(
                                  profile.rating.toStringAsFixed(2),
                                  style: theme.textTheme.bodySmall
                                      ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  '· ${profile.totalTrips} viajes',
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
                    icon: Icons.local_shipping_rounded,
                    label: 'Mis fletes de carga',
                    iconColor: const Color(0xFFF59E0B),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/freights');
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
                    icon: Icons.workspace_premium_rounded,
                    label: 'Nexum Pro',
                    iconColor: const Color(0xFF0EA5E9),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/pro');
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
                    icon: Icons.route_rounded,
                    label: 'Intermunicipal',
                    iconColor: const Color(0xFF1E3A8A),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/intercity-requests');
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
                      // Pantalla real de verificación (sube documentos al
                      // backend); la antigua /documents era una simulación.
                      context.push('/verification');
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
            // Versión + build de CI: permite saber con una mirada qué versión
            // corre el teléfono (mismo rol que el commit en /health).
            Padding(
              padding: const EdgeInsets.all(AppConstants.spacingM),
              child: Text(
                'Nexum Driver v${AppConstants.appVersion} · build $kBuildTag',
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

/// Píldora de ganancias del día (estilo DiDi): flotante, arriba al centro.
/// Toca → pantalla de ganancias reales.
class _EarningsPill extends StatelessWidget {
  const _EarningsPill({required this.amount, required this.onTap});

  final double amount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xEE10131C),
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        borderRadius: BorderRadius.circular(24),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 14,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                CurrencyFormatter.format(amount),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              const SizedBox(width: 6),
              const Icon(
                Icons.keyboard_arrow_down_rounded,
                color: Colors.white70,
                size: 18,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MapActionButton extends StatelessWidget {
  const _MapActionButton({
    required this.icon,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).cardColor,
      borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
      elevation: 2,
      shadowColor: AppColors.shadow,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppConstants.spacingS + 2),
          child: Icon(icon, size: 22, color: AppColors.textPrimary),
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

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    this.highlight = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final bool highlight;

  static const _cardBg = Color(0xFF252836);
  static const _highlightBg = Color(0x1A3B82F6);
  static const _borderColor = Color(0xFF2E3347);
  static const _subText = Color(0xFF94A3B8);
  static const _textColor = Color(0xFFE2E8F0);

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingS,
          vertical: AppConstants.spacingS,
        ),
        decoration: BoxDecoration(
          color: highlight ? _highlightBg : _cardBg,
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: highlight
              ? Border.all(color: AppColors.primary.withValues(alpha: 0.3))
              : Border.all(color: _borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              icon,
              size: 16,
              color: highlight ? AppColors.primary : _subText,
            ),
            const SizedBox(height: 2),
            Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: highlight ? AppColors.primary : _textColor,
                fontSize: 13,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              label,
              style: const TextStyle(
                color: _subText,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final progress = secondsLeft / AppConstants.tripRequestTimeoutSeconds;

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
                              color: workMode.containerColor,
                              borderRadius: BorderRadius.circular(
                                  AppConstants.radiusSmall),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(workMode.icon,
                                    size: 12, color: workMode.color),
                                const SizedBox(width: 4),
                                Text(
                                  workMode.displayName,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: workMode.color,
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
                          label: trip.isErrand ? 'Hacer en' : 'Origen',
                          address: trip.origin.address,
                        ),
                        const SizedBox(height: AppConstants.spacingS),
                        _RouteRow(
                          icon: Icons.location_on_rounded,
                          color: AppColors.destinationMarker,
                          label: trip.isErrand ? 'Entregar a' : 'Destino',
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
