import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/theme_provider.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';
import 'package:nexum_driver/core/domain/service_type_provider.dart';
import 'package:nexum_driver/core/mock_data/driver_mock.dart';
import 'package:nexum_driver/core/mock_data/passengers_mock.dart';
import 'package:nexum_driver/core/mock_data/trips_mock.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/active_trip_provider.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
import 'package:nexum_driver/features/notifications/presentation/providers/notification_provider.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/services/audio_service.dart';

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
  GoogleMapController? _mapController;
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
  final _rng = math.Random();

  static const _initialPosition = CameraPosition(
    target: LatLng(MapConstants.pamplonaCenterLat, MapConstants.pamplonaCenterLng),
    zoom: MapConstants.initialZoom,
  );

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _webMockTimer?.cancel();
    _mapController?.dispose();
    super.dispose();
  }

  // ── Online toggle ──────────────────────────────────────────────────────

  void _toggleOnline() {
    final goingOnline = !_state.isOnline;
    setState(() {
      _state = _state.copyWith(isOnline: goingOnline, clearPending: true);
    });

    if (goingOnline) {
      final serviceType = ref.read(selectedServiceTypeProvider);
      AppSnackbar.showSuccess(
        context,
        'En línea como ${serviceType.displayName}. Buscando viajes...',
      );
      _connectWs();
    } else {
      _webMockTimer?.cancel();
      _countdownTimer?.cancel();
      AppSnackbar.showInfo(context, 'Desconectado. No recibirás solicitudes.');
    }
  }

  // ── Service type ───────────────────────────────────────────────────────

  void _selectServiceType(ServiceType type) {
    if (_state.isOnline) return;
    ref.read(selectedServiceTypeProvider.notifier).state = type;
  }

  // ── Mock trip dispatch ─────────────────────────────────────────────────

  Future<void> _connectWs() async {
    _scheduleWebMockRequest();
  }

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
    final serviceType = ref.read(selectedServiceTypeProvider);
    final fare = serviceType.estimateFare(dist, dur.toDouble()) *
        (1 - serviceType.platformCommission);

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
        if (_state.isOnline) _scheduleWebMockRequest();
      } else {
        setState(() => _state = _state.copyWith(requestSecondsLeft: newLeft));
      }
    });
  }

  Future<void> _acceptTrip(TripRequestEntity request) async {
    _countdownTimer?.cancel();
    setState(() => _state = _state.copyWith(clearPending: true));
    await ref.read(activeTripProvider.notifier).beginTrip(request);
    if (mounted) context.push('/active-trip');
  }

  void _rejectTrip(TripRequestEntity request) {
    _countdownTimer?.cancel();
    setState(() => _state = _state.copyWith(clearPending: true));
    if (_state.isOnline) _scheduleWebMockRequest();
  }

  Set<Circle> _buildHeatmapCircles() {
    return {
      Circle(
        circleId: const CircleId('parque_principal'),
        center: const LatLng(7.3752, -72.6479),
        radius: 200,
        fillColor: AppColors.error.withValues(alpha: 0.25),
        strokeColor: AppColors.error.withValues(alpha: 0.6),
        strokeWidth: 2,
      ),
      Circle(
        circleId: const CircleId('terminal'),
        center: const LatLng(7.3694, -72.6521),
        radius: 250,
        fillColor: AppColors.error.withValues(alpha: 0.25),
        strokeColor: AppColors.error.withValues(alpha: 0.6),
        strokeWidth: 2,
      ),
      Circle(
        circleId: const CircleId('universidad'),
        center: const LatLng(7.3783, -72.6451),
        radius: 200,
        fillColor: AppColors.warning.withValues(alpha: 0.25),
        strokeColor: AppColors.warning.withValues(alpha: 0.6),
        strokeWidth: 2,
      ),
      Circle(
        circleId: const CircleId('hospital'),
        center: const LatLng(7.3741, -72.6498),
        radius: 150,
        fillColor: AppColors.warning.withValues(alpha: 0.25),
        strokeColor: AppColors.warning.withValues(alpha: 0.6),
        strokeWidth: 2,
      ),
      Circle(
        circleId: const CircleId('centro_comercial'),
        center: const LatLng(7.3758, -72.6472),
        radius: 150,
        fillColor: AppColors.warning.withValues(alpha: 0.25),
        strokeColor: AppColors.warning.withValues(alpha: 0.6),
        strokeWidth: 2,
      ),
      Circle(
        circleId: const CircleId('el_buque'),
        center: const LatLng(7.3715, -72.6543),
        radius: 150,
        fillColor: AppColors.primary.withValues(alpha: 0.2),
        strokeColor: AppColors.primary.withValues(alpha: 0.5),
        strokeWidth: 1,
      ),
      Circle(
        circleId: const CircleId('ciudad_jardin'),
        center: const LatLng(7.3769, -72.6505),
        radius: 150,
        fillColor: AppColors.primary.withValues(alpha: 0.2),
        strokeColor: AppColors.primary.withValues(alpha: 0.5),
        strokeWidth: 1,
      ),
    };
  }

  // ── Build ──────────────────────────────────────────────────────────────

  static const _driverLatLng = LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );

  @override
  Widget build(BuildContext context) {
    final serviceType = ref.watch(selectedServiceTypeProvider);

    return Scaffold(
      drawer: _AppDrawer(
        selectedServiceType: serviceType,
        isOnline: _state.isOnline,
      ),
      body: Stack(
        children: [
          // Map
          GoogleMap(
            initialCameraPosition: _initialPosition,
            onMapCreated: (controller) => _mapController = controller,
            myLocationEnabled: false,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            circles:
                _showHeatmap ? _buildHeatmapCircles() : {},
            markers: _state.isOnline
                ? {
                    Marker(
                      markerId: const MarkerId('driver'),
                      position: _driverLatLng,
                      icon: BitmapDescriptor.defaultMarkerWithHue(
                          serviceType.markerHue),
                      infoWindow: InfoWindow(
                        title: 'Tu posición',
                        snippet: serviceType.displayName,
                      ),
                    ),
                  }
                : {},
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
              serviceType: serviceType,
              secondsLeft: _state.requestSecondsLeft,
              onAccept: () => _acceptTrip(_state.pendingRequest!),
              onReject: () => _rejectTrip(_state.pendingRequest!),
            ),
        ],
      ),
    );
  }

  Widget _buildTopBar(ServiceType serviceType) {
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
            serviceType: serviceType,
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

  Widget _buildBottomPanel(ServiceType serviceType) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final driverStatus = ref.watch(driverStatusProvider);

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(AppConstants.radiusXLarge),
        ),
        boxShadow: const [
          BoxShadow(
            color: AppColors.shadowMedium,
            blurRadius: 16,
            offset: Offset(0, -4),
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
              color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
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
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
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
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              Text(
                '${((driverStatus.dailyTrips / _kDailyTripGoal) * 100).round().clamp(0, 100)}%',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.primary,
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
              backgroundColor: isDark
                  ? AppColors.outlineDark
                  : AppColors.outlineLight,
              valueColor: AlwaysStoppedAnimation<Color>(
                driverStatus.dailyTrips >= _kDailyTripGoal
                    ? AppColors.success
                    : AppColors.primary,
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // Service type selector (only when offline)
          if (!_state.isOnline) ...[
            _ServiceTypeSelector(
              selected: serviceType,
              onSelect: _selectServiceType,
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
                icon: serviceType.icon,
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
              Text(
                _state.isOnline
                    ? 'En línea como ${serviceType.displayName} · Buscando...'
                    : 'Desconectado · Selecciona servicio y activa el toggle',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: _state.isOnline
                      ? AppColors.online
                      : AppColors.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Service type selector ────────────────────────────────────────────────────

class _ServiceTypeSelector extends StatelessWidget {
  const _ServiceTypeSelector({
    required this.selected,
    required this.onSelect,
  });

  final ServiceType selected;
  final ValueChanged<ServiceType> onSelect;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Tipo de servicio',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w600,
              ),
        ),
        const SizedBox(height: AppConstants.spacingS),
        SizedBox(
          height: 72,
          child: ListView(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            children: ServiceType.values
                .map(
                  (type) => Padding(
                    padding: const EdgeInsets.only(right: AppConstants.spacingS),
                    child: _ServiceTypeChip(
                      type: type,
                      isSelected: type == selected,
                      onTap: () => onSelect(type),
                    ),
                  ),
                )
                .toList(),
          ),
        ),
      ],
    );
  }
}

class _ServiceTypeChip extends StatelessWidget {
  const _ServiceTypeChip({
    required this.type,
    required this.isSelected,
    required this.onTap,
  });

  final ServiceType type;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: AppConstants.shortAnimation,
        width: 82,
        decoration: BoxDecoration(
          color: isSelected ? type.color : type.containerColor.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: Border.all(
            color: isSelected ? type.color : type.color.withValues(alpha: 0.25),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              type.icon,
              size: 22,
              color: isSelected ? Colors.white : type.color,
            ),
            const SizedBox(height: 4),
            Text(
              type.displayName,
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: isSelected ? Colors.white : type.color,
              ),
              textAlign: TextAlign.center,
              maxLines: 1,
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
    required this.serviceType,
    required this.onTap,
  });

  final bool isOnline;
  final ServiceType serviceType;
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingS,
          vertical: AppConstants.spacingS,
        ),
        decoration: BoxDecoration(
          color: highlight
              ? AppColors.primary.withValues(alpha: 0.1)
              : (isDark
                  ? AppColors.surfaceVariantDark
                  : AppColors.surfaceVariantLight),
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: highlight
              ? Border.all(color: AppColors.primary.withValues(alpha: 0.3))
              : Border.all(
                  color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
                ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              icon,
              size: 16,
              color: highlight ? AppColors.primary : AppColors.textSecondary,
            ),
            const SizedBox(height: 2),
            Text(
              value,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: highlight ? AppColors.primary : AppColors.textPrimary,
                fontSize: 13,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
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
    required this.serviceType,
    required this.secondsLeft,
    required this.onAccept,
    required this.onReject,
  });

  final TripRequestEntity trip;
  final ServiceType serviceType;
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
                        // Service type badge
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppConstants.spacingS,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: serviceType.containerColor,
                              borderRadius: BorderRadius.circular(
                                  AppConstants.radiusSmall),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(serviceType.icon,
                                    size: 12, color: serviceType.color),
                                const SizedBox(width: 4),
                                Text(
                                  serviceType.displayName,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: serviceType.color,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: AppConstants.spacingM),
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
                          label: 'Origen',
                          address: trip.origin.address,
                        ),
                        const SizedBox(height: AppConstants.spacingS),
                        _RouteRow(
                          icon: Icons.location_on_rounded,
                          color: AppColors.destinationMarker,
                          label: 'Destino',
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
