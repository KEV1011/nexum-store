import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';
import 'package:nexum_driver/core/domain/service_type_provider.dart';
import 'package:nexum_driver/core/domain/work_mode.dart';
import 'package:nexum_driver/core/domain/work_mode_provider.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/active_trip_provider.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/delivery_proof_sheet.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/going_to_passenger_card.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/pickup_proof_sheet.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/trip_in_progress_card.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/waiting_passenger_card.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
import 'package:nexum_driver/shared/services/driver_ws_service.dart';

class ActiveTripScreen extends ConsumerStatefulWidget {
  const ActiveTripScreen({this.tripExtra, super.key});
  final Object? tripExtra;

  @override
  ConsumerState<ActiveTripScreen> createState() => _ActiveTripScreenState();
}

class _ActiveTripScreenState extends ConsumerState<ActiveTripScreen> {
  final _mapController = MapController();
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
    _mapController.dispose();
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

      // Relay GPS to server → forwarded to client tracking map
      final current = ref.read(activeTripProvider);
      if (current != null) {
        DriverWsService().sendLocationUpdate(
          next.latitude,
          next.longitude,
          tripId: current.request.id,
        );
      }

      if (_autoFollow) {
        final zoom = current?.isInProgress == true ? 16.5 : MapConstants.tripZoom;
        _mapController.move(next, zoom);
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
    if (points.length < 2) return;
    _mapController.fitCamera(
      CameraFit.coordinates(
        coordinates: points,
        padding: const EdgeInsets.all(72),
      ),
    );
  }

  void _zoomTo(LatLng target, {double zoom = 16}) {
    _mapController.move(target, zoom);
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

    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter: _driverPos,
        initialZoom: MapConstants.tripZoom,
        onMapReady: () => _fitBoundsToRoute(boundsPoints),
        onPositionChanged: (camera, hasGesture) {
          if (hasGesture && _autoFollow) {
            setState(() => _autoFollow = false);
          }
        },
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.nexum.driver',
        ),
        PolylineLayer(polylines: _buildPolylines(trip, serviceType)),
        MarkerLayer(markers: _buildMarkers(trip, serviceType)),
      ],
    );
  }

  List<Marker> _buildMarkers(ActiveTripEntity trip, ServiceType serviceType) {
    final originLatLng = trip.request.origin.latLng;

    return [
      Marker(
        point: _driverPos,
        width: 48,
        height: 48,
        child: Container(
          decoration: BoxDecoration(
            color: serviceType.color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: [
              BoxShadow(
                color: serviceType.color.withValues(alpha: 0.45),
                blurRadius: 12,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: Icon(serviceType.icon, color: Colors.white, size: 22),
        ),
      ),
      Marker(
        point: originLatLng,
        width: 44,
        height: 44,
        child: Container(
          decoration: const BoxDecoration(
            color: AppColors.pickupMarker,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.person_pin_rounded,
            color: Colors.white,
            size: 22,
          ),
        ),
      ),
      Marker(
        point: trip.request.destination.latLng,
        width: 44,
        height: 44,
        child: Container(
          decoration: const BoxDecoration(
            color: AppColors.destinationMarker,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.location_on_rounded,
            color: Colors.white,
            size: 22,
          ),
        ),
      ),
    ];
  }

  List<Polyline> _buildPolylines(
      ActiveTripEntity trip, ServiceType serviceType) {
    final dashedPattern = StrokePattern.dashed(segments: const [18, 8]);
    final solidPattern = StrokePattern.solid();

    if (_waypoints.isEmpty) {
      final target = trip.isInProgress
          ? trip.request.destination.latLng
          : trip.request.origin.latLng;
      return [
        Polyline(
          points: [_driverPos, target],
          color: serviceType.color,
          strokeWidth: 5,
          pattern: trip.isToPickup ? dashedPattern : solidPattern,
          strokeCap: StrokeCap.round,
          strokeJoin: StrokeJoin.round,
        ),
      ];
    }

    final fullRoute = [_routeStart, ..._waypoints];
    final splitAt = (_waypointIndex + 1).clamp(0, fullRoute.length);
    final consumed = fullRoute.take(splitAt).toList();
    final remaining = fullRoute.skip(splitAt > 0 ? splitAt - 1 : 0).toList();

    return [
      if (consumed.length >= 2)
        Polyline(
          points: consumed,
          color: Colors.grey.withValues(alpha: 0.45),
          strokeWidth: 5,
          strokeCap: StrokeCap.round,
          strokeJoin: StrokeJoin.round,
        ),
      if (remaining.length >= 2) ...[
        Polyline(
          points: remaining,
          color: Colors.black.withValues(alpha: 0.15),
          strokeWidth: 9,
        ),
        Polyline(
          points: remaining,
          color: serviceType.color,
          strokeWidth: 5,
          pattern: trip.isToPickup ? dashedPattern : solidPattern,
          strokeCap: StrokeCap.round,
          strokeJoin: StrokeJoin.round,
        ),
      ],
    ];
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

  String _statusLabel(ActiveTripEntity trip) {
    final workMode = ref.read(selectedWorkModeProvider);
    return switch (trip.state) {
      ActiveTripState.toPickup => switch (workMode) {
          WorkMode.pedido => 'Yendo al restaurante',
          WorkMode.paquete => 'Yendo a recoger el paquete',
          WorkMode.mandado => 'Yendo a realizar el mandado',
          WorkMode.pasajero => 'Yendo al pasajero',
        },
      ActiveTripState.waiting => switch (workMode) {
          WorkMode.pedido => 'En el local · recoge el pedido',
          WorkMode.paquete => 'Recogiendo el paquete',
          WorkMode.mandado => 'Realizando el mandado',
          WorkMode.pasajero => 'Esperando pasajero',
        },
      ActiveTripState.inProgress => switch (workMode) {
          WorkMode.pedido => 'Entregando el pedido',
          WorkMode.paquete => 'Entregando el paquete',
          WorkMode.mandado => 'Entregando el mandado',
          WorkMode.pasajero => 'En camino al destino',
        },
    };
  }

  // ── Bottom card ──────────────────────────────────────────────────────────

  Widget _buildBottomCard(ActiveTripEntity trip) {
    final workMode = ref.read(selectedWorkModeProvider);
    final isDelivery = workMode.isDelivery;
    return switch (trip.state) {
      ActiveTripState.toPickup => GoingToPassengerCard(
          trip: trip,
          routeProgress: _routeProgress,
          isEnvios: isDelivery,
          onArrived: _isLoading ? null : _handleArrived,
          onCancelled: _handleCancelled,
        ),
      ActiveTripState.waiting => WaitingPassengerCard(
          trip: trip,
          isEnvios: isDelivery,
          onStartTrip: isDelivery || _isLoading ? null : _handleStartTrip,
          onPickupConfirm: isDelivery && !_isLoading ? _handlePickupConfirm : null,
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
      final trip = ref.read(activeTripProvider);
      await ref.read(activeTripProvider.notifier).arrivedAtPassenger();
      if (trip != null) DriverWsService().sendTripStatus(trip.request.id, 'arrived');
    } catch (_) {
      if (mounted) AppSnackbar.showError(context, 'Error al actualizar estado');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleStartTrip() async {
    setState(() => _isLoading = true);
    try {
      final trip = ref.read(activeTripProvider);
      await ref.read(activeTripProvider.notifier).startTrip();
      if (trip != null) DriverWsService().sendTripStatus(trip.request.id, 'in_progress');
    } catch (_) {
      if (mounted) {
        AppSnackbar.showError(context, 'Error al iniciar el viaje');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  /// Para pedido/paquete: requiere foto del paquete antes de salir.
  Future<void> _handlePickupConfirm() async {
    if (!mounted) return;
    final trip = ref.read(activeTripProvider);
    if (trip == null) return;

    final workMode = ref.read(selectedWorkModeProvider);
    final proof = await PickupProofSheet.show(
      context,
      businessName: trip.request.passenger.name,
      workMode: workMode,
    );

    if (!mounted || proof == null) return;

    setState(() => _isLoading = true);
    try {
      final tripBeforeStart = ref.read(activeTripProvider);
      await ref.read(activeTripProvider.notifier).confirmPickupAndStart(
            photoPath: proof.photoPath,
            orderRef: proof.orderRef,
          );
      if (tripBeforeStart != null) {
        DriverWsService().sendTripStatus(tripBeforeStart.request.id, 'in_progress');
      }
      if (mounted) {
        final msg = workMode == WorkMode.paquete
            ? 'Paquete recogido · En camino al destinatario'
            : 'Pedido recogido · En camino al cliente';
        AppSnackbar.showSuccess(context, msg);
      }
    } catch (_) {
      if (mounted) {
        AppSnackbar.showError(context, 'Error al iniciar la entrega');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleFinishTrip() async {
    setState(() => _isLoading = true);
    try {
      final tripBeforeFinish = ref.read(activeTripProvider);
      if (tripBeforeFinish != null) {
        DriverWsService().sendTripStatus(tripBeforeFinish.request.id, 'completed');
      }
      final tripModel =
          await ref.read(activeTripProvider.notifier).finishTrip();
      await ref
          .read(driverStatusProvider.notifier)
          .updateEarnings(tripModel.netEarning);
      if (!mounted) return;

      final workMode = ref.read(selectedWorkModeProvider);
      if (workMode.isDelivery) {
        final proof = await DeliveryProofSheet.show(
          context,
          recipientName: tripModel.passengerName,
          workMode: workMode,
        );
        if (!mounted) return;
        context.go(
          '/trip-summary',
          extra: tripModel.copyWith(
            isDeliveryTrip: true,
            deliveryPhotoPath: proof?.photoPath,
            hasSignature: proof?.hasSignature ?? false,
          ),
        );
      } else {
        context.go('/trip-summary', extra: tripModel);
      }
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
