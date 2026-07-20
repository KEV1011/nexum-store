import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:nexum_client/core/services/geo_service.dart';
import 'package:nexum_client/shared/widgets/vehicle_marker.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart';
import 'package:nexum_client/features/intercity/presentation/providers/intercity_provider.dart';
import 'package:nexum_client/shared/widgets/google_map_tiles.dart';

const _kInterColor = AppColors.intercityBrand;

class IntercityStatusScreen extends ConsumerWidget {
  const IntercityStatusScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(intercityProvider);
    final request = state.active;

    if (request == null) {
      // Si el viaje acaba de completarse va al historial, donde el
      // pasajero puede calificarlo; si fue cancelado, vuelve al inicio.
      final justCompleted =
          state.past.isNotEmpty && state.past.first.isCompleted;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) {
          context.go(justCompleted ? '/intercity/history' : '/home');
        }
      });
      return const Scaffold(
        backgroundColor: AppColors.intercityBg,
        body: Center(
          child: CircularProgressIndicator(color: _kInterColor),
        ),
      );
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (_, __) => _showCancelDialog(context, ref),
      child: Scaffold(
        backgroundColor: AppColors.intercityBg,
        appBar: AppBar(
          backgroundColor: AppColors.intercityBg,
          foregroundColor: Colors.white,
          title: const Text(
            'Estado del viaje',
            style: TextStyle(fontWeight: FontWeight.w700, color: Colors.white),
          ),
          centerTitle: false,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: () => _showCancelDialog(context, ref),
          ),
          actions: [
            if (request.status.canCancel)
              TextButton(
                onPressed: () => _showCancelDialog(context, ref),
                child: const Text(
                  'Cancelar',
                  style: TextStyle(color: AppColors.error),
                ),
              ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ── Status header ──────────────────────────────────────────────
            _StatusHeader(request: request),
            const SizedBox(height: 16),

            // ── Alternativa mientras busca: salidas programadas (Cupos) ─────
            // El emparejamiento on-demand depende de que haya un conductor
            // intermunicipal en línea cerca del origen. Si tarda, el pasajero
            // NO queda atrapado: puede reservar un cupo en una salida ya
            // publicada por una empresa (no requiere conductor on-demand).
            if (request.status == IntercityStatus.searching) ...[
              const _SearchingHelpCard(),
              const SizedBox(height: 12),
            ],

            // ── Route summary ──────────────────────────────────────────────
            _RouteSummaryCard(request: request),
            const SizedBox(height: 12),

            // ── Driver offer (when found) ──────────────────────────────────
            if (request.status == IntercityStatus.driverFound)
              _DriverOfferCard(
                request: request,
                onAccept: () {
                  HapticFeedback.mediumImpact();
                  ref.read(intercityProvider.notifier).confirmDriver();
                },
                onReject: () {
                  HapticFeedback.selectionClick();
                  ref.read(intercityProvider.notifier).rejectCounterOffer();
                },
              ),

            // ── Driver confirmed ───────────────────────────────────────────
            if (request.status == IntercityStatus.confirmed &&
                request.hasDriver)
              _DriverConfirmedCard(request: request),

            // ── Mapa EN VIVO (paridad con el viaje urbano): conductor
            // moviéndose sobre la ruta origen→destino ──────────────────────
            if (request.status == IntercityStatus.confirmed ||
                request.status == IntercityStatus.inProgress) ...[
              const SizedBox(height: 12),
              _LiveTripMap(request: request),
            ],

            const SizedBox(height: 12),

            // ── Trip details ───────────────────────────────────────────────
            _TripDetailsCard(request: request),

            const SizedBox(height: 24),

            // ── Safety tip ────────────────────────────────────────────────
            _SafetyBanner(),
          ],
        ),
      ),
    );
  }

  Future<void> _showCancelDialog(BuildContext context, WidgetRef ref) async {
    final request = ref.read(intercityProvider).active;
    if (request == null || !request.status.canCancel) {
      context.go('/home');
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.intercitySurface,
        title: const Text('¿Cancelar el viaje?',
            style: TextStyle(color: Colors.white)),
        content: const Text(
          'Se cancelará la búsqueda de conductor.',
          style: TextStyle(color: AppColors.intercityTextDim),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Mantener',
                style: TextStyle(color: AppColors.intercityAccent)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Cancelar viaje',
                style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (confirmed == true && context.mounted) {
      ref.read(intercityProvider.notifier).cancelRequest();
      context.go('/home');
    }
  }
}

// ── Ayuda durante la búsqueda: salidas programadas ────────────────────────────

class _SearchingHelpCard extends StatelessWidget {
  const _SearchingHelpCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.event_seat_rounded,
                  color: _kInterColor, size: 20),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  '¿Prefieres no esperar?',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Estamos avisando a los conductores de la zona. Mientras tanto, '
            'puedes reservar un cupo en una salida ya programada por una '
            'empresa de transporte.',
            style: TextStyle(
              color: AppColors.intercityTextDim,
              fontSize: 12,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => context.push('/pooled/search'),
              icon: const Icon(Icons.directions_bus_rounded, size: 18),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: BorderSide(color: Colors.white.withValues(alpha: 0.3)),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              label: const Text(
                'Ver salidas programadas',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Status header ─────────────────────────────────────────────────────────────

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({required this.request});
  final IntercityRequestEntity request;

  @override
  Widget build(BuildContext context) {
    final status = request.status;
    final isSearching = status == IntercityStatus.searching;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: status.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: status.color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          if (isSearching)
            SizedBox(
              width: 36,
              height: 36,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                color: status.color,
              ),
            )
          else
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: status.color.withValues(alpha: 0.2),
                shape: BoxShape.circle,
              ),
              child: Icon(
                _iconForStatus(status),
                color: status.color,
                size: 22,
              ),
            ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  status.label,
                  style: TextStyle(
                    color: status.color,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
                Text(
                  _subtitleForStatus(status, request),
                  style: const TextStyle(
                    color: AppColors.intercityTextDim,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  IconData _iconForStatus(IntercityStatus s) => switch (s) {
        IntercityStatus.driverFound => Icons.person_pin_rounded,
        IntercityStatus.confirmed => Icons.check_circle_rounded,
        IntercityStatus.inProgress => Icons.directions_car_rounded,
        IntercityStatus.completed => Icons.flag_rounded,
        IntercityStatus.cancelled => Icons.cancel_rounded,
        _ => Icons.search_rounded,
      };

  String _subtitleForStatus(
      IntercityStatus s, IntercityRequestEntity r) =>
      switch (s) {
        IntercityStatus.searching =>
          'Enviando solicitud a conductores disponibles...',
        IntercityStatus.driverFound =>
          'Revisa la oferta del conductor y confirma',
        IntercityStatus.confirmed =>
          '${r.driverName ?? 'Conductor'} te recogerá a la hora acordada',
        IntercityStatus.inProgress => 'En camino hacia el destino',
        IntercityStatus.completed => 'Viaje finalizado · ¡Buen viaje!',
        IntercityStatus.cancelled => 'Solicitud cancelada',
      };
}

// ── Route summary ─────────────────────────────────────────────────────────────

class _RouteSummaryCard extends StatelessWidget {
  const _RouteSummaryCard({required this.request});
  final IntercityRequestEntity request;

  @override
  Widget build(BuildContext context) {
    final route =
        IntercityRoute.between(request.origin, request.destination);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.intercitySurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.intercityOutline),
      ),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.radio_button_checked_rounded,
                  size: 18, color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      request.origin.displayName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    Text(
                      request.origin.department,
                      style: const TextStyle(
                          color: AppColors.intercityTextMuted, fontSize: 11),
                    ),
                  ],
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(left: 9, top: 2, bottom: 2),
            child: Container(
              width: 1,
              height: 20,
              color: AppColors.intercityOutline,
            ),
          ),
          Row(
            children: [
              const Icon(Icons.location_on_rounded,
                  size: 18, color: AppColors.error),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      request.destination.displayName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    Text(
                      request.destination.department,
                      style: const TextStyle(
                          color: AppColors.intercityTextMuted, fontSize: 11),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (route != null) ...[
            const SizedBox(height: 12),
            const Divider(color: AppColors.intercityOutline, height: 1),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _InfoChip(
                  icon: Icons.straighten_rounded,
                  label: '${route.distanceKm.toInt()} km',
                ),
                _InfoChip(
                  icon: Icons.access_time_rounded,
                  label: route.durationLabel,
                ),
                _InfoChip(
                  icon: Icons.people_alt_rounded,
                  label: request.seats.label,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ── Driver offer card ─────────────────────────────────────────────────────────

class _DriverOfferCard extends StatelessWidget {
  const _DriverOfferCard({
    required this.request,
    required this.onAccept,
    required this.onReject,
  });

  final IntercityRequestEntity request;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final isCounterOffer =
        request.counterFare != null &&
        request.counterFare != request.offeredFare;
    final finalFare = request.counterFare ?? request.offeredFare;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.intercitySurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.info.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: _kInterColor.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.person_rounded,
                    color: AppColors.intercityAccent, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      request.driverName ?? 'Conductor',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    Text(
                      request.driverVehicle ?? '',
                      style: const TextStyle(
                          color: AppColors.intercityTextDim, fontSize: 12),
                    ),
                  ],
                ),
              ),
              if (request.driverRating != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.starContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.star_rounded,
                          size: 13, color: AppColors.star),
                      const SizedBox(width: 3),
                      Text(
                        request.driverRating!.toStringAsFixed(1),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.starText,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.intercityBg,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isCounterOffer ? 'Tu oferta' : 'Precio acordado',
                        style: const TextStyle(
                            color: AppColors.intercityTextMuted, fontSize: 11),
                      ),
                      Text(
                        CurrencyFormatter.format(request.offeredFare),
                        style: TextStyle(
                          color: isCounterOffer
                              ? AppColors.intercityTextMuted
                              : AppColors.primary,
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                          decoration: isCounterOffer
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isCounterOffer) ...[
                  const Icon(Icons.arrow_forward_rounded,
                      color: AppColors.intercityOutline, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Contraoferta',
                          style: TextStyle(
                              color: AppColors.intercityTextMuted, fontSize: 11),
                        ),
                        Text(
                          CurrencyFormatter.format(finalFare),
                          style: const TextStyle(
                            color: AppColors.warning,
                            fontWeight: FontWeight.w800,
                            fontSize: 18,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: onReject,
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppColors.intercityOutline),
                    foregroundColor: AppColors.intercityTextDim,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: Text(
                    isCounterOffer ? 'Rechazar' : 'Esperar otro',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: onAccept,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _kInterColor,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: Text(
                    isCounterOffer
                        ? 'Aceptar ${CurrencyFormatter.format(finalFare)}'
                        : 'Confirmar viaje',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Driver confirmed card ─────────────────────────────────────────────────────

class _DriverConfirmedCard extends StatelessWidget {
  const _DriverConfirmedCard({required this.request});
  final IntercityRequestEntity request;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.intercitySurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check_rounded,
                    color: AppColors.primary, size: 26),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      request.driverName ?? 'Conductor',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    Text(
                      request.driverVehicle ?? '',
                      style: const TextStyle(
                          color: AppColors.intercityTextDim, fontSize: 12),
                    ),
                  ],
                ),
              ),
              if (request.driverPhone != null)
                GestureDetector(
                  onTap: () {},
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.phone_rounded,
                        color: AppColors.primary, size: 20),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                const Icon(Icons.payments_outlined,
                    color: AppColors.primary, size: 18),
                const SizedBox(width: 8),
                Text(
                  'Total acordado: ${CurrencyFormatter.format(request.offeredFare)}',
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
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

// ── Trip details card ─────────────────────────────────────────────────────────

class _TripDetailsCard extends StatelessWidget {
  const _TripDetailsCard({required this.request});
  final IntercityRequestEntity request;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.intercitySurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.intercityOutline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'DETALLES DEL VIAJE',
            style: TextStyle(
              color: AppColors.intercityTextMuted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 12),
          _DetailRow(
            icon: Icons.calendar_month_rounded,
            label: 'Salida',
            value: _formatDateTime(request.departureTime),
          ),
          _DetailRow(
            icon: Icons.people_alt_rounded,
            label: 'Cupos',
            value: request.seats.label,
          ),
          _DetailRow(
            icon: Icons.payments_outlined,
            label: 'Oferta enviada',
            value: CurrencyFormatter.format(request.offeredFare),
          ),
          if (request.pickupAddress != null)
            _DetailRow(
              icon: Icons.my_location_rounded,
              label: 'Recogida',
              value: request.pickupAddress!,
            ),
          if (request.dropoffAddress != null)
            _DetailRow(
              icon: Icons.flag_rounded,
              label: 'Bajada',
              value: request.dropoffAddress!,
            ),
          if (request.notes != null)
            _DetailRow(
              icon: Icons.notes_rounded,
              label: 'Notas',
              value: request.notes!,
            ),
        ],
      ),
    );
  }

  String _formatDateTime(DateTime dt) {
    const months = [
      'ene', 'feb', 'mar', 'abr', 'may', 'jun',
      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
    ];
    final hour = dt.hour.toString().padLeft(2, '0');
    final min = dt.minute.toString().padLeft(2, '0');
    return '${dt.day} ${months[dt.month - 1]} · $hour:$min';
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
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: AppColors.intercityTextMuted),
          const SizedBox(width: 10),
          SizedBox(
            width: 72,
            child: Text(
              label,
              style: const TextStyle(
                  color: AppColors.intercityTextMuted, fontSize: 12),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: AppColors.intercityTextSoft,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Safety banner ─────────────────────────────────────────────────────────────

class _SafetyBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border:
            Border.all(color: AppColors.warning.withValues(alpha: 0.25)),
      ),
      child: const Row(
        children: [
          Icon(Icons.shield_rounded, size: 18, color: AppColors.warning),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Comparte el viaje con alguien de confianza. '
              'ZIPA registra la ruta y los datos del conductor.',
              style: TextStyle(color: AppColors.warning, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: AppColors.intercityTextMuted),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(
            color: AppColors.intercityTextSoft,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

// ── Mapa en vivo del viaje intermunicipal ─────────────────────────────────────

/// Paridad con el seguimiento urbano: mapa con la ruta origen→destino y el
/// vehículo del conductor moviéndose (posición del heartbeat GPS, refrescada
/// por el sondeo del provider cada 8 s).
class _LiveTripMap extends ConsumerStatefulWidget {
  const _LiveTripMap({required this.request});
  final IntercityRequestEntity request;

  @override
  ConsumerState<_LiveTripMap> createState() => _LiveTripMapState();
}

class _LiveTripMapState extends ConsumerState<_LiveTripMap>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  LatLng? _prevDriver;
  double _heading = 0;

  /// Ruta REAL por carretera entre las dos ciudades (Routes API vía proxy);
  /// null = fallback a la línea recta.
  List<LatLng>? _route;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
    final o = IntercityRoute.coordsOf(widget.request.origin);
    final d = IntercityRoute.coordsOf(widget.request.destination);
    ref
        .read(geoServiceProvider)
        .routePoints(
          originLat: o.lat,
          originLng: o.lng,
          destLat: d.lat,
          destLng: d.lng,
        )
        .then((pts) {
      if (mounted && pts != null) setState(() => _route = pts);
    });
  }

  @override
  void didUpdateWidget(covariant _LiveTripMap oldWidget) {
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

  @override
  Widget build(BuildContext context) {
    final r = widget.request;
    final o = IntercityRoute.coordsOf(r.origin);
    final d = IntercityRoute.coordsOf(r.destination);
    final origin = LatLng(o.lat, o.lng);
    final destination = LatLng(d.lat, d.lng);
    final driver = (r.driverLat != null && r.driverLng != null)
        ? LatLng(r.driverLat!, r.driverLng!)
        : null;
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        height: 230,
        child: Stack(
          children: [
            Positioned.fill(
              child: FlutterMap(
                options: MapOptions(
                  initialCenter: driver ??
                      LatLng(
                        (origin.latitude + destination.latitude) / 2,
                        (origin.longitude + destination.longitude) / 2,
                      ),
                  initialZoom: driver != null ? 12.5 : 8.6,
                  interactionOptions: const InteractionOptions(
                    flags: InteractiveFlag.none,
                  ),
                ),
                children: [
                  const GoogleMapTiles(),
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        // Carretera real entre municipios cuando hay llave;
                        // recta como fallback.
                        points: _route ??
                            [origin, if (driver != null) driver, destination],
                        color: _kInterColor,
                        strokeWidth: 4,
                      ),
                    ],
                  ),
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: origin,
                        width: 26,
                        height: 26,
                        child: const Icon(Icons.trip_origin_rounded,
                            color: AppColors.primary, size: 22),
                      ),
                      Marker(
                        point: destination,
                        width: 26,
                        height: 26,
                        child: const Icon(Icons.location_on_rounded,
                            color: AppColors.error, size: 24),
                      ),
                      if (driver != null)
                        Marker(
                          point: driver,
                          width: 60,
                          height: 60,
                          child: VehicleMarker(
                            headingDegrees: _heading,
                            color: _kInterColor,
                            isMoto: false,
                            pulse: _pulse,
                            animate: !reduceMotion,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            // Chip de estado en vivo.
            Positioned(
              left: 10,
              top: 10,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.intercitySurface,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: driver != null
                            ? const Color(0xFF22C55E)
                            : AppColors.warning,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      driver != null
                          ? 'Conductor en vivo'
                          : 'Esperando señal GPS…',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
