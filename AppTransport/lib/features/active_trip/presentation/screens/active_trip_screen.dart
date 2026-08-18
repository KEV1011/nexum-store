import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
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
import 'package:nexum_driver/shared/widgets/custody_pin_dialog.dart';
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

  // Posición del conductor. Arranca en el centro de la ciudad solo como
  // encuadre inicial y la sustituye el primer fix del GPS, que en un viaje
  // activo llega en segundos (el seguimiento ya está en marcha desde que se
  // puso en línea).
  LatLng _driverPos = const LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );
  StreamSubscription<Position>? _posSub;

  /// ¿La ruta dibujada se trazó desde una posición REAL del conductor? Mientras
  /// sea falso no hay ruta en pantalla: es preferible un mapa sin línea que una
  /// línea que sale de un sitio donde el conductor no está.
  bool _origenRealDeRuta = false;

  // Rumbo actual del vehículo (grados) para orientar el marcador.
  double _heading = 0;

  Timer? _etaTimer;
  int _etaSeconds = 0;

  // Ruta del tramo: dónde empezó y los puntos por los que pasa. Son para
  // DIBUJAR y para medir el avance; el conductor va donde dice el GPS.
  LatLng _routeStart = const LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );
  List<LatLng> _waypoints = const [];
  int _waypointIndex = 0;
  bool _nearDestinationShown = false;
  StreamSubscription<String>? _orderCancelSub;
  StreamSubscription<String>? _custodyPinSub;
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

        // El backend rechazó el PIN de custodia: el servicio NO avanzó de
        // estado allá, así que hay que avisar con claridad para que el
        // conductor lo pida de nuevo y reintente.
        _custodyPinSub =
            DriverWsService().custodyPinErrors.listen((mensaje) {
          if (!mounted) return;
          AppSnackbar.showError(context, mensaje);
        });

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
    _custodyPinSub?.cancel();
    _chatSub?.cancel();
    _pulse.dispose();
    _posSub?.cancel();
    _etaTimer?.cancel();
    _mapController.dispose();
    super.dispose();
  }

  // ── Recorrido del tramo, con la posición REAL del conductor ──────────────

  /// Prepara el tramo actual: traza la ruta y arranca el seguimiento del GPS.
  ///
  /// Antes esto se llamaba `_startSimulatedMovement` y hacía honor al nombre:
  /// un temporizador cada 1,8 s iba moviendo el marcador de un punto al
  /// siguiente de una ruta generada en forma de L. El conductor veía su carro
  /// avanzar solo, por una calle inventada, mientras él estaba parado en un
  /// semáforo — y si el GPS no tenía fix, esa posición simulada se le enviaba
  /// AL SERVIDOR, así que el pasajero también veía moverse un carro que no se
  /// movía. Ahora el marcador es el GPS y nada más; la ruta dibujada sigue
  /// siendo la de Google (o la recta de respaldo) y el avance se mide por lo
  /// cerca que está el conductor de ella.
  void _startSimulatedMovement(ActiveTripEntity trip) {
    _nearDestinationShown = false;
    // La posición REAL primero. Si ya hay lectura del GPS, la ruta se traza
    // desde donde está el conductor; si no, no se traza nada todavía.
    final ultima = LocationService().lastPosition;
    if (ultima != null) {
      _driverPos = LatLng(ultima.latitude, ultima.longitude);
      _origenRealDeRuta = true;
    } else {
      _origenRealDeRuta = false;
    }
    _trazarTramo(trip);
    _seguirGpsReal();
  }

  /// Traza la ruta del tramo desde la posición actual del conductor.
  ///
  /// Solo dibuja si esa posición es REAL. Aquí estaba el resto del fallo del
  /// arreglo anterior: se movió el marcador al GPS pero la ruta se seguía
  /// calculando en `initState`, cuando `_driverPos` todavía valía el centro de
  /// Pamplona. El conductor veía su carro en su calle y, al lado, un trayecto
  /// que arrancaba en el obelisco y un "0 % hacia el pasajero" que no bajaba
  /// nunca, porque el punto de partida del cálculo no era el suyo.
  void _trazarTramo(ActiveTripEntity trip) {
    if (!_origenRealDeRuta) {
      // Sin GPS aún no hay desde dónde trazar. Se limpia para no dejar puesta
      // la ruta del tramo anterior, y el primer fix la traza.
      if (_waypoints.isNotEmpty) {
        setState(() {
          _waypoints = const [];
          _waypointIndex = 0;
        });
      }
      return;
    }
    final target = trip.isInProgress
        ? trip.request.destination.latLng
        : trip.request.origin.latLng;

    _routeStart = _driverPos;
    _waypoints = _generateWaypoints(_driverPos, target);
    _waypointIndex = 0;

    // Ruta REAL por las calles (Routes API vía el proxy del backend): si el
    // servidor tiene GOOGLE_MAPS_API_KEY, reemplaza la esquina en L simulada.
    // Sin llave/red devuelve null y el trazado actual se mantiene.
    final routeTarget = target;
    final desde = _driverPos;
    fetchRoutePoints(
      originLat: desde.latitude,
      originLng: desde.longitude,
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
        _routeStart = desde;
        _waypoints = points;
        _waypointIndex = 0;
      });
    });
  }

  /// El marcador del conductor y el avance del tramo salen del GPS.
  void _seguirGpsReal() {
    _posSub?.cancel();
    // Si ya hay una lectura, se coloca sin esperar a la siguiente.
    final ultima = LocationService().lastPosition;
    if (ultima != null) {
      _aplicarPosicionReal(LatLng(ultima.latitude, ultima.longitude));
    }
    _posSub = LocationService().positionStream.listen((pos) {
      if (!mounted) return;
      _aplicarPosicionReal(LatLng(pos.latitude, pos.longitude));
    });
  }

  void _aplicarPosicionReal(LatLng nueva) {
    // Se llama tanto desde el stream como en seco al entrar (si ya había fix),
    // así que el guard va aquí y no solo en quien llama.
    if (!mounted) return;
    final anterior = _driverPos;

    // Primer fix de la pantalla: la ruta no se pudo trazar al entrar porque no
    // se sabía desde dónde. Ahora sí, y se traza desde aquí.
    if (!_origenRealDeRuta) {
      _driverPos = nueva;
      _origenRealDeRuta = true;
      final trip = ref.read(activeTripProvider);
      if (trip != null) _trazarTramo(trip);
      setState(() {});
      return;
    }
    setState(() {
      if (nueva != anterior) _heading = bearingBetween(anterior, nueva);
      _driverPos = nueva;
      _waypointIndex = _indiceMasCercano(nueva);
    });

    // Aviso de "ya casi llegas" al 85 % del tramo. Ahora se dispara porque el
    // conductor recorrió el 85 %, no porque hayan pasado N segundos.
    if (_waypoints.isNotEmpty && !_nearDestinationShown) {
      final progreso = _waypointIndex / _waypoints.length;
      final current = ref.read(activeTripProvider);
      if (progreso >= 0.85 && current != null) {
        _nearDestinationShown = true;
        AppSnackbar.showInfo(
          context,
          current.isInProgress
              ? '¡Llegando al destino!'
              : '¡El pasajero está cerca!',
        );
      }
    }

    // Se reenvía al servidor, que se lo pasa al mapa del pasajero. Solo
    // posiciones reales: es la misma regla que sigue el latido.
    final current = ref.read(activeTripProvider);
    if (current != null) {
      DriverWsService().sendLocationUpdate(
        nueva.latitude,
        nueva.longitude,
        tripId: current.request.id,
      );
    }

    if (_autoFollow) {
      final zoom =
          current?.isInProgress == true ? 16.5 : MapConstants.tripZoom;
      try {
        _mapController.move(nueva, zoom);
      } catch (_) {/* mapa no listo */}
    }
  }

  /// Índice del punto de la ruta más cercano al conductor = cuánto lleva
  /// recorrido. Sustituye al contador que subía solo con el reloj.
  int _indiceMasCercano(LatLng p) {
    if (_waypoints.isEmpty) return 0;
    var mejor = 0;
    var mejorDist = double.infinity;
    for (var i = 0; i < _waypoints.length; i++) {
      final w = _waypoints[i];
      // Distancia al cuadrado en grados: basta para comparar, y evita raíces
      // y trigonometría en cada fix.
      final dLat = w.latitude - p.latitude;
      final dLng = w.longitude - p.longitude;
      final d = dLat * dLat + dLng * dLng;
      if (d < mejorDist) {
        mejorDist = d;
        mejor = i;
      }
    }
    // Nunca retrocede: si el GPS da un salto hacia atrás, el tramo recorrido
    // no se "des-recorre" en la barra de progreso.
    return mejor > _waypointIndex ? mejor : _waypointIndex;
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
          // 1º el vehículo REAL del conductor; 2º el tipo del VIAJE.
          //
          // El segundo escalón era `selectedServiceTypeProvider`, que es la
          // pestaña que el conductor tiene marcada en su pantalla, no lo que
          // está conduciendo. Un motociclista con "Particular" seleccionado
          // veía un carro en el mapa durante una carrera en moto. El viaje
          // trae su propio `serviceType` ('MOTO', 'TAXI'…) y es el dato que
          // manda cuando el perfil todavía no ha cargado.
          kind: vehicleGlyphKindFor(
            ref.watch(driverProfileProvider).profile?.vehicleType ??
                trip.request.serviceType,
            fallback: VehicleGlyphKind.car,
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

    // Cadena de custodia al RECOGER: solo en pedidos, donde el negocio está
    // registrado y ve su PIN en el portal. En un mandado se recoge en un
    // establecimiento cualquiera (farmacia, tienda) que no tiene forma de dar
    // un PIN — allí la custodia se prueba en la entrega. Se pide ANTES de
    // avanzar el estado local: si el conductor cancela, no cambia nada.
    final necesitaPin = trip.request.isOrder;
    String? pin;
    if (necesitaPin) {
      pin = await showCustodyPinDialog(context, phase: CustodyPinPhase.pickup);
      if (!mounted || pin == null) return;
    }

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
          DriverWsService().sendOrderStatus(
            tripBeforeStart.request.orderId!,
            'in_transit',
            pin: pin,
          );
        } else if (workMode.isErrand) {
          DriverWsService().sendErrandStatus(
            tripBeforeStart.request.id,
            'on_the_way',
            actualCost: proof.actualCost,
            pin: pin,
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

    // Cadena de custodia: quien recibe dicta su PIN de 4 dígitos. Se pide antes
    // de cerrar el servicio; si el conductor cancela, la entrega no se marca.
    // Los ENVÍOS también: es mercancía que cambia de manos, y era el único
    // servicio de reparto sin prueba de entrega verificable.
    final necesitaPin = tripBeforeFinish != null &&
        (tripBeforeFinish.request.isOrder ||
            tripBeforeFinish.request.isEnvios ||
            workMode.isErrand);
    String? pin;
    if (necesitaPin) {
      pin = await showCustodyPinDialog(context, phase: CustodyPinPhase.delivery);
      if (!mounted) return;
      if (pin == null) {
        _finishing = false; // permite reintentar la entrega
        return;
      }
    }

    setState(() => _isLoading = true);
    try {
      if (tripBeforeFinish != null) {
        if (tripBeforeFinish.request.isOrder) {
          // Entregado: el backend liquida el domicilio en la billetera.
          DriverWsService().sendOrderStatus(
            tripBeforeFinish.request.orderId!,
            'delivered',
            pin: pin,
          );
        } else if (workMode.isErrand) {
          DriverWsService().sendErrandStatus(
            tripBeforeFinish.request.id,
            'delivered',
            pin: pin,
          );
        } else {
          DriverWsService().sendTripStatus(
            tripBeforeFinish.request.id,
            'completed',
            pin: pin,
          );
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
    _posSub?.cancel();
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
