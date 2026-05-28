import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';
import 'package:nexum_driver/core/mock_data/passengers_mock.dart';
import 'package:nexum_driver/core/mock_data/trips_mock.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/active_trip_provider.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/services/audio_service.dart';
import 'package:nexum_driver/shared/services/ws_service.dart';

// ── State ──────────────────────────────────────────────────────────────────

class _HomeState {
  const _HomeState({
    this.isOnline = false,
    this.selectedServiceType = ServiceType.moto,
    this.todayEarnings = 0.0,
    this.todayTrips = 0,
    this.pendingRequest,
    this.requestSecondsLeft = AppConstants.tripRequestTimeoutSeconds,
  });

  final bool isOnline;
  final ServiceType selectedServiceType;
  final double todayEarnings;
  final int todayTrips;
  final TripRequestEntity? pendingRequest;
  final int requestSecondsLeft;

  _HomeState copyWith({
    bool? isOnline,
    ServiceType? selectedServiceType,
    double? todayEarnings,
    int? todayTrips,
    TripRequestEntity? pendingRequest,
    bool clearPending = false,
    int? requestSecondsLeft,
  }) {
    return _HomeState(
      isOnline: isOnline ?? this.isOnline,
      selectedServiceType: selectedServiceType ?? this.selectedServiceType,
      todayEarnings: todayEarnings ?? this.todayEarnings,
      todayTrips: todayTrips ?? this.todayTrips,
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

  StreamSubscription<TripRequestEntity>? _wsSub;
  Timer? _countdownTimer;
  Timer? _webMockTimer;
  final _rng = math.Random();

  static const _initialPosition = CameraPosition(
    target: LatLng(MapConstants.pamplonaCenterLat, MapConstants.pamplonaCenterLng),
    zoom: MapConstants.initialZoom,
  );

  @override
  void dispose() {
    _wsSub?.cancel();
    WsService().disconnect();
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
      AppSnackbar.showSuccess(
        context,
        'En línea como ${_state.selectedServiceType.displayName}. Buscando viajes...',
      );
      _connectWs();
    } else {
      _wsSub?.cancel();
      _webMockTimer?.cancel();
      WsService().disconnect();
      _countdownTimer?.cancel();
      AppSnackbar.showInfo(context, 'Desconectado. No recibirás solicitudes.');
    }
  }

  // ── Service type ───────────────────────────────────────────────────────

  void _selectServiceType(ServiceType type) {
    if (_state.isOnline) return; // can't change while online
    setState(() => _state = _state.copyWith(selectedServiceType: type));
  }

  // ── WebSocket / web mock dispatch ─────────────────────────────────────

  Future<void> _connectWs() async {
    if (kIsWeb) {
      _scheduleWebMockRequest();
      return;
    }
    await WsService().connect();
    _wsSub?.cancel();
    _wsSub = WsService().tripRequests.listen(_onTripRequest);
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
    final fare = _state.selectedServiceType.estimateFare(dist, dur.toDouble()) *
        (1 - _state.selectedServiceType.platformCommission);

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
        WsService().rejectTrip(request.id);
        setState(() => _state = _state.copyWith(clearPending: true));
        if (kIsWeb && _state.isOnline) _scheduleWebMockRequest();
      } else {
        setState(() => _state = _state.copyWith(requestSecondsLeft: newLeft));
      }
    });
  }

  Future<void> _acceptTrip(TripRequestEntity request) async {
    _countdownTimer?.cancel();
    WsService().acceptTrip(request.id);
    setState(() => _state = _state.copyWith(clearPending: true));
    await ref.read(activeTripProvider.notifier).beginTrip(request);
    if (mounted) context.push('/active-trip');
  }

  void _rejectTrip(TripRequestEntity request) {
    _countdownTimer?.cancel();
    WsService().rejectTrip(request.id);
    setState(() => _state = _state.copyWith(clearPending: true));
    if (kIsWeb && _state.isOnline) _scheduleWebMockRequest();
  }

  // ── Build ──────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: _AppDrawer(selectedServiceType: _state.selectedServiceType),
      body: Stack(
        children: [
          // Map
          GoogleMap(
            initialCameraPosition: _initialPosition,
            onMapCreated: (controller) => _mapController = controller,
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
          ),
          // Top bar
          SafeArea(child: _buildTopBar()),
          // Bottom panel
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _buildBottomPanel(),
          ),
          // Trip request modal
          if (_state.pendingRequest != null)
            _TripRequestModal(
              trip: _state.pendingRequest!,
              serviceType: _state.selectedServiceType,
              secondsLeft: _state.requestSecondsLeft,
              onAccept: () => _acceptTrip(_state.pendingRequest!),
              onReject: () => _rejectTrip(_state.pendingRequest!),
            ),
        ],
      ),
    );
  }

  Widget _buildTopBar() {
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
            serviceType: _state.selectedServiceType,
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
            icon: Icons.person_outline_rounded,
            onTap: () => context.push('/profile'),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomPanel() {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

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

          // Service type selector (only when offline)
          if (!_state.isOnline) ...[
            _ServiceTypeSelector(
              selected: _state.selectedServiceType,
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
                value: CurrencyFormatter.format(_state.todayEarnings),
                icon: Icons.payments_outlined,
                highlight: true,
              ),
              const SizedBox(width: AppConstants.spacingM),
              _StatCard(
                label: 'Viajes',
                value: _state.todayTrips.toString(),
                icon: _state.selectedServiceType.icon,
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
                  color: _state.isOnline
                      ? AppColors.online
                      : AppColors.offline,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              Text(
                _state.isOnline
                    ? 'En línea como ${_state.selectedServiceType.displayName} · Buscando...'
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

// ── Drawer ───────────────────────────────────────────────────────────────────

class _AppDrawer extends StatelessWidget {
  const _AppDrawer({required this.selectedServiceType});

  final ServiceType selectedServiceType;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Drawer(
      backgroundColor: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      child: SafeArea(
        child: Column(
          children: [
            // Header
            Container(
              padding: const EdgeInsets.all(AppConstants.spacingL),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer,
                      borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
                    ),
                    child: const Icon(Icons.person_rounded,
                        color: AppColors.primary, size: 28),
                  ),
                  const SizedBox(width: AppConstants.spacingM),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Mi cuenta',
                          style: theme.textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        Row(
                          children: [
                            Icon(
                              selectedServiceType.icon,
                              size: 12,
                              color: selectedServiceType.color,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              selectedServiceType.displayName,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: selectedServiceType.color,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Divider(
              color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
            ),
            // Navigation items
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(
                  vertical: AppConstants.spacingS,
                ),
                children: [
                  _DrawerItem(
                    icon: Icons.home_rounded,
                    label: 'Inicio',
                    onTap: () => Navigator.of(context).pop(),
                  ),
                  _DrawerItem(
                    icon: Icons.account_balance_wallet_rounded,
                    label: 'Billetera',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/wallet');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.history_rounded,
                    label: 'Historial de viajes',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/trip-history');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.star_rounded,
                    label: 'Calificaciones',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/ratings');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.monetization_on_rounded,
                    label: 'Ganancias',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/earnings');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.local_offer_rounded,
                    label: 'Promociones',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/promotions');
                    },
                  ),
                  Divider(
                    color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
                    indent: AppConstants.spacingM,
                    endIndent: AppConstants.spacingM,
                  ),
                  _DrawerItem(
                    icon: Icons.shield_rounded,
                    label: 'Centro de seguridad',
                    color: AppColors.error,
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/safety');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.help_outline_rounded,
                    label: 'Soporte y FAQ',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/support');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.person_outline_rounded,
                    label: 'Mi perfil',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/profile');
                    },
                  ),
                  _DrawerItem(
                    icon: Icons.settings_outlined,
                    label: 'Configuración',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/settings');
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

class _DrawerItem extends StatelessWidget {
  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final effectiveColor = color ?? AppColors.textPrimary;
    return ListTile(
      leading: Icon(icon, size: 22, color: effectiveColor),
      title: Text(
        label,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w500,
              color: effectiveColor,
            ),
      ),
      onTap: onTap,
      horizontalTitleGap: 12,
    );
  }
}

// ── Sub-widgets ─────────────────────────────────────────────────────────────

class _OnlineToggle extends StatelessWidget {
  const _OnlineToggle({
    required this.isOnline,
    required this.serviceType,
    required this.onTap,
  });

  final bool isOnline;
  final ServiceType serviceType;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = isOnline ? AppColors.online : AppColors.offline;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
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
              color: color.withValues(alpha: 0.4),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isOnline ? Icons.wifi_rounded : Icons.wifi_off_rounded,
              color: Colors.white,
              size: 18,
            ),
            const SizedBox(width: AppConstants.spacingXS),
            Text(
              isOnline ? 'En línea' : 'Desconectado',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ],
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
