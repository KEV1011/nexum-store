import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/safety/presentation/widgets/sos_button.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';

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
          _StatusCard(request: request),
          const SizedBox(height: 16),
          if (request.driverName != null) ...[
            _DriverCard(request: request),
            const SizedBox(height: 16),
          ],
          _TripMap(request: request),
          const SizedBox(height: 16),
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
        border: Border.all(color: AppColors.outlineLight),
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
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
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
            const Text(
              'Por tu seguridad y la del conductor, el número real se mantiene '
              'privado. Comunícate por el chat in-app del viaje.',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
            if (request.maskedPhone != null) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  const Icon(Icons.phone_outlined,
                      size: 18, color: AppColors.textTertiary),
                  const SizedBox(width: 8),
                  Text(
                    'Referencia: ${request.maskedPhone}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textTertiary,
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

// ── Map ───────────────────────────────────────────────────────────────────────

class _TripMap extends StatelessWidget {
  const _TripMap({required this.request});

  final TransportRequestEntity request;

  static const _pamplona = LatLng(7.3762, -72.6465);

  LatLng _hashLatLng(String seed, int salt) {
    final hash = seed.hashCode ^ salt;
    final dlat = ((hash % 100) - 50) / 8000;
    final dlng = ((hash ~/ 100 % 100) - 50) / 8000;
    return LatLng(_pamplona.latitude + dlat, _pamplona.longitude + dlng);
  }

  @override
  Widget build(BuildContext context) {
    final origin = _hashLatLng(request.originAddress, 0x1A);
    final destination = _hashLatLng(request.destinationAddress, 0x2B);
    final center = LatLng(
      (origin.latitude + destination.latitude) / 2,
      (origin.longitude + destination.longitude) / 2,
    );

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        height: 200,
        child: FlutterMap(
          options: MapOptions(
            initialCenter: center,
            initialZoom: 14.5,
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.none,
            ),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.nexum.client',
            ),
            PolylineLayer(
              polylines: [
                Polyline(
                  points: [origin, destination],
                  color: AppColors.routeColor,
                  strokeWidth: 4,
                ),
              ],
            ),
            MarkerLayer(
              markers: [
                Marker(
                  point: origin,
                  width: 32,
                  height: 32,
                  child: const _MapDot(color: AppColors.pickupMarker),
                ),
                Marker(
                  point: destination,
                  width: 32,
                  height: 32,
                  child: const _MapDot(color: AppColors.destinationMarker),
                ),
                if (request.driverLat != null && request.driverLng != null)
                  Marker(
                    point: LatLng(request.driverLat!, request.driverLng!),
                    width: 38,
                    height: 38,
                    child: const _DriverDot(),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MapDot extends StatelessWidget {
  const _MapDot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2.5),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.4), blurRadius: 6)],
      ),
    );
  }
}

class _DriverDot extends StatelessWidget {
  const _DriverDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.primary,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.5),
            blurRadius: 8,
          ),
        ],
      ),
      child: const Icon(Icons.directions_car_rounded,
          color: Colors.white, size: 18),
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
        border: Border.all(color: AppColors.outlineLight),
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
    final dotColor = done || active ? color : AppColors.outlineLight;
    final labelStyle = active
        ? TextStyle(
            color: color,
            fontWeight: FontWeight.w700,
            fontSize: 13,
          )
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
                color: done ? color.withValues(alpha: 0.4) : AppColors.outlineLight,
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
        border: Border.all(color: AppColors.outlineLight),
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
          const Padding(
            padding: EdgeInsets.only(left: 12),
            child: SizedBox(
              height: 16,
              child: VerticalDivider(color: AppColors.outlineLight),
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
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textTertiary,
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
          Icon(icon, size: 18, color: AppColors.textTertiary),
          const SizedBox(width: 10),
          Text(
            '$label: ',
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textSecondary,
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
    this.valueColor = AppColors.textPrimary,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 18, color: AppColors.textTertiary),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: valueColor,
          ),
          textAlign: TextAlign.center,
        ),
        Text(
          label,
          style: const TextStyle(
              fontSize: 10, color: AppColors.textTertiary),
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
              style: const TextStyle(
                color: AppColors.textSecondary,
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
              color: AppColors.textSecondary,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}
