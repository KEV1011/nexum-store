import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/delivery_details.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/errand_details.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/features/trip_requests/presentation/providers/trip_requests_provider.dart';
import 'package:nexum_driver/features/trip_requests/presentation/widgets/countdown_ring.dart';
import 'package:nexum_driver/features/trip_requests/presentation/widgets/passenger_info_card.dart';

/// Bottom sheet modal que aparece cuando llega una solicitud de viaje.
///
/// No es descartable por swipe (el conductor DEBE tocar un botón o esperar
/// a que expire el countdown). Utiliza [DraggableScrollableSheet] con
/// `initialChildSize: 0.6` para mostrar el contenido cómodo en pantalla.
///
/// Estructura:
///  - Handle bar
///  - Header "Nueva solicitud" + CountdownRing
///  - PassengerInfoCard
///  - Divider
///  - Origen y destino del viaje
///  - Fila de stats (distancia, duración, tarifa)
///  - Botones RECHAZAR / ACEPTAR
void showTripRequestBottomSheet({
  required BuildContext context,
  required TripRequestEntity request,
  required int secondsRemaining,
}) {
  showModalBottomSheet<void>(
    context: context,
    isDismissible: false,
    enableDrag: false,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _TripRequestBottomSheet(
      request: request,
      secondsRemaining: secondsRemaining,
    ),
  );
}

// ── _TripRequestBottomSheet ───────────────────────────────────────────────────

class _TripRequestBottomSheet extends ConsumerWidget {
  const _TripRequestBottomSheet({
    required this.request,
    required this.secondsRemaining,
  });

  final TripRequestEntity request;
  final int secondsRemaining;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Escucha cambios del countdown para mantener el ring sincronizado.
    final tripState = ref.watch(tripRequestProvider);
    final currentSeconds = switch (tripState) {
      TripRequestIncoming(:final secondsRemaining) => secondsRemaining,
      _ => 0,
    };

    // Cuando la solicitud ya no está en curso (aceptada, rechazada, idle)
    // cerramos el bottom sheet.
    ref.listen<TripRequestState>(tripRequestProvider, (previous, next) {
      if (next is! TripRequestIncoming) {
        if (context.mounted) {
          Navigator.of(context).pop();
        }
      }
    });

    // El encabezado y las etiquetas se adaptan al tipo de solicitud:
    // viaje de pasajero, domicilio/envío (delivery) o mandado (errand).
    final delivery = request.delivery;
    final errand = request.errand;
    final headerTitle = delivery != null
        ? 'Nueva solicitud · ${delivery.kind.label}'
        : errand != null
            ? 'Nuevo mandado'
            : 'Nueva solicitud de viaje';
    final destinationLabel =
        delivery != null ? '${delivery.kind.dropoffLabel}:' : 'Destino:';

    return DraggableScrollableSheet(
      initialChildSize: 0.62,
      minChildSize: 0.62,
      maxChildSize: 0.85,
      expand: false,
      builder: (_, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── Handle bar ───────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.only(top: 12, bottom: 4),
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.divider,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // ── Scrollable content ───────────────────────────────────────
              Expanded(
                child: SingleChildScrollView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // ── Header ────────────────────────────────────────────
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  headerTitle,
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'A ${request.etaToPickupMinutes} min de ti · '
                                  '${request.distanceToPickupKm.toStringAsFixed(1)} km',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          CountdownRing(
                            secondsRemaining: currentSeconds,
                            size: 64,
                          ),
                        ],
                      ),

                      const SizedBox(height: 16),

                      // ── Passenger info ────────────────────────────────────
                      PassengerInfoCard(passenger: request.passenger),

                      // ── Detalle de entrega o mandado ─────────────────────
                      if (delivery != null) ...[
                        const SizedBox(height: 12),
                        _DeliveryDetailsCard(delivery: delivery),
                      ] else if (errand != null) ...[
                        const SizedBox(height: 12),
                        _ErrandDetailsCard(errand: errand),
                      ],

                      const SizedBox(height: 16),
                      const Divider(color: AppColors.divider, height: 1),
                      const SizedBox(height: 16),

                      // ── Origin ────────────────────────────────────────────
                      _LocationRow(
                        dotColor: AppColors.pickupMarker,
                        label: 'Recoger en:',
                        address: request.origin.address,
                        reference: request.origin.reference,
                      ),

                      const SizedBox(height: 12),

                      // ── Destination ───────────────────────────────────────
                      _LocationRow(
                        dotColor: AppColors.destinationMarker,
                        label: destinationLabel,
                        address: request.destination.address,
                        reference: request.destination.reference,
                      ),

                      const SizedBox(height: 16),
                      const Divider(color: AppColors.divider, height: 1),
                      const SizedBox(height: 16),

                      // ── Fare hero + secondary stats ───────────────────────
                      Container(
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: AppColors.primary.withValues(alpha: 0.18),
                          ),
                        ),
                        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                        child: Column(
                          children: [
                            Text(
                              CurrencyFormatter.format(request.estimatedFare),
                              style: const TextStyle(
                                fontSize: 30,
                                fontWeight: FontWeight.w800,
                                color: AppColors.primary,
                                letterSpacing: -0.5,
                              ),
                            ),
                            const Text(
                              'tarifa estimada',
                              style: TextStyle(
                                fontSize: 11,
                                color: AppColors.textSecondary,
                                letterSpacing: 0.3,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: Center(
                                    child: _TripStat(
                                      icon: Icons.straighten_rounded,
                                      value:
                                          '${request.distanceKm.toStringAsFixed(1)} km',
                                      label: 'Distancia',
                                    ),
                                  ),
                                ),
                                Container(
                                  width: 1,
                                  height: 36,
                                  color: AppColors.primary
                                      .withValues(alpha: 0.15),
                                ),
                                Expanded(
                                  child: Center(
                                    child: _TripStat(
                                      icon: Icons.schedule_rounded,
                                      value: '${request.durationMinutes} min',
                                      label: 'Duración',
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),

              // ── Action buttons ────────────────────────────────────────────
              _ActionButtons(request: request),
            ],
          ),
        );
      },
    );
  }
}

// ── _LocationRow ──────────────────────────────────────────────────────────────

class _LocationRow extends StatelessWidget {
  const _LocationRow({
    required this.dotColor,
    required this.label,
    required this.address,
    this.reference,
  });

  final Color dotColor;
  final String label;
  final String address;
  final String? reference;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Dot indicador de tipo de punto
        Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              color: dotColor,
              shape: BoxShape.circle,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                address,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
              if (reference != null) ...[
                const SizedBox(height: 2),
                Text(
                  reference!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// ── _DeliveryDetailsCard ────────────────────────────────────────────────────

/// Tarjeta con el detalle de un pedido (domicilio) o paquete (envío):
/// qué se transporta, el destinatario y notas del cliente.
class _DeliveryDetailsCard extends StatelessWidget {
  const _DeliveryDetailsCard({required this.delivery});

  final DeliveryDetails delivery;

  @override
  Widget build(BuildContext context) {
    final color = delivery.kind.color;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(delivery.kind.icon, size: 18, color: color),
              const SizedBox(width: 8),
              Text(
                delivery.kind.label.toUpperCase(),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.6,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            delivery.title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            delivery.itemDescription,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textSecondary,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 10),
          _DetailLine(
            icon: Icons.person_rounded,
            text: delivery.recipientName,
          ),
          const SizedBox(height: 4),
          _DetailLine(
            icon: Icons.phone_rounded,
            text: delivery.recipientPhone,
          ),
          if (delivery.hasNotes) ...[
            const SizedBox(height: 4),
            _DetailLine(
              icon: Icons.sticky_note_2_rounded,
              text: delivery.notes!,
            ),
          ],
        ],
      ),
    );
  }
}

// ── _ErrandDetailsCard ──────────────────────────────────────────────────────

/// Tarjeta con el detalle de un mandado: categoría, descripción de la tarea,
/// presupuesto autorizado para compras y notas del cliente.
class _ErrandDetailsCard extends StatelessWidget {
  const _ErrandDetailsCard({required this.errand});

  final ErrandDetails errand;

  @override
  Widget build(BuildContext context) {
    final color = errand.category.color;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(errand.category.icon, size: 18, color: color),
              const SizedBox(width: 8),
              Text(
                'MANDADO · ${errand.category.label.toUpperCase()}',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.6,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            errand.description,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textPrimary,
              height: 1.35,
            ),
          ),
          if (errand.hasBudget) ...[
            const SizedBox(height: 10),
            _DetailLine(
              icon: Icons.account_balance_wallet_rounded,
              text:
                  'Presupuesto: ${CurrencyFormatter.format(errand.purchaseBudget!)}',
            ),
          ],
          if (errand.notes != null && errand.notes!.trim().isNotEmpty) ...[
            const SizedBox(height: 4),
            _DetailLine(
              icon: Icons.sticky_note_2_rounded,
              text: errand.notes!,
            ),
          ],
        ],
      ),
    );
  }
}

// ── _DetailLine ─────────────────────────────────────────────────────────────

class _DetailLine extends StatelessWidget {
  const _DetailLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 15, color: AppColors.textSecondary),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w500,
              height: 1.25,
            ),
          ),
        ),
      ],
    );
  }
}

// ── _TripStat ─────────────────────────────────────────────────────────────────

class _TripStat extends StatelessWidget {
  const _TripStat({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 20, color: AppColors.textSecondary),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: AppColors.textSecondary,
          ),
        ),
      ],
    );
  }
}

// ── _ActionButtons ────────────────────────────────────────────────────────────

class _ActionButtons extends ConsumerStatefulWidget {
  const _ActionButtons({required this.request});

  final TripRequestEntity request;

  @override
  ConsumerState<_ActionButtons> createState() => _ActionButtonsState();
}

class _ActionButtonsState extends ConsumerState<_ActionButtons> {
  bool _isAccepting = false;
  bool _isRejecting = false;

  Future<void> _onAccept() async {
    if (_isAccepting || _isRejecting) return;
    setState(() => _isAccepting = true);

    // Vibración de confirmación
    await HapticFeedback.mediumImpact();

    await ref.read(tripRequestProvider.notifier).acceptTrip(widget.request);

    if (mounted) setState(() => _isAccepting = false);
  }

  Future<void> _onReject() async {
    if (_isAccepting || _isRejecting) return;
    setState(() => _isRejecting = true);

    await HapticFeedback.lightImpact();

    await ref.read(tripRequestProvider.notifier).rejectTrip(widget.request);

    if (mounted) setState(() => _isRejecting = false);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.divider)),
      ),
      child: Row(
        children: [
          // ── RECHAZAR ─────────────────────────────────────────────────────
          Expanded(
            child: SizedBox(
              height: 52,
              child: OutlinedButton.icon(
                onPressed:
                    (_isAccepting || _isRejecting) ? null : _onReject,
                icon: _isRejecting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.textSecondary),
                      )
                    : const Icon(Icons.close_rounded, size: 18),
                label: const Text(
                  'RECHAZAR',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.textSecondary,
                  side: const BorderSide(color: AppColors.divider, width: 1.5),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ),

          const SizedBox(width: 12),

          // ── ACEPTAR ──────────────────────────────────────────────────────
          Expanded(
            child: SizedBox(
              height: 52,
              child: ElevatedButton.icon(
                onPressed:
                    (_isAccepting || _isRejecting) ? null : _onAccept,
                icon: _isAccepting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.check_rounded, size: 18),
                label: const Text(
                  'ACEPTAR',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                  ),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  elevation: 3,
                  shadowColor: AppColors.primary.withAlpha(102),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
