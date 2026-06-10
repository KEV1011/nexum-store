import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/features/intercity/domain/entities/intercity_request_entity.dart';
import 'package:nexum_driver/features/intercity/presentation/providers/intercity_driver_provider.dart';
import 'package:nexum_driver/shared/services/ws_service.dart';

const _kIntercityColor = Color(0xFF1E3A8A);

/// Solicitudes intermunicipales en vivo: el conductor publica su
/// disponibilidad y recibe reservas privadas para aceptar, contraofertar o
/// rechazar (mismo patrón que los viajes urbanos, vía WebSocket).
class IntercityRequestsScreen extends ConsumerStatefulWidget {
  const IntercityRequestsScreen({super.key});

  @override
  ConsumerState<IntercityRequestsScreen> createState() =>
      _IntercityRequestsScreenState();
}

class _IntercityRequestsScreenState
    extends ConsumerState<IntercityRequestsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(intercityDriverProvider.notifier).loadAvailability();
      // Asegura el canal WS abierto para recibir intercity_request.
      WsService().connect();
    });
  }

  Future<void> _toggle(bool enabled) async {
    final error = await ref
        .read(intercityDriverProvider.notifier)
        .setAvailability(enabled: enabled);
    if (!mounted || error == null) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(error)));
  }

  Future<void> _counterOffer(IntercityRequestEntity req) async {
    final controller = TextEditingController(
      text: req.offeredFare.toStringAsFixed(0),
    );
    final fare = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Contraoferta'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'El pasajero ofrece '
              '${CurrencyFormatter.format(req.offeredFare)}. '
              'Propón tu tarifa:',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration: const InputDecoration(
                prefixText: r'$ ',
                labelText: 'Tarifa (COP)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () {
              final value = double.tryParse(controller.text.trim());
              if (value != null && value > 0) Navigator.pop(ctx, value);
            },
            child: const Text('Enviar'),
          ),
        ],
      ),
    );
    if (fare == null || !mounted) return;
    ref
        .read(intercityDriverProvider.notifier)
        .accept(req.bookingId, counterFare: fare);
    _showSent('Contraoferta enviada. El pasajero decide.');
  }

  void _showSent(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(intercityDriverProvider);
    final notifier = ref.read(intercityDriverProvider.notifier);

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: _kIntercityColor,
        foregroundColor: Colors.white,
        title: const Text('Intermunicipal'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Disponibilidad ────────────────────────────────────────────────
          Card(
            child: SwitchListTile(
              value: state.enabled,
              onChanged: state.isLoading ? null : _toggle,
              activeTrackColor: _kIntercityColor,
              title: const Text(
                'Disponible para intermunicipales',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: const Text(
                'Recibirás reservas privadas entre municipios cuando '
                'estés en línea y cerca de la ciudad de origen.',
              ),
            ),
          ),
          const SizedBox(height: 16),

          // ── Solicitudes entrantes ─────────────────────────────────────────
          Row(
            children: [
              const Icon(Icons.route_rounded,
                  size: 18, color: _kIntercityColor),
              const SizedBox(width: 6),
              Text(
                'Solicitudes (${state.requests.length})',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (state.requests.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Column(
                children: [
                  Icon(
                    state.enabled
                        ? Icons.notifications_active_outlined
                        : Icons.notifications_off_outlined,
                    size: 44,
                    color: AppColors.textSecondary,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    state.enabled
                        ? 'Esperando solicitudes...\n'
                            'Te avisaremos cuando un pasajero pida un viaje.'
                        : 'Activa tu disponibilidad para recibir '
                            'solicitudes intermunicipales.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
                ],
              ),
            )
          else
            ...state.requests.map(
              (req) => _RequestCard(
                request: req,
                onAccept: () {
                  notifier.accept(req.bookingId);
                  _showSent('¡Viaje aceptado! Revisa los detalles con '
                      'el pasajero por el chat.');
                },
                onCounter: () => _counterOffer(req),
                onReject: () => notifier.reject(req.bookingId),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Tarjeta de solicitud ──────────────────────────────────────────────────────

class _RequestCard extends StatelessWidget {
  const _RequestCard({
    required this.request,
    required this.onAccept,
    required this.onCounter,
    required this.onReject,
  });

  final IntercityRequestEntity request;
  final VoidCallback onAccept;
  final VoidCallback onCounter;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final departure = DateFormat("EEE d 'de' MMM · hh:mm a", 'es_CO')
        .format(request.departureTime);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    request.routeLabel,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                ),
                Text(
                  CurrencyFormatter.format(request.offeredFare),
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: _kIntercityColor,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            _InfoRow(icon: Icons.schedule_rounded, text: departure),
            _InfoRow(
              icon: Icons.event_seat_rounded,
              text: request.seatsLabel,
            ),
            if (request.distanceKm != null)
              _InfoRow(
                icon: Icons.straighten_rounded,
                text: '${request.distanceKm!.round()} km · '
                    '${request.durationMinutes ?? '--'} min aprox.',
              ),
            if (request.pickupAddress != null &&
                request.pickupAddress!.isNotEmpty)
              _InfoRow(
                icon: Icons.trip_origin_rounded,
                text: 'Recogida: ${request.pickupAddress}',
              ),
            if (request.notes != null && request.notes!.isNotEmpty)
              _InfoRow(
                icon: Icons.sticky_note_2_outlined,
                text: request.notes!,
              ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: onReject,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.error,
                    ),
                    child: const Text('Rechazar'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: onCounter,
                    child: const Text('Contraofertar'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: onAccept,
                    style: FilledButton.styleFrom(
                      backgroundColor: _kIntercityColor,
                    ),
                    child: const Text('Aceptar'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: AppColors.textSecondary),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
