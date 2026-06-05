import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong2.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/location/location_service.dart';
import 'package:nexum_client/core/location/maps_service.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';

// ── UI helpers ────────────────────────────────────────────────────────────────

Color _colorOf(TransportServiceType t) => switch (t) {
  TransportServiceType.transporte => AppColors.serviceParticular,
  TransportServiceType.moto => AppColors.serviceMoto,
  TransportServiceType.envios => AppColors.serviceEnvios,
};

IconData _statusIcon(TransportStatus s) => switch (s) {
  TransportStatus.searching => Icons.search_rounded,
  TransportStatus.accepted => Icons.person_pin_rounded,
  TransportStatus.arriving => Icons.directions_rounded,
  TransportStatus.arrived => Icons.location_on_rounded,
  TransportStatus.inProgress => Icons.near_me_rounded,
  TransportStatus.completed => Icons.check_circle_rounded,
  TransportStatus.cancelled => Icons.cancel_rounded,
};

/// Seguimiento en vivo: mapa full-screen + panel de información arrastrabe.
class TransportTrackingScreen extends ConsumerStatefulWidget {
  const TransportTrackingScreen({required this.requestId, super.key});

  final String requestId;

  @override
  ConsumerState<TransportTrackingScreen> createState() =>
      _TransportTrackingScreenState();
}

class _TransportTrackingScreenState
    extends ConsumerState<TransportTrackingScreen> {
  final MapController _map = MapController();
  LatLng? _driverPos;
  LatLng? _driverPosPrev;
  Timer? _animTimer;

  // Origen/destino reales (geocodificados) + ruta siguiendo calles.
  LatLng? _origin;
  LatLng? _dest;
  List<LatLng>? _routePoints;
  bool _resolveStarted = false;

  static const _animTickMs = 50;
  static const _animDurationMs = 1200;

  @override
  void dispose() {
    _animTimer?.cancel();
    _map.dispose();
    super.dispose();
  }

  // Punto de origen efectivo (real si se geocodificó, si no Pamplona).
  LatLng get _originPoint => _origin ?? kPamplonaCenter;

  // Punto de destino efectivo (real o desplazado para la simulación).
  LatLng get _destPoint =>
      _dest ??
      LatLng(
        kPamplonaCenter.latitude + 0.007,
        kPamplonaCenter.longitude + 0.005,
      );

  /// Geocodifica las direcciones del viaje y obtiene la ruta real una vez.
  Future<void> _resolveRoute(TransportRequestEntity req) async {
    final maps = ref.read(mapsServiceProvider);
    final results = await Future.wait([
      maps.geocode(req.originAddress),
      maps.geocode(req.destinationAddress),
    ]);
    if (!mounted) return;
    final origin = results[0];
    final dest = results[1];
    if (origin == null || dest == null) return; // respaldo a la simulación

    setState(() {
      _origin = origin;
      _dest = dest;
    });

    final route = await maps.route(origin, dest);
    if (!mounted) return;
    setState(() => _routePoints = route?.points ?? [origin, dest]);
    _fitCamera(req);
  }

  // Anima suavemente el marcador del conductor cuando llegan nuevas coords.
  void _updateDriverPos(LatLng newPos) {
    if (_driverPos == null) {
      setState(() => _driverPos = newPos);
      return;
    }
    _driverPosPrev = _driverPos;
    _animTimer?.cancel();
    const steps = _animDurationMs ~/ _animTickMs;
    var step = 0;
    _animTimer = Timer.periodic(const Duration(milliseconds: _animTickMs), (_) {
      step++;
      final t = (step / steps).clamp(0.0, 1.0);
      final from = _driverPosPrev!;
      if (!mounted) {
        _animTimer?.cancel();
        return;
      }
      setState(() {
        _driverPos = LatLng(
          from.latitude + (newPos.latitude - from.latitude) * t,
          from.longitude + (newPos.longitude - from.longitude) * t,
        );
      });
      if (step >= steps) _animTimer?.cancel();
    });
  }

  List<Marker> _buildMarkers(TransportRequestEntity req) {
    final result = <Marker>[];

    result.add(
      Marker(
        point: _originPoint,
        width: 32,
        height: 32,
        alignment: Alignment.bottomCenter,
        child: const Icon(Icons.location_on, color: Colors.green, size: 32),
      ),
    );

    result.add(
      Marker(
        point: _destPoint,
        width: 32,
        height: 32,
        alignment: Alignment.bottomCenter,
        child: const Icon(Icons.location_on, color: Colors.red, size: 32),
      ),
    );

    final driverRaw = req.driverLat != null && req.driverLng != null
        ? LatLng(req.driverLat!, req.driverLng!)
        : null;
    if (driverRaw != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (driverRaw != _driverPos) _updateDriverPos(driverRaw);
      });
    }
    final dp = _driverPos ?? driverRaw;
    if (dp != null) {
      result.add(
        Marker(
          point: dp,
          width: 32,
          height: 32,
          child: Icon(
            Icons.directions_car_rounded,
            color: _markerColorOf(req.serviceType),
            size: 28,
          ),
        ),
      );
    }

    return result;
  }

  List<Polyline> _buildPolylines(Color color) {
    final points = _routePoints;
    if (points != null && points.length >= 2) {
      return [
        Polyline(points: points, color: color, strokeWidth: 5),
      ];
    }
    return [
      Polyline(
        points: [_originPoint, _destPoint],
        color: color.withValues(alpha: 0.5),
        strokeWidth: 4,
      ),
    ];
  }

  void _fitCamera(TransportRequestEntity req) {
    final pts = _routePoints ?? [_originPoint, _destPoint];
    var minLat = pts.first.latitude, maxLat = pts.first.latitude;
    var minLng = pts.first.longitude, maxLng = pts.first.longitude;
    for (final p in pts) {
      minLat = p.latitude < minLat ? p.latitude : minLat;
      maxLat = p.latitude > maxLat ? p.latitude : maxLat;
      minLng = p.longitude < minLng ? p.longitude : minLng;
      maxLng = p.longitude > maxLng ? p.longitude : maxLng;
    }
    if (!mounted) return;
    _map.fitCamera(
      CameraFit.bounds(
        bounds: LatLngBounds(
          LatLng(minLat - 0.002, minLng - 0.002),
          LatLng(maxLat + 0.002, maxLng + 0.002),
        ),
        padding: const EdgeInsets.all(60),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final request = ref.watch(transportByIdProvider(widget.requestId));

    if (request == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Solicitud no encontrada')),
      );
    }

    // Resuelve la ruta real una sola vez (geocoding + directions).
    if (!_resolveStarted) {
      _resolveStarted = true;
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _resolveRoute(request),
      );
    }

    final color = _colorOf(request.serviceType);
    final markers = _buildMarkers(request);
    final polylines = _buildPolylines(color);
    final topPad = MediaQuery.of(context).padding.top;

    return Scaffold(
      body: Stack(
        children: [
          // ── Mapa full-screen ─────────────────────────────────────────────
          FlutterMap(
            mapController: _map,
            options: MapOptions(
              initialCenter: kPamplonaCenter,
              initialZoom: 14.5,
            ),
            children: [
              TileLayer(
                urlTemplate:
                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.nexum.nexum_client',
              ),
              PolylineLayer(polylines: polylines),
              MarkerLayer(markers: markers),
            ],
          ),

          // ── Barra superior ───────────────────────────────────────────────
          Positioned(
            top: topPad + 8,
            left: 12,
            right: 12,
            child: Row(
              children: [
                _CircleBtn(
                  icon: Icons.close_rounded,
                  onTap: () => context.go(AppRoutes.home),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 9,
                    ),
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: color.withValues(alpha: 0.45),
                          blurRadius: 10,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        Icon(
                          _statusIcon(request.status),
                          size: 17,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            request.status.label,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        if (request.isActive)
                          Text(
                            '${request.etaMinutes} min',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ── Panel inferior arrastrable ───────────────────────────────────
          DraggableScrollableSheet(
            initialChildSize: 0.32,
            minChildSize: 0.18,
            maxChildSize: 0.75,
            snap: true,
            snapSizes: const [0.18, 0.32, 0.75],
            builder: (ctx, scroll) => _InfoPanel(
              scrollController: scroll,
              request: request,
              onCancel: () => ref
                  .read(transportProvider.notifier)
                  .cancelRequest(widget.requestId),
              onRate: (stars) => ref
                  .read(transportProvider.notifier)
                  .rateRequest(widget.requestId, stars),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Panel de información ──────────────────────────────────────────────────────

class _InfoPanel extends StatelessWidget {
  const _InfoPanel({
    required this.scrollController,
    required this.request,
    required this.onCancel,
    required this.onRate,
  });

  final ScrollController scrollController;
  final TransportRequestEntity request;
  final VoidCallback onCancel;
  final ValueChanged<int> onRate;

  static const _bg = Colors.white;
  static const _handle = Color(0xFFE2E8F0);

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(request.serviceType);

    return Container(
      decoration: const BoxDecoration(
        color: _bg,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 24,
            offset: Offset(0, -6),
          ),
        ],
      ),
      child: ListView(
        controller: scrollController,
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).padding.bottom + 16,
        ),
        children: [
          // Handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 10, bottom: 14),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: _handle,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Ruta (origen → destino compacto)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Column(
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: const BoxDecoration(
                        color: AppColors.pickupMarker,
                        shape: BoxShape.circle,
                      ),
                    ),
                    Container(
                      width: 2,
                      height: 22,
                      color: AppColors.outlineLight,
                    ),
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: AppColors.destinationMarker,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        request.originAddress,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        request.destinationAddress,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  CurrencyFormatter.format(request.estimatedFare),
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: color,
                  ),
                ),
              ],
            ),
          ),

          const Divider(height: 24, indent: 16, endIndent: 16),

          // Conductor (si está asignado)
          if (request.driverName != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _DriverRow(request: request),
            ),

          if (request.driverName != null)
            const Divider(height: 24, indent: 16, endIndent: 16),

          // Timeline de estados
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _StatusTimeline(request: request),
          ),

          const SizedBox(height: 8),

          // Chips de estadísticas
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: _StatChip(
                    icon: Icons.straighten_rounded,
                    value: '${request.distanceKm.toStringAsFixed(1)} km',
                    label: 'Distancia',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatChip(
                    icon: Icons.schedule_rounded,
                    value: '${request.etaMinutes} min',
                    label: 'Tiempo est.',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatChip(
                    icon: Icons.payments_outlined,
                    value: CurrencyFormatter.format(request.estimatedFare),
                    label: 'Tarifa',
                    valueColor: color,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Cancelar
          if (request.status.canCancel)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _CancelButton(onCancel: onCancel),
            ),

          // Calificar
          if (request.isCompleted && !request.isRated)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _RatingSection(onRate: onRate),
            ),

          // Calificación emitida
          if (request.isCompleted && request.isRated)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _RatingDisplay(rating: request.rating!),
            ),
        ],
      ),
    );
  }
}

// ── Driver row ────────────────────────────────────────────────────────────────

class _DriverRow extends StatelessWidget {
  const _DriverRow({required this.request});

  final TransportRequestEntity request;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 46,
          height: 46,
          decoration: const BoxDecoration(
            color: AppColors.primaryContainer,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.person_rounded,
            color: AppColors.primary,
            size: 24,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                request.driverName!,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
              if (request.driverVehicle != null)
                Text(
                  request.driverVehicle!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
            ],
          ),
        ),
        IconButton(
          style: IconButton.styleFrom(
            backgroundColor: AppColors.primaryContainer,
            foregroundColor: AppColors.primary,
          ),
          icon: const Icon(Icons.phone_rounded),
          onPressed: () {},
        ),
      ],
    );
  }
}

// ── Status timeline ───────────────────────────────────────────────────────────

class _StatusTimeline extends StatelessWidget {
  const _StatusTimeline({required this.request});

  final TransportRequestEntity request;

  static const _steps = [
    (Icons.search_rounded, 'Buscando conductor'),
    (Icons.person_pin_rounded, 'Conductor asignado'),
    (Icons.location_on_rounded, 'Conductor llegó'),
    (Icons.near_me_rounded, 'En trayecto'),
    (Icons.check_circle_rounded, 'Completado'),
  ];

  @override
  Widget build(BuildContext context) {
    final currentStep = request.status.step;
    final color = _colorOf(request.serviceType);

    return Column(
      children: [
        for (var i = 0; i < _steps.length; i++)
          _Step(
            icon: _steps[i].$1,
            label: _steps[i].$2,
            done: i < currentStep,
            active: i == currentStep && request.isActive,
            color: color,
            isLast: i == _steps.length - 1,
          ),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.icon,
    required this.label,
    required this.done,
    required this.active,
    required this.color,
    required this.isLast,
  });

  final IconData icon;
  final String label;
  final bool done;
  final bool active;
  final Color color;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final dotColor = done || active ? color : AppColors.outlineLight;
    final labelStyle = active
        ? TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 13)
        : TextStyle(
            color: done ? AppColors.textPrimary : AppColors.textTertiary,
            fontSize: 13,
          );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: dotColor.withValues(alpha: done || active ? 0.15 : 0.05),
                shape: BoxShape.circle,
                border: Border.all(color: dotColor, width: 1.5),
              ),
              child: Icon(
                done ? Icons.check_rounded : icon,
                color: dotColor,
                size: 13,
              ),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 18,
                color: done
                    ? color.withValues(alpha: 0.4)
                    : AppColors.outlineLight,
              ),
          ],
        ),
        const SizedBox(width: 12),
        Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Text(label, style: labelStyle),
        ),
      ],
    );
  }
}

// ── Stats chip ────────────────────────────────────────────────────────────────

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.icon,
    required this.value,
    required this.label,
    this.valueColor = AppColors.textPrimary,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.backgroundLight,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Icon(icon, size: 17, color: AppColors.textTertiary),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: valueColor,
            ),
            textAlign: TextAlign.center,
          ),
          Text(
            label,
            style: const TextStyle(fontSize: 10, color: AppColors.textTertiary),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

// ── Cancel button ─────────────────────────────────────────────────────────────

class _CancelButton extends StatelessWidget {
  const _CancelButton({required this.onCancel});

  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.error,
        side: const BorderSide(color: AppColors.error),
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      onPressed: () => showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('¿Cancelar solicitud?'),
          content: const Text('Esta acción no se puede deshacer.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('No'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.error),
              onPressed: () {
                Navigator.of(context).pop();
                onCancel();
              },
              child: const Text('Sí, cancelar'),
            ),
          ],
        ),
      ),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.cancel_outlined, size: 17),
          SizedBox(width: 8),
          Text(
            'Cancelar solicitud',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

// ── Rating ────────────────────────────────────────────────────────────────────

class _RatingSection extends StatefulWidget {
  const _RatingSection({required this.onRate});
  final ValueChanged<int> onRate;

  @override
  State<_RatingSection> createState() => _RatingSectionState();
}

class _RatingSectionState extends State<_RatingSection> {
  int _selected = 0;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.starContainer,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.star.withValues(alpha: 0.4)),
      ),
      child: Column(
        children: [
          const Text(
            '¿Cómo estuvo el servicio?',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final filled = i < _selected;
              return GestureDetector(
                onTap: () {
                  setState(() => _selected = i + 1);
                  widget.onRate(i + 1);
                },
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(
                    filled ? Icons.star_rounded : Icons.star_outline_rounded,
                    color: AppColors.star,
                    size: 34,
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}

class _RatingDisplay extends StatelessWidget {
  const _RatingDisplay({required this.rating});
  final int rating;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
      decoration: BoxDecoration(
        color: AppColors.starContainer,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.star.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          ...List.generate(
            5,
            (i) => Icon(
              i < rating ? Icons.star_rounded : Icons.star_outline_rounded,
              color: AppColors.star,
              size: 22,
            ),
          ),
          const SizedBox(width: 8),
          const Text(
            'Tu calificación',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

Color _markerColorOf(TransportServiceType t) => switch (t) {
  TransportServiceType.transporte => Colors.blue,
  TransportServiceType.moto => Colors.orange,
  TransportServiceType.envios => Colors.green,
};

class _CircleBtn extends StatelessWidget {
  const _CircleBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 3,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(9),
          child: Icon(icon, size: 22, color: AppColors.textPrimary),
        ),
      ),
    );
  }
}
