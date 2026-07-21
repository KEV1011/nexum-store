import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/safety/presentation/widgets/sos_button.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';
import 'package:nexum_client/core/services/geo_service.dart';
import 'package:nexum_client/features/transport/presentation/screens/trip_chat_screen.dart';
import 'package:nexum_client/shared/services/transport_ws_service.dart';
import 'package:nexum_client/shared/widgets/google_map_tiles.dart';
import 'package:nexum_client/shared/widgets/map_pin.dart';
import 'package:nexum_client/shared/widgets/vehicle_marker.dart';

// ── UI helpers ────────────────────────────────────────────────────────────────

Color _colorOf(TransportServiceType t) => switch (t) {
      TransportServiceType.transporte => AppColors.serviceParticular,
      TransportServiceType.moto => AppColors.serviceMoto,
      TransportServiceType.envios => AppColors.serviceEnvios,
    };

/// Seguimiento en vivo de un viaje o envío.
class TransportTrackingScreen extends ConsumerWidget {
  const TransportTrackingScreen({required this.requestId, super.key});

  final String requestId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final request = ref.watch(transportByIdProvider(requestId));

    if (request == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Solicitud no encontrada')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('Seguimiento ${request.requestRef}'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.go(AppRoutes.home),
        ),
        actions: [
          if (request.status.isActive)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: SosButton(
                tripId: request.id,
                lat: request.driverLat,
                lng: request.driverLng,
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _TripMap(request: request),
          const SizedBox(height: 16),
          _StatusCard(request: request),
          const SizedBox(height: 16),
          if (request.driverName != null) ...[
            _DriverCard(request: request),
            const SizedBox(height: 16),
          ],
          _StatusTimeline(request: request),
          const SizedBox(height: 16),
          _TripDetails(request: request),
          if (request.status.canCancel) ...[
            const SizedBox(height: 16),
            _CancelButton(
              onCancel: () =>
                  ref.read(transportProvider.notifier).cancelRequest(requestId),
            ),
          ],
          if (request.isCompleted && !request.isRated) ...[
            const SizedBox(height: 16),
            _RatingSection(requestId: requestId),
          ],
          if (request.isCompleted && request.isRated) ...[
            const SizedBox(height: 16),
            _RatingDisplay(rating: request.rating!),
          ],
          if (request.isCompleted && request.driverName != null) ...[
            const SizedBox(height: 16),
            _TipSection(requestId: requestId),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

// ── Status card ───────────────────────────────────────────────────────────────

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.request});

  final TransportRequestEntity request;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(request.serviceType);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color, color.withValues(alpha: 0.75)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  _statusIcon(request.status),
                  color: Colors.white,
                  size: 26,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      request.status.label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      request.serviceType.label,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.8),
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              if (request.isActive)
                _EtaBadge(eta: request.etaMinutes),
            ],
          ),
          if (request.isCompleted && request.completedAt != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.check_circle_rounded,
                      color: Colors.white, size: 16),
                  SizedBox(width: 6),
                  Text(
                    'Viaje completado exitosamente',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  IconData _statusIcon(TransportStatus status) => switch (status) {
        TransportStatus.searching => Icons.search_rounded,
        TransportStatus.accepted => Icons.person_pin_rounded,
        TransportStatus.arriving => Icons.directions_rounded,
        TransportStatus.arrived => Icons.location_on_rounded,
        TransportStatus.inProgress => Icons.near_me_rounded,
        TransportStatus.completed => Icons.check_circle_rounded,
        TransportStatus.cancelled => Icons.cancel_rounded,
      };
}

class _EtaBadge extends StatelessWidget {
  const _EtaBadge({required this.eta});

  final int eta;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          Text(
            '$eta',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const Text(
            'min',
            style: TextStyle(color: Colors.white70, fontSize: 10),
          ),
        ],
      ),
    );
  }
}

// ── Driver card ───────────────────────────────────────────────────────────────

class _DriverCard extends StatelessWidget {
  const _DriverCard({required this.request});

  final TransportRequestEntity request;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.outlineColor),
        boxShadow: const [BoxShadow(color: AppColors.shadow, blurRadius: 8)],
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: const BoxDecoration(
              color: AppColors.primaryContainer,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.person_rounded,
                color: AppColors.primary, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  request.driverName ?? '',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
                if (request.driverVehicle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    request.driverVehicle!,
                    style: TextStyle(
                      fontSize: 12,
                      color: context.textSecondaryColor,
                    ),
                  ),
                ],
              ],
            ),
          ),
          _ChatButton(
            tripId: request.id,
            peerName: request.driverName ?? 'Conductor',
          ),
          const SizedBox(width: 8),
          IconButton(
            style: IconButton.styleFrom(
              backgroundColor: AppColors.primaryContainer,
              foregroundColor: AppColors.primary,
            ),
            tooltip: 'Contacto seguro',
            icon: const Icon(Icons.shield_outlined),
            onPressed: () => _showSafeContactSheet(context),
          ),
        ],
      ),
    );
  }

  void _showSafeContactSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Icon(Icons.lock_outline_rounded,
                    color: AppColors.primary, size: 22),
                SizedBox(width: 10),
                Text(
                  'Contacto protegido',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Por tu seguridad y la del conductor, el número real se mantiene '
              'privado. Comunícate por el chat in-app del viaje.',
              style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
            ),
            if (request.maskedPhone != null) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Icon(Icons.phone_outlined,
                      size: 18, color: context.textTertiaryColor),
                  const SizedBox(width: 8),
                  Text(
                    'Referencia: ${request.maskedPhone}',
                    style: TextStyle(
                      fontSize: 13,
                      color: context.textTertiaryColor,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Map (hero) ──────────────────────────────────────────────────────────────
//
// The live map is the trust moment of the trip: a tall hero with the driver's
// pin, a pulsing "live" halo (reduce-motion aware), the route, and a floating
// status + ETA overlay.

class _TripMap extends ConsumerStatefulWidget {
  const _TripMap({required this.request});

  final TransportRequestEntity request;

  @override
  ConsumerState<_TripMap> createState() => _TripMapState();
}

class _TripMapState extends ConsumerState<_TripMap>
    with SingleTickerProviderStateMixin {
  static const _pamplona = LatLng(7.3762, -72.6465);

  late final AnimationController _pulse;

  // Rumbo del conductor (grados) para orientar el marcador del vehículo, y la
  // última posición conocida para calcularlo entre actualizaciones de GPS.
  LatLng? _prevDriver;
  double _heading = 0;

  /// Ruta REAL por las calles (Routes API vía el proxy /geo del backend);
  /// null = el proxy no tiene llave → se dibuja la línea recta de siempre.
  List<LatLng>? _route;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
    final r = widget.request;
    // Solo con coordenadas REALES del autocompletado (no el fallback por hash).
    if (r.originLat != null && r.originLng != null &&
        r.destLat != null && r.destLng != null) {
      ref
          .read(geoServiceProvider)
          .routePoints(
            originLat: r.originLat!,
            originLng: r.originLng!,
            destLat: r.destLat!,
            destLng: r.destLng!,
          )
          .then((pts) {
        if (mounted && pts != null) setState(() => _route = pts);
      });
    }
  }

  @override
  void didUpdateWidget(covariant _TripMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    final r = widget.request;
    if (r.driverLat != null && r.driverLng != null) {
      final cur = LatLng(r.driverLat!, r.driverLng!);
      if (_prevDriver != null && cur != _prevDriver) {
        setState(() => _heading = bearingBetween(_prevDriver!, cur));
      }
      _prevDriver = cur;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  LatLng _hashLatLng(String seed, int salt) {
    final hash = seed.hashCode ^ salt;
    final dlat = ((hash % 100) - 50) / 8000;
    final dlng = ((hash ~/ 100 % 100) - 50) / 8000;
    return LatLng(_pamplona.latitude + dlat, _pamplona.longitude + dlng);
  }

  @override
  Widget build(BuildContext context) {
    final request = widget.request;
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final hasDriver = request.driverLat != null && request.driverLng != null;
    final live = request.isActive && hasDriver;
    final color = _colorOf(request.serviceType);

    // Coordenadas reales del autocompletado cuando existen; si el cliente
    // escribió texto libre, se cae a una posición aproximada por hash para que
    // el mapa siga teniendo dónde dibujar los pines.
    final origin = (request.originLat != null && request.originLng != null)
        ? LatLng(request.originLat!, request.originLng!)
        : _hashLatLng(request.originAddress, 0x1A);
    final destination = (request.destLat != null && request.destLng != null)
        ? LatLng(request.destLat!, request.destLng!)
        : _hashLatLng(request.destinationAddress, 0x2B);
    final driver =
        hasDriver ? LatLng(request.driverLat!, request.driverLng!) : null;
    final center = LatLng(
      (origin.latitude + destination.latitude) / 2,
      (origin.longitude + destination.longitude) / 2,
    );

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(
        height: 290,
        child: Stack(
          children: [
            Positioned.fill(
              child: FlutterMap(
                options: MapOptions(
                  initialCenter: driver ?? center,
                  initialZoom: 14.5,
                  // Enmarca TODO el trayecto (origen · conductor · destino) para
                  // que se vea por dónde va el viaje, no un punto congelado.
                  initialCameraFit: CameraFit.coordinates(
                    coordinates: [origin, destination, if (driver != null) driver],
                    padding: const EdgeInsets.all(48),
                    maxZoom: 16,
                  ),
                  // Mapa interactivo: el cliente puede mover y hacer zoom.
                  interactionOptions: const InteractionOptions(
                    flags: InteractiveFlag.pinchZoom |
                        InteractiveFlag.drag |
                        InteractiveFlag.doubleTapZoom |
                        InteractiveFlag.flingAnimation,
                  ),
                ),
                children: [
                  const GoogleMapTiles(),
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        // Ruta real por las calles cuando el proxy tiene llave;
                        // recta (pasando por el conductor) como fallback.
                        points: _route ??
                            [origin, if (driver != null) driver, destination],
                        color: AppColors.routeColor,
                        strokeWidth: 4,
                      ),
                    ],
                  ),
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: origin,
                        width: MapPin.markerWidth,
                        height: MapPin.markerHeight,
                        alignment: Alignment.topCenter,
                        child: const MapPin(
                          color: AppColors.pickupMarker,
                          icon: Icons.trip_origin,
                        ),
                      ),
                      Marker(
                        point: destination,
                        width: MapPin.markerWidth,
                        height: MapPin.markerHeight,
                        alignment: Alignment.topCenter,
                        child: const MapPin(
                          color: AppColors.destinationMarker,
                          icon: Icons.flag_rounded,
                        ),
                      ),
                      if (driver != null)
                        Marker(
                          point: driver,
                          width: 66,
                          height: 66,
                          child: VehicleMarker(
                            headingDegrees: _heading,
                            color: color,
                            isMoto: request.serviceType ==
                                TransportServiceType.moto,
                            pulse: _pulse,
                            animate: live && !reduceMotion,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            // Floating live status + ETA overlay.
            Positioned(
              left: 12,
              top: 12,
              right: 12,
              child: _MapLiveOverlay(
                request: request,
                color: color,
                live: live,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapLiveOverlay extends StatelessWidget {
  const _MapLiveOverlay({
    required this.request,
    required this.color,
    required this.live,
  });

  final TransportRequestEntity request;
  final Color color;
  final bool live;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Flexible(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.circular(30),
              boxShadow: const [
                BoxShadow(color: AppColors.shadow, blurRadius: 10),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (live) ...[
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
                Flexible(
                  child: Text(
                    request.status.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (live) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(30),
              boxShadow: const [
                BoxShadow(color: AppColors.shadow, blurRadius: 10),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.schedule_rounded,
                    color: Colors.white, size: 14),
                const SizedBox(width: 4),
                Text(
                  '${request.etaMinutes} min',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

// ── Timeline ──────────────────────────────────────────────────────────────────

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

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.outlineColor),
        boxShadow: const [BoxShadow(color: AppColors.shadow, blurRadius: 8)],
      ),
      child: Column(
        children: [
          for (var i = 0; i < _steps.length; i++) ...[
            _TimelineStep(
              icon: _steps[i].$1,
              label: _steps[i].$2,
              done: i < currentStep,
              active: i == currentStep && request.isActive,
              color: color,
              isLast: i == _steps.length - 1,
            ),
          ],
        ],
      ),
    );
  }
}

class _TimelineStep extends StatelessWidget {
  const _TimelineStep({
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
    final dotColor = done || active ? color : context.outlineColor;
    final labelStyle = active
        ? TextStyle(
            color: color,
            fontWeight: FontWeight.w700,
            fontSize: 13,
          )
        : TextStyle(
            color: done ? context.textPrimaryColor : context.textTertiaryColor,
            fontSize: 13,
          );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: dotColor.withValues(alpha: done || active ? 0.15 : 0.05),
                shape: BoxShape.circle,
                border: Border.all(color: dotColor, width: 1.5),
              ),
              child: Icon(
                done ? Icons.check_rounded : icon,
                color: dotColor,
                size: 14,
              ),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 20,
                color: done ? color.withValues(alpha: 0.4) : context.outlineColor,
              ),
          ],
        ),
        const SizedBox(width: 12),
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(label, style: labelStyle),
        ),
      ],
    );
  }
}

// ── Trip details ──────────────────────────────────────────────────────────────

class _TripDetails extends StatelessWidget {
  const _TripDetails({required this.request});

  final TransportRequestEntity request;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(request.serviceType);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.outlineColor),
        boxShadow: const [BoxShadow(color: AppColors.shadow, blurRadius: 8)],
      ),
      child: Column(
        children: [
          _RouteRow(
            icon: Icons.radio_button_checked_rounded,
            color: AppColors.pickupMarker,
            label: 'Origen',
            address: request.originAddress,
          ),
          Padding(
            padding: EdgeInsets.only(left: 12),
            child: SizedBox(
              height: 16,
              child: VerticalDivider(color: context.outlineColor),
            ),
          ),
          _RouteRow(
            icon: Icons.location_on_rounded,
            color: AppColors.destinationMarker,
            label: 'Destino',
            address: request.destinationAddress,
          ),
          const Divider(height: 24),
          if (request.serviceType == TransportServiceType.envios &&
              request.recipientName != null) ...[
            _DetailRow(
              icon: Icons.person_outline_rounded,
              label: 'Destinatario',
              value: request.recipientName!,
            ),
            if (request.recipientPhone != null)
              _DetailRow(
                icon: Icons.phone_outlined,
                label: 'Teléfono',
                value: request.recipientPhone!,
              ),
            if (request.packageDescription != null)
              _DetailRow(
                icon: Icons.inventory_2_outlined,
                label: 'Paquete',
                value: request.packageDescription!,
              ),
            const Divider(height: 24),
          ],
          Row(
            children: [
              Expanded(
                child: _StatChip(
                  icon: Icons.straighten_rounded,
                  value: '${request.distanceKm.toStringAsFixed(1)} km',
                  label: 'Distancia',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatChip(
                  icon: Icons.schedule_rounded,
                  value: '${request.etaMinutes} min',
                  label: 'Tiempo est.',
                ),
              ),
              const SizedBox(width: 12),
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
        ],
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
    return Row(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  color: context.textTertiaryColor,
                ),
              ),
              Text(
                address,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: context.textTertiaryColor),
          const SizedBox(width: 10),
          Text(
            '$label: ',
            style: TextStyle(
              fontSize: 13,
              color: context.textSecondaryColor,
            ),
          ),
          Expanded(
            child: Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.icon,
    required this.value,
    required this.label,
    this.valueColor,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 18, color: context.textTertiaryColor),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: valueColor ?? context.textPrimaryColor,
          ),
          textAlign: TextAlign.center,
        ),
        Text(
          label,
          style: TextStyle(
              fontSize: 10, color: context.textTertiaryColor),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

// ── Cancel ────────────────────────────────────────────────────────────────────

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
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      onPressed: () {
        showDialog<void>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('¿Cancelar solicitud?'),
            content:
                const Text('Esta acción no se puede deshacer.'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('No'),
              ),
              FilledButton(
                style:
                    FilledButton.styleFrom(backgroundColor: AppColors.error),
                onPressed: () {
                  Navigator.of(context).pop();
                  onCancel();
                },
                child: const Text('Sí, cancelar'),
              ),
            ],
          ),
        );
      },
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.cancel_outlined, size: 18),
          SizedBox(width: 8),
          Text('Cancelar solicitud',
              style: TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// ── Rating ────────────────────────────────────────────────────────────────────

class _RatingSection extends ConsumerStatefulWidget {
  const _RatingSection({required this.requestId});

  final String requestId;

  @override
  ConsumerState<_RatingSection> createState() => _RatingSectionState();
}

class _RatingSectionState extends ConsumerState<_RatingSection> {
  int _hovered = 0;
  int _selected = 0;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.starContainer,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.star.withValues(alpha: 0.4)),
      ),
      child: Column(
        children: [
          const Text(
            '¿Cómo estuvo el servicio?',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final filled = i < (_hovered > 0 ? _hovered : _selected);
              return GestureDetector(
                onTap: () {
                  setState(() => _selected = i + 1);
                  ref.read(transportProvider.notifier).rateRequest(
                        widget.requestId,
                        i + 1,
                      );
                },
                onLongPressStart: (_) => setState(() => _hovered = i + 1),
                onLongPressEnd: (_) => setState(() => _hovered = 0),
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(
                    filled ? Icons.star_rounded : Icons.star_outline_rounded,
                    color: AppColors.star,
                    size: 36,
                  ),
                ),
              );
            }),
          ),
          if (_selected > 0) ...[
            const SizedBox(height: 8),
            Text(
              _ratingLabel(_selected),
              style: TextStyle(
                color: context.textSecondaryColor,
                fontSize: 13,
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _ratingLabel(int stars) => switch (stars) {
        1 => 'Muy malo',
        2 => 'Malo',
        3 => 'Regular',
        4 => 'Bueno',
        5 => '¡Excelente!',
        _ => '',
      };
}

// ── Propina ──────────────────────────────────────────────────────────────────

class _TipSection extends ConsumerStatefulWidget {
  const _TipSection({required this.requestId});

  final String requestId;

  @override
  ConsumerState<_TipSection> createState() => _TipSectionState();
}

class _TipSectionState extends ConsumerState<_TipSection> {
  static const _amounts = [2000.0, 5000.0, 10000.0];
  bool _loading = false;
  bool _sent = false;

  Future<void> _tip(double amount) async {
    setState(() => _loading = true);
    final url =
        await ref.read(transportProvider.notifier).tipTrip(widget.requestId, amount);
    if (!mounted) return;
    setState(() => _loading = false);
    if (url == null) {
      AppSnackbar.showError(
        context,
        'No se pudo iniciar la propina. Intenta de nuevo.',
      );
      return;
    }
    final opened =
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!mounted) return;
    setState(() => _sent = true);
    AppSnackbar.showInfo(
      context,
      opened
          ? 'Completa el pago de tu propina en Wompi. ¡Gracias por apoyar al conductor!'
          : 'No se pudo abrir el pago de la propina.',
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_sent) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.primaryContainer,
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Row(
          children: [
            Icon(Icons.volunteer_activism_rounded,
                color: AppColors.primary, size: 20),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                '¡Gracias! Tu propina va 100% al conductor.',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.outlineColor),
        boxShadow: const [BoxShadow(color: AppColors.shadow, blurRadius: 8)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.volunteer_activism_rounded,
                  color: AppColors.primary, size: 20),
              SizedBox(width: 8),
              Text('Dejar propina',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'El 100% va para tu conductor.',
            style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(8),
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                ),
              ),
            )
          else
            Row(
              children: [
                for (final a in _amounts) ...[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _tip(a),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primary,
                        side: const BorderSide(color: AppColors.primary),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(
                        CurrencyFormatter.format(a),
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13),
                      ),
                    ),
                  ),
                  if (a != _amounts.last) const SizedBox(width: 8),
                ],
              ],
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
          Text(
            'Tu calificación',
            style: TextStyle(
              color: context.textSecondaryColor,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

/// Botón de chat con badge de mensajes sin leer. Avisa (badge + snackbar) cuando
/// el conductor escribe y el chat no está abierto — así el cliente sabe que le
/// escribieron aunque esté en la pantalla de seguimiento.
class _ChatButton extends StatefulWidget {
  const _ChatButton({required this.tripId, required this.peerName});

  final String tripId;
  final String peerName;

  @override
  State<_ChatButton> createState() => _ChatButtonState();
}

class _ChatButtonState extends State<_ChatButton> {
  StreamSubscription<TripChatEvent>? _sub;
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _sub = TransportWsService().tripChatEvents.listen((event) {
      if (!mounted) return;
      final msg = event.message;
      if (msg == null) return;
      if (event.tripId != null && event.tripId != widget.tripId) return;
      // Solo mensajes del conductor (no los propios del pasajero). El backend
      // marca los del pasajero con senderRole 'client'.
      if ((msg['senderRole'] as String?) == 'client') return;
      setState(() => _unread++);
      AppSnackbar.showInfo(context, 'Nuevo mensaje de ${widget.peerName}');
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Badge(
      isLabelVisible: _unread > 0,
      label: Text('$_unread'),
      child: IconButton(
        style: IconButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
        ),
        tooltip: 'Chat con el conductor',
        icon: const Icon(Icons.chat_bubble_outline_rounded),
        onPressed: () {
          setState(() => _unread = 0);
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => TripChatScreen(
                tripId: widget.tripId,
                peerName: widget.peerName,
              ),
            ),
          );
        },
      ),
    );
  }
}
