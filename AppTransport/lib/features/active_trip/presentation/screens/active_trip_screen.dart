import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';
import 'package:nexum_driver/core/domain/service_type_provider.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/active_trip_provider.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/going_to_passenger_card.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/trip_in_progress_card.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/waiting_passenger_card.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';

class ActiveTripScreen extends ConsumerStatefulWidget {
  const ActiveTripScreen({this.tripExtra, super.key});
  final Object? tripExtra;

  @override
  ConsumerState<ActiveTripScreen> createState() => _ActiveTripScreenState();
}

class _ActiveTripScreenState extends ConsumerState<ActiveTripScreen> {
  GoogleMapController? _mapController;
  bool _isLoading = false;
  bool _autoFollow = true;

  // Simulated driver position — starts at Pamplona center
  LatLng _driverPos = const LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );

  Timer? _movementTimer;
  Timer? _etaTimer;
  int _etaSeconds = 0;

  // Waypoint-based route simulation
  LatLng _routeStart = const LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );
  List<LatLng> _waypoints = const [];
  int _waypointIndex = 0;
  bool _nearDestinationShown = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final trip = ref.read(activeTripProvider);
      if (trip != null) {
        _startSimulatedMovement(trip);
        _startEtaCountdown(trip);
      }
    });
  }

  @override
  void dispose() {
    _movementTimer?.cancel();
    _etaTimer?.cancel();
    _mapController?.dispose();
    super.dispose();
  }

  // ── Simulated driver movement ────────────────────────────────────────────

  void _startSimulatedMovement(ActiveTripEntity trip) {
    final target = trip.isInProgress
        ? trip.request.destination.latLng
        : trip.request.origin.latLng;

    _routeStart = _driverPos;
    _waypoints = _generateWaypoints(_driverPos, target);
    _waypointIndex = 0;
    _nearDestinationShown = false;

    _movementTimer?.cancel();
    _movementTimer = Timer.periodic(const Duration(milliseconds: 1800), (_) {
      if (!mounted) return;
      if (_waypointIndex >= _waypoints.length) return;

      // Near-destination alert at 85% of route
      final progress = _waypointIndex / _waypoints.length;
      if (progress >= 0.85 && !_nearDestinationShown) {
        _nearDestinationShown = true;
        final current = ref.read(activeTripProvider);
        if (current != null && mounted) {
          AppSnackbar.showInfo(
            context,
            current.isInProgress
                ? '¡Llegando al destino!'
                : '¡El pasajero está cerca!',
          );
        }
      }

      final next = _waypoints[_waypointIndex];
      setState(() {
        _driverPos = next;
        _waypointIndex++;
      });

      if (_autoFollow && _mapController != null) {
        final current = ref.read(activeTripProvider);
        // Driving-mode camera (tilted + bearing) when in progress
        if (current?.isInProgress == true &&
            _waypointIndex < _waypoints.length) {
          final bearing = _bearing(_driverPos, _waypoints[_waypointIndex]);
          _mapController!.animateCamera(
            CameraUpdate.newCameraPosition(
              CameraPosition(
                target: next,
                zoom: 16.5,
                tilt: 45,
                bearing: bearing,
              ),
            ),
          );
        } else {
          _mapController!.animateCamera(CameraUpdate.newLatLng(next));
        }
      }
    });
  }

  List<LatLng> _generateWaypoints(LatLng from, LatLng to) {
    // L-shaped path: horizontal leg first, then vertical leg.
    // Simulates turning at a street corner rather than cutting diagonally.
    const steps = 6;
    final corner = LatLng(from.latitude, to.longitude);
    final result = <LatLng>[];
    for (int i = 1; i <= steps; i++) {
      result.add(LatLng(
        _lerp(from.latitude, corner.latitude, i / steps),
        _lerp(from.longitude, corner.longitude, i / steps),
      ));
    }
    for (int i = 1; i <= steps; i++) {
      result.add(LatLng(
        _lerp(corner.latitude, to.latitude, i / steps),
        _lerp(corner.longitude, to.longitude, i / steps),
      ));
    }
    return result;
  }

  static double _bearing(LatLng from, LatLng to) {
    final dLng = (to.longitude - from.longitude) * math.pi / 180;
    final lat1 = from.latitude * math.pi / 180;
    final lat2 = to.latitude * math.pi / 180;
    final y = math.sin(dLng) * math.cos(lat2);
    final x = math.cos(lat1) * math.sin(lat2) -
        math.sin(lat1) * math.cos(lat2) * math.cos(dLng);
    return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
  }

  double get _routeProgress => _waypoints.isEmpty
      ? 0.0
      : (_waypointIndex / _waypoints.length).clamp(0.0, 1.0);

  void _startEtaCountdown(ActiveTripEntity trip) {
    _etaTimer?.cancel();
    _etaSeconds = trip.isInProgress
        ? trip.request.durationMinutes * 60
        : trip.request.etaToPickupMinutes * 60;

    _etaTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_etaSeconds > 0) setState(() => _etaSeconds--);
    });
  }

  static double _lerp(double a, double b, double t) => a + (b - a) * t;

  String get _etaLabel {
    if (_etaSeconds <= 0) return '< 1 min';
    final mins = _etaSeconds ~/ 60;
    final secs = _etaSeconds % 60;
    if (mins > 0) return '$mins min ${secs}s';
    return '${secs}s';
  }

  // ── Trip state transition handler ────────────────────────────────────────

  void _onTripStateChanged(ActiveTripEntity? prev, ActiveTripEntity? next) {
    if (next == null || prev == null) return;
    if (prev.state == next.state) return;

    // toPickup → waiting: zoom in on pickup marker
    if (prev.isToPickup && next.isWaiting) {
      _zoomTo(next.request.origin.latLng, zoom: 17);
      _startEtaCountdown(next);
    }

    // waiting → inProgress: reset position to origin, re-fit for full route
    if (prev.isWaiting && next.isInProgress) {
      setState(() {
        _driverPos = next.request.origin.latLng;
        _waypoints = const [];
        _waypointIndex = 0;
        _autoFollow = true;
      });
      _startSimulatedMovement(next);
      _startEtaCountdown(next);
      Future.delayed(const Duration(milliseconds: 300), () {
        if (mounted) _fitBoundsToRoute([_driverPos, next.request.destination.latLng]);
      });
    }
  }

  // ── Camera helpers ───────────────────────────────────────────────────────

  void _fitBoundsToRoute(List<LatLng> points) {
    if (points.length < 2 || _mapController == null) return;

    var minLat = points.first.latitude;
    var maxLat = points.first.latitude;
    var minLng = points.first.longitude;
    var maxLng = points.first.longitude;

    for (final p in points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }

    _mapController!.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(minLat - 0.002, minLng - 0.002),
          northeast: LatLng(maxLat + 0.002, maxLng + 0.002),
        ),
        72.0,
      ),
    );
  }

  void _zoomTo(LatLng target, {double zoom = 16}) {
    _mapController?.animateCamera(
      CameraUpdate.newCameraPosition(
        CameraPosition(target: target, zoom: zoom),
      ),
    );
  }

  void _recenter(ActiveTripEntity trip) {
    setState(() => _autoFollow = true);
    final points = trip.isInProgress
        ? [_driverPos, trip.request.destination.latLng]
        : [_driverPos, trip.request.origin.latLng];
    _fitBoundsToRoute(points);
  }

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    // Listen for state transitions
    ref.listen<ActiveTripEntity?>(activeTripProvider, (prev, next) {
      _onTripStateChanged(prev, next);
    });

    final trip = ref.watch(activeTripProvider);
    final serviceType = ref.watch(selectedServiceTypeProvider);

    if (trip == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/home');
      });
      return const Scaffold(
        body: Center(
            child: CircularProgressIndicator(color: AppColors.primary)),
      );
    }

    return PopScope(
      canPop: !trip.isInProgress,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && trip.isInProgress) _showCannotLeaveDialog();
      },
      child: Scaffold(
        body: Stack(
          children: [
            _buildMap(trip, serviceType),
            _buildTopBar(trip, serviceType),
            if (_isLoading)
              Container(
                color: AppColors.overlay,
                child: const Center(
                  child:
                      CircularProgressIndicator(color: AppColors.primary),
                ),
              ),
          ],
        ),
        floatingActionButton: _buildRecentFab(trip, serviceType),
        floatingActionButtonLocation:
            FloatingActionButtonLocation.miniEndFloat,
        bottomSheet: _buildBottomCard(trip),
      ),
    );
  }

  // ── Map ──────────────────────────────────────────────────────────────────

  Widget _buildMap(ActiveTripEntity trip, ServiceType serviceType) {
    final originLatLng = trip.request.origin.latLng;
    final destinationLatLng = trip.request.destination.latLng;

    final boundsPoints = trip.isInProgress
        ? [_driverPos, originLatLng, destinationLatLng]
        : [_driverPos, originLatLng];

    return GoogleMap(
      initialCameraPosition: CameraPosition(
        target: _driverPos,
        zoom: MapConstants.tripZoom,
      ),
      onMapCreated: (controller) {
        _mapController = controller;
        _fitBoundsToRoute(boundsPoints);
      },
      onCameraMoveStarted: () {
        // User manually moved the map — disable auto-follow
        if (_autoFollow) setState(() => _autoFollow = false);
      },
      markers: _buildMarkers(trip, serviceType),
      polylines: _buildPolylines(trip, serviceType),
      myLocationEnabled: false,
      myLocationButtonEnabled: false,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      compassEnabled: true,
    );
  }

  Set<Marker> _buildMarkers(
      ActiveTripEntity trip, ServiceType serviceType) {
    final originLatLng = trip.request.origin.latLng;

    return {
      // Driver marker
      Marker(
        markerId: const MarkerId('driver'),
        position: _driverPos,
        icon: BitmapDescriptor.defaultMarkerWithHue(serviceType.markerHue),
        infoWindow: InfoWindow(
          title: serviceType.displayName,
          snippet: 'Tu posición actual',
        ),
        zIndex: 2,
      ),
      // Pickup marker — with pulse stack via ground overlay trick
      Marker(
        markerId: const MarkerId('origin'),
        position: originLatLng,
        infoWindow: InfoWindow(
          title: 'Punto de recogida',
          snippet: trip.request.origin.address,
        ),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
        zIndex: 1,
      ),
      // Destination marker
      Marker(
        markerId: const MarkerId('destination'),
        position: trip.request.destination.latLng,
        infoWindow: InfoWindow(
          title: 'Destino',
          snippet: trip.request.destination.address,
        ),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
        zIndex: 1,
      ),
    };
  }

  Set<Polyline> _buildPolylines(ActiveTripEntity trip, ServiceType serviceType) {
    // Fallback: single straight line before waypoints are generated
    if (_waypoints.isEmpty) {
      final target = trip.isInProgress
          ? trip.request.destination.latLng
          : trip.request.origin.latLng;
      return {
        Polyline(
          polylineId: const PolylineId('active_route'),
          points: [_driverPos, target],
          color: serviceType.color,
          width: 5,
          patterns: trip.isToPickup
              ? [PatternItem.dash(18), PatternItem.gap(8)]
              : [],
          startCap: Cap.roundCap,
          endCap: Cap.roundCap,
        ),
      };
    }

    // Full route = starting position + all waypoints
    final fullRoute = [_routeStart, ..._waypoints];
    final splitAt = (_waypointIndex + 1).clamp(0, fullRoute.length);
    final consumed = fullRoute.take(splitAt).toList();
    // Share the current position point between consumed and remaining (no gap)
    final remaining =
        fullRoute.skip(splitAt > 0 ? splitAt - 1 : 0).toList();

    return {
      // Greyed-out consumed portion
      if (consumed.length >= 2)
        Polyline(
          polylineId: const PolylineId('consumed_route'),
          points: consumed,
          color: Colors.grey.withValues(alpha: 0.45),
          width: 5,
          startCap: Cap.roundCap,
          endCap: Cap.roundCap,
          jointType: JointType.round,
        ),
      // Shadow under remaining route
      if (remaining.length >= 2)
        Polyline(
          polylineId: const PolylineId('route_shadow'),
          points: remaining,
          color: Colors.black.withValues(alpha: 0.15),
          width: 9,
        ),
      // Colored remaining route
      Polyline(
        polylineId: const PolylineId('active_route'),
        points: remaining.length >= 2 ? remaining : [_driverPos, _driverPos],
        color: serviceType.color,
        width: 5,
        patterns: trip.isToPickup
            ? [PatternItem.dash(18), PatternItem.gap(8)]
            : [],
        startCap: Cap.roundCap,
        endCap: Cap.roundCap,
        jointType: JointType.round,
      ),
    };
  }

  // ── FAB: recenter ────────────────────────────────────────────────────────

  Widget? _buildRecentFab(ActiveTripEntity trip, ServiceType serviceType) {
    if (_autoFollow) return null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 220),
      child: FloatingActionButton.small(
        onPressed: () => _recenter(trip),
        backgroundColor: Colors.white,
        foregroundColor: serviceType.color,
        elevation: 4,
        tooltip: 'Recentrar mapa',
        child: const Icon(Icons.my_location_rounded),
      ),
    );
  }

  // ── Top bar ──────────────────────────────────────────────────────────────

  Widget _buildTopBar(ActiveTripEntity trip, ServiceType serviceType) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppConstants.spacingM,
            vertical: AppConstants.spacingS,
          ),
          child: Row(
            children: [
              // Back button
              Material(
                color: Colors.white,
                elevation: 4,
                shadowColor: AppColors.shadow,
                shape: const CircleBorder(),
                child: InkWell(
                  onTap: trip.isInProgress
                      ? _showCannotLeaveDialog
                      : _confirmGoBack,
                  customBorder: const CircleBorder(),
                  child: const Padding(
                    padding: EdgeInsets.all(8),
                    child: Icon(Icons.arrow_back_rounded, size: 24),
                  ),
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),

              // Status pill
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppConstants.spacingM,
                    vertical: AppConstants.spacingS,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius:
                        BorderRadius.circular(AppConstants.radiusCircular),
                    boxShadow: const [
                      BoxShadow(
                          color: AppColors.shadow,
                          blurRadius: 8,
                          offset: Offset(0, 2))
                    ],
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(serviceType.icon,
                          size: 14, color: serviceType.color),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          _statusLabel(trip),
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                            color: AppColors.textPrimary,
                          ),
                          textAlign: TextAlign.center,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(width: AppConstants.spacingS),

              // ETA badge — changes color as time runs out
              AnimatedContainer(
                duration: const Duration(milliseconds: 500),
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: _etaSeconds < 60
                      ? AppColors.error
                      : _etaSeconds < 180
                          ? AppColors.warning
                          : serviceType.color,
                  borderRadius:
                      BorderRadius.circular(AppConstants.radiusCircular),
                  boxShadow: [
                    BoxShadow(
                      color: (_etaSeconds < 60
                              ? AppColors.error
                              : _etaSeconds < 180
                                  ? AppColors.warning
                                  : serviceType.color)
                          .withValues(alpha: 0.4),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Text(
                  _etaLabel,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _statusLabel(ActiveTripEntity trip) => switch (trip.state) {
        ActiveTripState.toPickup => 'Yendo al pasajero',
        ActiveTripState.waiting => 'Esperando al pasajero',
        ActiveTripState.inProgress => 'En camino al destino',
      };

  // ── Bottom card ──────────────────────────────────────────────────────────

  Widget _buildBottomCard(ActiveTripEntity trip) {
    return switch (trip.state) {
      ActiveTripState.toPickup => GoingToPassengerCard(
          trip: trip,
          routeProgress: _routeProgress,
          onArrived: _isLoading ? null : _handleArrived,
          onCancelled: _handleCancelled,
        ),
      ActiveTripState.waiting => WaitingPassengerCard(
          trip: trip,
          onStartTrip: _isLoading ? null : _handleStartTrip,
        ),
      ActiveTripState.inProgress => TripInProgressCard(
          trip: trip,
          routeProgress: _routeProgress,
          onFinishTrip: _isLoading ? null : _handleFinishTrip,
        ),
    };
  }

  // ── Action handlers ──────────────────────────────────────────────────────

  Future<void> _handleArrived() async {
    setState(() => _isLoading = true);
    try {
      await ref.read(activeTripProvider.notifier).arrivedAtPassenger();
    } catch (_) {
      if (mounted) AppSnackbar.showError(context, 'Error al actualizar estado');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleStartTrip() async {
    setState(() => _isLoading = true);
    try {
      await ref.read(activeTripProvider.notifier).startTrip();
    } catch (_) {
      if (mounted) AppSnackbar.showError(context, 'Error al iniciar el viaje');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleFinishTrip() async {
    setState(() => _isLoading = true);
    try {
      final tripModel =
          await ref.read(activeTripProvider.notifier).finishTrip();
      await ref
          .read(driverStatusProvider.notifier)
          .updateEarnings(tripModel.netEarning);
      if (mounted) context.go('/trip-summary', extra: tripModel);
    } catch (_) {
      if (mounted) {
        AppSnackbar.showError(context, 'Error al finalizar el viaje');
        setState(() => _isLoading = false);
      }
    }
  }

  void _handleCancelled() {
    _movementTimer?.cancel();
    _etaTimer?.cancel();
    ref.read(activeTripProvider.notifier).state = null;
    if (mounted) context.go('/home');
  }

  // ── Dialogs ──────────────────────────────────────────────────────────────

  Future<void> _showCannotLeaveDialog() async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Viaje en curso'),
        content: const Text(
          'No puedes salir mientras el viaje está en progreso. '
          'Finaliza el viaje primero.',
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmGoBack() async {
    if (!mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Salir del viaje?'),
        content: const Text('Si sales ahora el viaje será cancelado.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Quedarse'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Salir'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) _handleCancelled();
  }
}
