import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/core/utils/fare_calculator.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
import 'package:nexum_driver/features/driver_status/presentation/widgets/status_indicator_bar.dart';
import 'package:nexum_driver/features/driver_status/presentation/widgets/status_toggle_button.dart';
import 'package:nexum_driver/features/trip_requests/data/datasources/trip_requests_datasource.dart';
import 'package:nexum_driver/features/trip_requests/presentation/providers/trip_requests_provider.dart';
import 'package:nexum_driver/features/trip_requests/presentation/widgets/trip_request_bottom_sheet.dart';
import 'package:nexum_driver/shared/services/location_service.dart';

// ── Entidades mock ──────────────────────────────────────────────────────────

/// Solicitud de viaje mock con coordenadas reales de Pamplona.
class _TripRequest {
  const _TripRequest({
    required this.id,
    required this.passengerName,
    required this.passengerRating,
    required this.pickupAddress,
    required this.pickupLat,
    required this.pickupLng,
    required this.destinationAddress,
    required this.destinationLat,
    required this.destinationLng,
    required this.distanceKm,
  });

  final String id;
  final String passengerName;
  final double passengerRating;
  final String pickupAddress;
  final double pickupLat;
  final double pickupLng;
  final String destinationAddress;
  final double destinationLat;
  final double destinationLng;
  final double distanceKm;

  int get durationMinutes => FareCalculator.estimateDurationMinutes(distanceKm);
  double get fare => FareCalculator.calculateFare(
        distanceKm: distanceKm,
        durationMinutes: durationMinutes,
      );
  double get netEarning => FareCalculator.calculateNetEarning(fare);
}

// 10 solicitudes mock con coordenadas reales del casco urbano de Pamplona
final _mockTripRequests = <_TripRequest>[
  const _TripRequest(
    id: 'trip_001',
    passengerName: 'María Fernanda Pérez',
    passengerRating: 4.9,
    pickupAddress: 'Parque Águeda Gallardo',
    pickupLat: MapConstants.parquePrincipalLat,
    pickupLng: MapConstants.parquePrincipalLng,
    destinationAddress: 'Universidad de Pamplona',
    destinationLat: MapConstants.universidadLat,
    destinationLng: MapConstants.universidadLng,
    distanceKm: 0.8,
  ),
  const _TripRequest(
    id: 'trip_002',
    passengerName: 'Carlos Andrés Díaz',
    passengerRating: 4.7,
    pickupAddress: 'Terminal de Transportes',
    pickupLat: MapConstants.terminalLat,
    pickupLng: MapConstants.terminalLng,
    destinationAddress: 'Hospital San Juan de Dios',
    destinationLat: MapConstants.hospitalLat,
    destinationLng: MapConstants.hospitalLng,
    distanceKm: 1.5,
  ),
  const _TripRequest(
    id: 'trip_003',
    passengerName: 'Luisa Valentina Gómez',
    passengerRating: 5.0,
    pickupAddress: 'Catedral Santa Clara',
    pickupLat: MapConstants.catedralLat,
    pickupLng: MapConstants.catedralLng,
    destinationAddress: 'Terminal de Transportes',
    destinationLat: MapConstants.terminalLat,
    destinationLng: MapConstants.terminalLng,
    distanceKm: 1.2,
  ),
  const _TripRequest(
    id: 'trip_004',
    passengerName: 'Jorge Enrique Ruiz',
    passengerRating: 4.5,
    pickupAddress: 'Barrio El Buque',
    pickupLat: MapConstants.elBuqueLat,
    pickupLng: MapConstants.elBuqueLng,
    destinationAddress: 'Parque Principal',
    destinationLat: MapConstants.parquePrincipalLat,
    destinationLng: MapConstants.parquePrincipalLng,
    distanceKm: 1.8,
  ),
  const _TripRequest(
    id: 'trip_005',
    passengerName: 'Natalia Esperanza Torres',
    passengerRating: 4.8,
    pickupAddress: 'Barrio Cariongo',
    pickupLat: MapConstants.cariongoLat,
    pickupLng: MapConstants.cariongoLng,
    destinationAddress: 'Universidad de Pamplona',
    destinationLat: MapConstants.universidadLat,
    destinationLng: MapConstants.universidadLng,
    distanceKm: 0.9,
  ),
  const _TripRequest(
    id: 'trip_006',
    passengerName: 'Andrés Felipe Martínez',
    passengerRating: 4.6,
    pickupAddress: 'Barrio San Francisco',
    pickupLat: MapConstants.sanFranciscoLat,
    pickupLng: MapConstants.sanFranciscoLng,
    destinationAddress: 'Hospital San Juan de Dios',
    destinationLat: MapConstants.hospitalLat,
    destinationLng: MapConstants.hospitalLng,
    distanceKm: 1.1,
  ),
  const _TripRequest(
    id: 'trip_007',
    passengerName: 'Sandra Patricia López',
    passengerRating: 4.9,
    pickupAddress: 'Cristo Rey',
    pickupLat: MapConstants.cristoReyLat,
    pickupLng: MapConstants.cristoReyLng,
    destinationAddress: 'Catedral Santa Clara',
    destinationLat: MapConstants.catedralLat,
    destinationLng: MapConstants.catedralLng,
    distanceKm: 2.1,
  ),
  const _TripRequest(
    id: 'trip_008',
    passengerName: 'David Esteban Vargas',
    passengerRating: 4.4,
    pickupAddress: 'Centro Comercial',
    pickupLat: MapConstants.centroComericalLat,
    pickupLng: MapConstants.centroComericalLng,
    destinationAddress: 'Barrio Chapinero',
    destinationLat: MapConstants.chapineroLat,
    destinationLng: MapConstants.chapineroLng,
    distanceKm: 0.7,
  ),
  const _TripRequest(
    id: 'trip_009',
    passengerName: 'Camila Alejandra Niño',
    passengerRating: 4.8,
    pickupAddress: 'Barrio Ciudad Jardín',
    pickupLat: MapConstants.ciudadJardinLat,
    pickupLng: MapConstants.ciudadJardinLng,
    destinationAddress: 'Terminal de Transportes',
    destinationLat: MapConstants.terminalLat,
    destinationLng: MapConstants.terminalLng,
    distanceKm: 0.6,
  ),
  const _TripRequest(
    id: 'trip_010',
    passengerName: 'Juan Pablo Suárez',
    passengerRating: 4.7,
    pickupAddress: 'Hospital San Juan de Dios',
    pickupLat: MapConstants.hospitalLat,
    pickupLng: MapConstants.hospitalLng,
    destinationAddress: 'Cristo Rey',
    destinationLat: MapConstants.cristoReyLat,
    destinationLng: MapConstants.cristoReyLng,
    distanceKm: 2.4,
  ),
];

// ── State ──────────────────────────────────────────────────────────────────

/// Estado del conductor en la pantalla principal.
class _HomeState {
  const _HomeState({
    this.isOnline = false,
    this.todayEarnings = 0.0,
    this.todayTrips = 0,
    this.pendingRequest,
    this.requestSecondsLeft = AppConstants.tripRequestTimeoutSeconds,
  });

  final bool isOnline;
  final double todayEarnings;
  final int todayTrips;
  final _TripRequest? pendingRequest;
  final int requestSecondsLeft;

  _HomeState copyWith({
    bool? isOnline,
    double? todayEarnings,
    int? todayTrips,
    _TripRequest? pendingRequest,
    bool clearPending = false,
    int? requestSecondsLeft,
  }) {
    return _HomeState(
      isOnline: isOnline ?? this.isOnline,
      todayEarnings: todayEarnings ?? this.todayEarnings,
      todayTrips: todayTrips ?? this.todayTrips,
      pendingRequest:
          clearPending ? null : (pendingRequest ?? this.pendingRequest),
      requestSecondsLeft:
          requestSecondsLeft ?? this.requestSecondsLeft,
    );
  }
}

// ── Pantalla ────────────────────────────────────────────────────────────────

/// Pantalla principal del conductor: mapa, toggle online/offline y solicitudes.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  _HomeState _state = const _HomeState();
  GoogleMapController? _mapController;

  Timer? _requestTimer;
  Timer? _countdownTimer;

  final _rng = math.Random();

  static const _initialPosition = CameraPosition(
    target: LatLng(MapConstants.pamplonaCenterLat, MapConstants.pamplonaCenterLng),
    zoom: MapConstants.initialZoom,
  );

  @override
  void dispose() {
    _requestTimer?.cancel();
    _countdownTimer?.cancel();
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
      AppSnackbar.showSuccess(context, 'Estás en línea. Buscando viajes...');
      _scheduleNextRequest();
    } else {
      _requestTimer?.cancel();
      _countdownTimer?.cancel();
      AppSnackbar.showInfo(context, 'Desconectado. No recibirás solicitudes.');
    }
  }

  // ── Trip request simulation ────────────────────────────────────────────

  void _scheduleNextRequest() {
    if (!_state.isOnline) return;
    final delay = Duration(
      seconds: AppConstants.minTripRequestIntervalSeconds +
          _rng.nextInt(
            AppConstants.maxTripRequestIntervalSeconds -
                AppConstants.minTripRequestIntervalSeconds,
          ),
    );
    _requestTimer = Timer(delay, _showNewRequest);
  }

  void _showNewRequest() {
    if (!mounted || !_state.isOnline) return;
    final trip = _mockTripRequests[_rng.nextInt(_mockTripRequests.length)];

    setState(() {
      _state = _state.copyWith(
        pendingRequest: trip,
        requestSecondsLeft: AppConstants.tripRequestTimeoutSeconds,
      );
    });
    _startCountdown();
  }

  void _startCountdown() {
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
        if (_state.isOnline) _scheduleNextRequest();
      } else {
        setState(() => _state = _state.copyWith(requestSecondsLeft: newLeft));
      }
    });
  }

  void _acceptTrip(_TripRequest trip) {
    _countdownTimer?.cancel();
    _requestTimer?.cancel();
    setState(() => _state = _state.copyWith(clearPending: true));
    context.push('/active-trip', extra: trip);
  }

  void _rejectTrip() {
    _countdownTimer?.cancel();
    setState(() => _state = _state.copyWith(clearPending: true));
    if (_state.isOnline) _scheduleNextRequest();
  }

  // ── Build ──────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Mapa
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
              secondsLeft: _state.requestSecondsLeft,
              onAccept: () => _acceptTrip(_state.pendingRequest!),
              onReject: _rejectTrip,
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
          // Online toggle
          _OnlineToggle(
            isOnline: _state.isOnline,
            onTap: _toggleOnline,
          ),
          const Spacer(),
          // Action buttons
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
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(AppConstants.radiusXLarge),
        ),
        boxShadow: const [
          BoxShadow(
            color: AppColors.shadow,
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
              color: AppColors.divider,
              borderRadius: BorderRadius.circular(2),
            ),
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
                value: CurrencyFormatter.format(_state.todayEarnings),
                icon: Icons.payments_outlined,
                highlight: true,
              ),
              const SizedBox(width: AppConstants.spacingM),
              _StatCard(
                label: 'Viajes',
                value: _state.todayTrips.toString(),
                icon: Icons.local_taxi_rounded,
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),
          // Status message
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
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
                    ? 'En línea • Buscando solicitudes...'
                    : 'Desconectado • Activa el toggle para recibir viajes',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: _state.isOnline
                      ? AppColors.online
                      : AppColors.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Sub-widgets ─────────────────────────────────────────────────────────────

class _OnlineToggle extends StatelessWidget {
  const _OnlineToggle({
    required this.isOnline,
    required this.onTap,
  });

  final bool isOnline;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: AppConstants.shortAnimation,
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingS,
        ),
        decoration: BoxDecoration(
          color: isOnline ? AppColors.online : AppColors.offline,
          borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
          boxShadow: const [
            BoxShadow(
              color: AppColors.shadow,
              blurRadius: 8,
              offset: Offset(0, 2),
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
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingS,
          vertical: AppConstants.spacingS,
        ),
        decoration: BoxDecoration(
          color: highlight
              ? AppColors.primary.withValues(alpha: 0.1)
              : theme.colorScheme.surfaceContainerHighest
                  .withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: highlight
              ? Border.all(color: AppColors.primary.withValues(alpha: 0.3))
              : null,
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
    required this.secondsLeft,
    required this.onAccept,
    required this.onReject,
  });

  final _TripRequest trip;
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
                        // Header
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
                                    trip.passengerName,
                                    style: theme.textTheme.titleMedium
                                        ?.copyWith(fontWeight: FontWeight.w700),
                                  ),
                                  Row(
                                    children: [
                                      const Icon(
                                        Icons.star_rounded,
                                        color: AppColors.star,
                                        size: 14,
                                      ),
                                      const SizedBox(width: 2),
                                      Text(
                                        trip.passengerRating
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
                                    backgroundColor: AppColors.divider,
                                    color: progress > 0.4
                                        ? AppColors.primary
                                        : AppColors.warning,
                                  ),
                                ),
                                Text(
                                  '$secondsLeft',
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const Divider(height: AppConstants.spacingL),
                        // Route info
                        _RouteRow(
                          icon: Icons.radio_button_checked_rounded,
                          color: AppColors.pickupMarker,
                          label: 'Origen',
                          address: trip.pickupAddress,
                        ),
                        const SizedBox(height: AppConstants.spacingS),
                        _RouteRow(
                          icon: Icons.location_on_rounded,
                          color: AppColors.destinationMarker,
                          label: 'Destino',
                          address: trip.destinationAddress,
                        ),
                        const Divider(height: AppConstants.spacingL),
                        // Fare info
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _FareChip(
                              label: 'Distancia',
                              value: '${trip.distanceKm.toStringAsFixed(1)} km',
                              icon: Icons.straighten_rounded,
                            ),
                            _FareChip(
                              label: 'Duración',
                              value: '~${trip.durationMinutes} min',
                              icon: Icons.access_time_rounded,
                            ),
                            _FareChip(
                              label: 'Ganancia',
                              value: CurrencyFormatter.format(trip.netEarning),
                              icon: Icons.payments_outlined,
                              highlight: true,
                            ),
                          ],
                        ),
                        const SizedBox(height: AppConstants.spacingL),
                        // Action buttons
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
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: AppColors.textSecondary, fontSize: 10),
            ),
            Text(
              address,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w500),
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
