import 'dart:async';
import 'dart:math' as math;

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
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';
import 'package:nexum_driver/core/domain/service_type_provider.dart';
import 'package:nexum_driver/core/domain/work_mode.dart';
import 'package:nexum_driver/core/domain/work_mode_provider.dart';
import 'package:nexum_driver/core/mock_data/driver_mock.dart';
import 'package:nexum_driver/core/mock_data/errands_mock.dart';
import 'package:nexum_driver/core/mock_data/passengers_mock.dart';
import 'package:nexum_driver/core/mock_data/trips_mock.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/active_trip_provider.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
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
  StreamSubscription<String>? _wsCancelSub;
  StreamSubscription<String>? _wsErrandCancelSub;
  final _rng = math.Random();

  static const _center = LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );

  @override
  void initState() {
    super.initState();
    // Load driver profile so isVerified is available when toggle is pressed.
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => ref.read(driverProfileProvider.notifier).load(),
    );
    // Con sesión activa, registrar el token FCM en el backend para recibir
    // solicitudes de viaje aunque la app esté en background.
    unawaited(PushNotificationService().syncTokenToBackend());
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _webMockTimer?.cancel();
    _wsTripSub?.cancel();
    _wsErrandSub?.cancel();
    _wsCancelSub?.cancel();
    _wsErrandCancelSub?.cancel();
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
      final workMode = ref.read(selectedWorkModeProvider);
      AppSnackbar.showSuccess(
        context,
        'En línea · Buscando ${workMode.seekingLabel}...',
      );
      _connectWs();
    } else {
      _webMockTimer?.cancel();
      _countdownTimer?.cancel();
      _wsTripSub?.cancel();
      _wsErrandSub?.cancel();
      _wsCancelSub?.cancel();
      _wsErrandCancelSub?.cancel();
      LocationService().stopTracking();
      DriverWsService().disconnect();
      AppSnackbar.showInfo(context, 'Desconectado. No recibirás solicitudes.');
    }
  }

  // ── Work mode ──────────────────────────────────────────────────────────

  void _selectWorkMode(WorkMode mode) {
    if (_state.isOnline) return;
    ref.read(selectedWorkModeProvider.notifier).state = mode;
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

    final workMode = ref.read(selectedWorkModeProvider);
    final connected = await DriverWsService().connect(token, workMode);

    if (!connected || !mounted) {
      _scheduleWebMockRequest();
      return;
    }

    // Transmite el GPS real al backend: alimenta el matching geoespacial para
    // que este conductor sea asignable y, durante un viaje, mueve su punto en
    // el mapa del pasajero. Sin esto el conductor nunca reporta su posición.
    unawaited(
      LocationService().requestPermissions().then((granted) {
        if (granted) LocationService().startTracking();
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
          // Bottom panel
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _buildBottomPanel(serviceType),
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
    final workMode = ref.watch(selectedWorkModeProvider);
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
          const SizedBox(width: AppConstants.spacingS),
          // Online toggle
          _OnlineToggle(
            isOnline: _state.isOnline,
            workMode: workMode,
            onTap: _toggleOnline,
          ),
          const Spacer(),
          // Earnings shortcut
          _MapActionButton(
            icon: Icons.monetization_on_outlined,
            onTap: () => context.push('/earnings'),
          ),
          const SizedBox(width: AppConstants.spacingS),
          _MapActionButton(
            icon: _showHeatmap
                ? Icons.layers_rounded
                : Icons.layers_outlined,
            onTap: () =>
                setState(() => _showHeatmap = !_showHeatmap),
          ),
          const SizedBox(width: AppConstants.spacingS),
          _NotifBell(onTap: () => context.push('/notifications')),
          const SizedBox(width: AppConstants.spacingS),
          _MapActionButton(
            icon: Icons.person_outline_rounded,
            onTap: () => context.push('/profile'),
          ),
        ],
      ),
    );
  }

  static const _panelBg = Color(0xFF1A1D27);
  static const _panelHandle = Color(0xFF2E3347);
  static const _panelSubText = Color(0xFF94A3B8);
  static const _panelText = Color(0xFFE2E8F0);

  Widget _buildBottomPanel(ServiceType serviceType) {
    final workMode = ref.watch(selectedWorkModeProvider);
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
      padding: EdgeInsets.only(
        left: AppConstants.spacingL,
        right: AppConstants.spacingL,
        top: AppConstants.spacingM,
        bottom: MediaQuery.of(context).padding.bottom + AppConstants.spacingM,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: _panelHandle,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
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

          // Work mode selector (only when offline)
          if (!_state.isOnline) ...[
            _WorkModeSelector(
              selected: workMode,
              onSelect: _selectWorkMode,
            ),
            const SizedBox(height: AppConstants.spacingM),
          ],

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
                icon: workMode.icon,
              ),
            ],
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
                      ? 'En línea · Buscando ${workMode.seekingLabel}...'
                      : 'Desconectado · Elige qué quieres hacer y activa el toggle',
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

// ── Work mode selector ────────────────────────────────────────────────────────

class _WorkModeSelector extends StatelessWidget {
  const _WorkModeSelector({
    required this.selected,
    required this.onSelect,
  });

  final WorkMode selected;
  final ValueChanged<WorkMode> onSelect;

  static const _subText = Color(0xFF94A3B8);

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '¿Qué quieres hacer?',
          style: TextStyle(
            color: _subText,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: AppConstants.spacingS),
        Row(
          children: WorkMode.values.map((mode) {
            final isSelected = mode == selected;
            return Expanded(
              child: Padding(
                padding: EdgeInsets.only(
                  right: mode != WorkMode.values.last
                      ? AppConstants.spacingS
                      : 0,
                ),
                child: _WorkModeCard(
                  mode: mode,
                  isSelected: isSelected,
                  onTap: () => onSelect(mode),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}

class _WorkModeCard extends StatelessWidget {
  const _WorkModeCard({
    required this.mode,
    required this.isSelected,
    required this.onTap,
  });

  final WorkMode mode;
  final bool isSelected;
  final VoidCallback onTap;

  static const _cardBg = Color(0xFF252836);
  static const _borderColor = Color(0xFF2E3347);
  static const _subText = Color(0xFF94A3B8);

  @override
  Widget build(BuildContext context) {
    final bg = isSelected ? mode.color : _cardBg;
    final iconColor = isSelected ? Colors.white : mode.color;
    final labelColor =
        isSelected ? Colors.white : const Color(0xFFE2E8F0);
    final subColor = isSelected
        ? Colors.white.withValues(alpha: 0.8)
        : _subText;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: AppConstants.shortAnimation,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: isSelected
              ? null
              : Border.all(color: _borderColor),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: mode.color.withValues(alpha: 0.38),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(mode.icon, size: 28, color: iconColor),
            const SizedBox(height: 6),
            Text(
              mode.displayName,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: labelColor,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 3),
            Text(
              mode.subtitle,
              style: TextStyle(
                fontSize: 9,
                color: subColor,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
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
