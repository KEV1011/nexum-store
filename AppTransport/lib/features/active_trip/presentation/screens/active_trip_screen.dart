import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';
import 'package:nexum_driver/core/domain/service_type_provider.dart';
import 'package:nexum_driver/core/domain/work_mode.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/active_trip_provider.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/delivery_proof_sheet.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/going_to_passenger_card.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/pickup_proof_sheet.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/trip_in_progress_card.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/waiting_passenger_card.dart';
import 'package:nexum_driver/features/active_trip/presentation/screens/trip_chat_screen.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
import 'package:nexum_driver/shared/services/driver_ws_service.dart';
import 'package:nexum_driver/shared/services/notification_service.dart';
import 'package:nexum_driver/shared/services/location_service.dart';
import 'package:nexum_driver/shared/services/proof_upload.dart';
import 'package:nexum_driver/shared/services/route_service.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_profile_provider.dart';
import 'package:nexum_driver/shared/widgets/google_map_tiles.dart';
import 'package:nexum_driver/shared/widgets/map_pin.dart';
import 'package:nexum_driver/shared/widgets/vehicle_glyph.dart';
import 'package:nexum_driver/shared/widgets/vehicle_marker.dart';

class ActiveTripScreen extends ConsumerStatefulWidget {
  const ActiveTripScreen({this.tripExtra, super.key});
  final Object? tripExtra;

  @override
  ConsumerState<ActiveTripScreen> createState() => _ActiveTripScreenState();
}

class _ActiveTripScreenState extends ConsumerState<ActiveTripScreen>
    with SingleTickerProviderStateMixin {
  final _mapController = MapController();
  bool _isLoading = false;
  bool _autoFollow = true;
  // Al finalizar navegamos a /trip-summary; sin este guard, el build detecta
  // trip==null (finishTrip lo anula) y redirige a /home antes, robándose la
  // navegación al resumen (el conductor "se salía al inicio").
  bool _finishing = false;

  // Continuous pulse for the live driver marker halo.
  late final AnimationController _pulse;

  // Simulated driver position — starts at Pamplona center
  LatLng _driverPos = const LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );

  // Rumbo actual del vehículo (grados) para orientar el marcador.
  double _heading = 0;

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
  StreamSubscription<String>? _orderCancelSub;
  // Chat: mensajes sin leer del pasajero mientras el chat no está abierto.
  StreamSubscription<Map<String, dynamic>>? _chatSub;
  int _unreadChat = 0;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final trip = ref.read(activeTripProvider);
      if (trip != null) {
        // Etiqueta el GPS del conductor con este viaje para que el backend lo
        // reenvíe al mapa del pasajero (driver_location).
        DriverWsService().activeTripId = trip.request.id;
        if (trip.isToPickup && !trip.request.isOrder && !trip.request.isErrand) {
          // El pasajero ve "Conductor en camino" (ARRIVING) desde que arranca
          // la navegación al pickup; antes se saltaba directo a ARRIVED.
          // Pedidos y mandados tienen sus propios estados (DRIVER_TO_PICKUP /
          // ACCEPTED se fijan al aceptar) — enviarles trip_status solo genera
          // errores "Trip not found" en el backend.
          DriverWsService().sendTripStatus(trip.request.id, 'arriving');
        }
        _startSimulatedMovement(trip);
        _startEtaCountdown(trip);

        // Pedido cancelado por el cliente (permitido hasta la recogida): se
        // avisa y se libera al repartidor de vuelta al inicio.
        if (trip.request.isOrder) {
          _orderCancelSub =
              DriverWsService().orderCancellations.listen((orderId) {
            if (!mounted) return;
            if (orderId == trip.request.orderId) {
              AppSnackbar.showInfo(context, 'El cliente canceló el pedido.');
              _handleCancelled();
            }
          });
        }

        // Chat con el pasajero: avisa cuando llega un mensaje suyo y el chat no
        // está abierto (badge en el botón + snackbar + vibración), para que el
        // conductor sepa que le escribieron.
        if (!trip.request.isOrder && !trip.request.isErrand) {
          _chatSub = DriverWsService().tripChatEvents.listen((event) {
            if (!mounted) return;
            final msg = event['message'];
            if (msg is! Map<String, dynamic>) return;
            if (event['tripId'] != trip.request.id) return;
            // Solo cuenta los mensajes del pasajero (no los propios).
            if ((msg['senderRole'] as String?) == 'driver') return;
            setState(() => _unreadChat++);
            NotificationService().vibrateSelection();
            AppSnackbar.showInfo(
              context,
              'Nuevo mensaje de ${trip.request.passenger.name}',
            );
          });
        }
      }
    });
  }

  @override
  void dispose() {
    DriverWsService().activeTripId = null;
    _orderCancelSub?.cancel();
    _chatSub?.cancel();
    _pulse.dispose();
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

    // Ruta REAL por las calles (Routes API vía el proxy del backend): si el
    // servidor tiene GOOGLE_MAPS_API_KEY, reemplaza la esquina en L simulada.
    // Sin llave/red devuelve null y el trazado actual se mantiene.
    final routeTarget = target;
    fetchRoutePoints(
      originLat: _driverPos.latitude,
      originLng: _driverPos.longitude,
      destLat: routeTarget.latitude,
      destLng: routeTarget.longitude,
    ).then((points) {
      if (!mounted || points == null) return;
      // Solo si seguimos en el mismo tramo (no cambió la fase del viaje).
      final t = ref.read(activeTripProvider);
      final currentTarget = t == null
          ? null
          : (t.isInProgress
              ? t.request.destination.latLng
              : t.request.origin.latLng);
      if (currentTarget == null ||
          currentTarget.latitude != routeTarget.latitude ||
          currentTarget.longitude != routeTarget.longitude) {
        return;
      }
      setState(() {
        _waypoints = points;
        _waypointIndex = 0;
      });
    });

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
        // Rumbo hacia el siguiente punto → orienta el marcador del vehículo.
        if (next != _driverPos) _heading = bearingBetween(_driverPos, next);
        _driverPos = next;
        _waypointIndex++;
      });

      // Relay GPS to server → forwarded to client tracking map. Usa el GPS real
      // del dispositivo cuando hay fix; cae a la posición simulada (demo/web o
      // sin señal) para que el mapa del pasajero no se congele.
      final current = ref.read(activeTripProvider);
      if (current != null) {
        final realPos = LocationService().lastPosition;
        DriverWsService().sendLocationUpdate(
          realPos?.latitude ?? next.latitude,
          realPos?.longitude ?? next.longitude,
          tripId: current.request.id,
        );
      }

      if (_autoFollow) {
        final zoom = current?.isInProgress == true ? 16.5 : MapConstants.tripZoom;
        try {
          _mapController.move(next, zoom);
        } catch (_) {/* mapa no listo */}
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
    // Si todos los puntos son (casi) idénticos —el conductor está sobre el punto
    // de recogida, o el viaje tiene origen ≈ destino— CameraFit.coordinates
    // produce un bounds degenerado con zoom NaN que REVIENTA el mapa (pantalla
    // en blanco / congelada). En ese caso solo centramos con un move.
    final first = points.first;
    const eps = 1e-4; // ~11 m
    final degenerate = points.every((p) =>
        (p.latitude - first.latitude).abs() < eps &&
        (p.longitude - first.longitude).abs() < eps);
    try {
      if (degenerate) {
        _mapController.move(first, 16);
        return;
      }
      _mapController.fitCamera(
        CameraFit.coordinates(
          coordinates: points,
          padding: const EdgeInsets.all(72),
        ),
      );
    } catch (_) {
      // El mapa aún no está listo o los puntos son inválidos: nunca dejar que
      // un error de cámara tumbe la pantalla del viaje.
    }
  }

  void _zoomTo(LatLng target, {double zoom = 16}) {
    try {
      _mapController.move(target, zoom);
    } catch (_) {/* mapa no listo */}
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
      // Si estamos finalizando, _handleFinishTrip ya navega a /trip-summary; no
      // redirigir a /home (evita el "se sale al inicio" tras un envío/viaje).
      if (!_finishing) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) context.go('/home');
        });
      }
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
        const GoogleMapTiles(),
        PolylineLayer(polylines: _buildPolylines(trip, serviceType)),
        MarkerLayer(markers: _buildMarkers(trip, serviceType)),
      ],
    );
  }

  List<Marker> _buildMarkers(ActiveTripEntity trip, ServiceType serviceType) {
    final originLatLng = trip.request.origin.latLng;
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return [
      // Pickup (origen) — pin gota Google Maps.
      Marker(
        point: originLatLng,
        width: MapPin.markerWidth,
        height: MapPin.markerHeight,
        alignment: Alignment.topCenter,
        child: const MapPin(
          color: AppColors.pickupMarker,
          icon: Icons.person_rounded,
        ),
      ),
      // Destino — pin gota.
      Marker(
        point: trip.request.destination.latLng,
        width: MapPin.markerWidth,
        height: MapPin.markerHeight,
        alignment: Alignment.topCenter,
        child: const MapPin(
          color: AppColors.destinationMarker,
          icon: Icons.flag_rounded,
        ),
      ),
      // Mi vehículo — ilustrado con MI vehículo real (moto/carro/camión),
      // se voltea según el rumbo. Fallback al tipo de servicio si el perfil
      // aún no cargó.
      Marker(
        point: _driverPos,
        width: VehicleGlyph.markerWidth,
        height: VehicleGlyph.markerHeight,
        child: VehicleGlyph(
          kind: vehicleGlyphKindFor(
            ref.watch(driverProfileProvider).profile?.vehicleType,
            fallback: serviceType == ServiceType.moto
                ? VehicleGlyphKind.moto
                : VehicleGlyphKind.car,
          ),
          headingDegrees: _heading,
          pulse: _pulse,
          animate: !reduceMotion,
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
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                            color: context.textPrimaryColor,
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

              const SizedBox(width: AppConstants.spacingS),

              // Chat con el pasajero — visible durante todo el viaje (viajes
              // normales; pedidos/mandados no usan el chat de viaje).
              if (!trip.request.isOrder && !trip.request.isErrand) ...[
                Badge(
                  isLabelVisible: _unreadChat > 0,
                  label: Text('$_unreadChat'),
                  child: Material(
                    color: AppColors.primary,
                    elevation: 4,
                    shadowColor: AppColors.shadow,
                    shape: const CircleBorder(),
                    child: InkWell(
                      onTap: () {
                        setState(() => _unreadChat = 0);
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => TripChatScreen(
                              tripId: trip.request.id,
                              peerName: trip.request.passenger.name,
                            ),
                          ),
                        );
                      },
                      customBorder: const CircleBorder(),
                      child: const Padding(
                        padding: EdgeInsets.all(8),
                        child: Icon(Icons.chat_bubble_rounded,
                            size: 24, color: Colors.white),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: AppConstants.spacingS),
              ],

              // SOS — emergency, accessible throughout the active trip.
              Material(
                color: AppColors.error,
                elevation: 4,
                shadowColor: AppColors.shadow,
                shape: const CircleBorder(),
                child: InkWell(
                  onTap: () => context.push('/safety'),
                  customBorder: const CircleBorder(),
                  child: const Padding(
                    padding: EdgeInsets.all(8),
                    child: Icon(Icons.sos_rounded, size: 24, color: Colors.white),
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
    final workMode = _deliveryWorkMode(trip.request);
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
    // La prueba de foto se decide por el TIPO REAL del viaje (envío/pedido/
    // mandado), no por el modo del conductor: desde la unificación recibe
    // entregas aunque esté en modo Pasajeros (antes se saltaba la foto).
    final isDelivery = trip.request.isDelivery;
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
          isMandado: trip.request.isErrand,
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

  // Deriva el modo de trabajo del TIPO REAL del viaje (no del selector del
  // conductor): así envíos/pedidos/mandados disparan su flujo de foto y estados
  // aunque el conductor esté en modo Pasajeros (unificación del despacho).
  WorkMode _deliveryWorkMode(TripRequestEntity r) {
    if (r.isErrand) return WorkMode.mandado;
    if (r.isOrder) return WorkMode.pedido;
    if (r.isEnvios) return WorkMode.paquete;
    return WorkMode.pasajero;
  }

  // ── Action handlers ──────────────────────────────────────────────────────

  Future<void> _handleArrived() async {
    setState(() => _isLoading = true);
    try {
      final trip = ref.read(activeTripProvider);
      await ref.read(activeTripProvider.notifier).arrivedAtPassenger();
      if (trip != null) {
        final workMode = _deliveryWorkMode(trip.request);
        if (trip.request.isOrder) {
          // Entrega de pedido: llegó al negocio a recoger.
          DriverWsService().sendOrderStatus(trip.request.orderId!, 'at_pickup');
        } else if (workMode.isErrand) {
          DriverWsService().sendErrandStatus(trip.request.id, 'shopping');
        } else {
          DriverWsService().sendTripStatus(trip.request.id, 'arrived');
        }
      }
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

    final workMode = _deliveryWorkMode(trip.request);
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
        if (tripBeforeStart.request.isOrder) {
          // Pedido recogido en el negocio: en tránsito al cliente.
          DriverWsService()
              .sendOrderStatus(tripBeforeStart.request.orderId!, 'in_transit');
        } else if (workMode.isErrand) {
          DriverWsService().sendErrandStatus(
            tripBeforeStart.request.id,
            'on_the_way',
            actualCost: proof.actualCost,
          );
        } else {
          DriverWsService().sendTripStatus(tripBeforeStart.request.id, 'in_progress');
        }
        // La foto de recogida sube al backend en segundo plano (best-effort).
        final pickupPhoto = proof.photoPath;
        if (pickupPhoto != null) {
          unawaited(uploadProofPhoto(
            kind: tripBeforeStart.request.isOrder
                ? 'order'
                : workMode.isErrand
                    ? 'errand'
                    : 'trip',
            id: tripBeforeStart.request.isOrder
                ? tripBeforeStart.request.orderId!
                : tripBeforeStart.request.id,
            phase: 'pickup',
            photoPath: pickupPhoto,
          ));
        }
      }
      if (mounted) {
        final msg = workMode == WorkMode.paquete
            ? 'Paquete recogido · En camino al destinatario'
            : workMode == WorkMode.mandado
                ? 'Mandado realizado · En camino al cliente'
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
    // Marca que estamos finalizando: cuando finishTrip() anule el estado, el
    // build NO debe redirigir a /home (vamos a /trip-summary).
    _finishing = true;
    final tripBeforeFinish = ref.read(activeTripProvider);
    final workMode = tripBeforeFinish != null
        ? _deliveryWorkMode(tripBeforeFinish.request)
        : WorkMode.pasajero;

    // Para entregas (envío/pedido/mandado) pedimos la prueba de foto ANTES de
    // cerrar el viaje. Si cerráramos primero, `finishTrip()` deja el estado en
    // null y la pantalla navega a /home antes de que el conductor pueda
    // fotografiar la entrega (bug reportado: "se sale y se termina el envío").
    DeliveryProof? proof;
    if (workMode.isDelivery && tripBeforeFinish != null) {
      proof = await DeliveryProofSheet.show(
        context,
        recipientName: tripBeforeFinish.request.passenger.name,
        workMode: workMode,
      );
      if (!mounted) return;
    }

    setState(() => _isLoading = true);
    try {
      if (tripBeforeFinish != null) {
        if (tripBeforeFinish.request.isOrder) {
          // Entregado: el backend liquida el domicilio en la billetera.
          DriverWsService()
              .sendOrderStatus(tripBeforeFinish.request.orderId!, 'delivered');
        } else if (workMode.isErrand) {
          DriverWsService().sendErrandStatus(tripBeforeFinish.request.id, 'delivered');
        } else {
          DriverWsService().sendTripStatus(tripBeforeFinish.request.id, 'completed');
        }
      }

      // La prueba de entrega sube al backend en segundo plano (best-effort).
      final deliveryPhoto = proof?.photoPath;
      if (tripBeforeFinish != null && deliveryPhoto != null) {
        unawaited(uploadProofPhoto(
          kind: tripBeforeFinish.request.isOrder
              ? 'order'
              : workMode.isErrand
                  ? 'errand'
                  : 'trip',
          id: tripBeforeFinish.request.isOrder
              ? tripBeforeFinish.request.orderId!
              : tripBeforeFinish.request.id,
          phase: 'delivery',
          photoPath: deliveryPhoto,
        ));
      }

      final tripModel =
          await ref.read(activeTripProvider.notifier).finishTrip();
      await ref
          .read(driverStatusProvider.notifier)
          .updateEarnings(tripModel.netEarning);
      if (!mounted) return;

      if (workMode.isDelivery) {
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
