import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart'
    show IntercityCity;
import 'package:nexum_client/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:nexum_client/features/pooled/presentation/providers/pooled_provider.dart';

const _kPooledColor = Color(0xFF1E3A8A);

class PooledSearchScreen extends ConsumerStatefulWidget {
  const PooledSearchScreen({super.key});

  @override
  ConsumerState<PooledSearchScreen> createState() => _PooledSearchScreenState();
}

class _PooledSearchScreenState extends ConsumerState<PooledSearchScreen> {
  IntercityCity _origin = IntercityCity.pamplona;
  IntercityCity _destination = IntercityCity.cucuta;
  DateTime? _date;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _runSearch());
  }

  void _runSearch() {
    ref.read(pooledProvider.notifier).search(
          origin: _origin,
          destination: _destination,
          date: _date,
        );
  }

  void _swap() {
    setState(() {
      final tmp = _origin;
      _origin = _destination;
      _destination = tmp;
    });
    _runSearch();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? now,
      firstDate: now,
      lastDate: now.add(const Duration(days: 30)),
    );
    if (picked != null) {
      setState(() => _date = picked);
      _runSearch();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(pooledProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: _kPooledColor,
        foregroundColor: Colors.white,
        title: const Text('Viajes compartidos'),
        actions: [
          IconButton(
            tooltip: 'Mis reservas',
            icon: const Icon(Icons.confirmation_number_outlined),
            onPressed: () => context.push('/pooled/bookings'),
          ),
        ],
      ),
      body: Column(
        children: [
          _buildSearchForm(),
          Expanded(child: _buildResults(state)),
        ],
      ),
    );
  }

  Widget _buildSearchForm() {
    return Container(
      color: _kPooledColor,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                Expanded(child: _cityDropdown(_origin, (c) {
                  setState(() => _origin = c);
                  _runSearch();
                })),
                IconButton(
                  icon: const Icon(Icons.swap_horiz_rounded, color: _kPooledColor),
                  onPressed: _swap,
                ),
                Expanded(child: _cityDropdown(_destination, (c) {
                  setState(() => _destination = c);
                  _runSearch();
                })),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _pickDate,
                  icon: const Icon(Icons.event_rounded, size: 18),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white54),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  label: Text(
                    _date == null
                        ? 'Cualquier fecha'
                        : '${_date!.day}/${_date!.month}/${_date!.year}',
                  ),
                ),
              ),
              if (_date != null) ...[
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.clear_rounded, color: Colors.white70),
                  onPressed: () {
                    setState(() => _date = null);
                    _runSearch();
                  },
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _cityDropdown(IntercityCity value, ValueChanged<IntercityCity> onChanged) {
    return DropdownButtonHideUnderline(
      child: DropdownButton<IntercityCity>(
        value: value,
        isExpanded: true,
        icon: const Icon(Icons.arrow_drop_down, color: _kPooledColor),
        style: const TextStyle(
          color: AppColors.textPrimary,
          fontWeight: FontWeight.w600,
          fontSize: 15,
        ),
        items: [
          for (final c in IntercityCity.values)
            DropdownMenuItem(value: c, child: Text(c.displayName)),
        ],
        onChanged: (c) {
          if (c != null) onChanged(c);
        },
      ),
    );
  }

  Widget _buildResults(PooledState state) {
    if (state.isSearching) {
      return const Center(child: CircularProgressIndicator(color: _kPooledColor));
    }
    if (state.searchResults.isEmpty) {
      return _emptyState(state.error);
    }
    return RefreshIndicator(
      color: _kPooledColor,
      onRefresh: () async => _runSearch(),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: state.searchResults.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) => _TripCard(
          trip: state.searchResults[i],
          onTap: () => _openBookSheet(state.searchResults[i]),
        ),
      ),
    );
  }

  Widget _emptyState(String? error) {
    return ListView(
      children: [
        const SizedBox(height: 80),
        Icon(
          error != null ? Icons.cloud_off_rounded : Icons.search_off_rounded,
          size: 64,
          color: AppColors.textSecondary,
        ),
        const SizedBox(height: 16),
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40),
            child: Text(
              error ??
                  'No hay viajes publicados para esta ruta.\n'
                      'Prueba otra fecha o ciudad.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textSecondary, height: 1.4),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _openBookSheet(PooledTripEntity trip) async {
    final booked = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _BookSeatsSheet(trip: trip),
    );
    if (booked == true && mounted) {
      _runSearch();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('¡Reserva confirmada! La verás en "Mis reservas".'),
          backgroundColor: AppColors.success,
        ),
      );
    }
  }
}

// ── Trip card ──────────────────────────────────────────────────────────────────

class _TripCard extends StatelessWidget {
  const _TripCard({required this.trip, required this.onTap});
  final PooledTripEntity trip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = trip.departureTime;
    final timeLabel =
        '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    final dateLabel = '${t.day}/${t.month}';

    return Material(
      color: AppColors.cardLight,
      borderRadius: BorderRadius.circular(16),
      elevation: 1,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.schedule_rounded, size: 16, color: _kPooledColor),
                  const SizedBox(width: 6),
                  Text('$timeLabel · $dateLabel',
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                  const Spacer(),
                  Text(
                    CurrencyFormatter.format(trip.farePerSeat),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: _kPooledColor,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text('${trip.origin.displayName} → ${trip.destination.displayName}',
                  style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary)),
              const SizedBox(height: 2),
              Text('por puesto · ${trip.durationLabel}',
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary)),
              const Divider(height: 20),
              Row(
                children: [
                  _VehicleTypePill(type: trip.vehicleType),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${trip.vehicleDescription} · ${trip.driverName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 12.5, color: AppColors.textSecondary),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _SeatStrip(available: trip.availableSeats, total: trip.totalSeats),
              const SizedBox(height: 10),
              Row(
                children: [
                  _SeatBadge(available: trip.availableSeats, total: trip.totalSeats),
                  const Spacer(),
                  const Text('Reservar',
                      style: TextStyle(
                          color: _kPooledColor, fontWeight: FontWeight.w700)),
                  const Icon(Icons.chevron_right_rounded, color: _kPooledColor),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pill con el tipo de vehículo (carro / camioneta / van / buseta).
class _VehicleTypePill extends StatelessWidget {
  const _VehicleTypePill({required this.type});
  final PooledVehicleType type;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: _kPooledColor.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(type.icon, size: 15, color: _kPooledColor),
          const SizedBox(width: 5),
          Text(type.label,
              style: const TextStyle(
                  color: _kPooledColor,
                  fontWeight: FontWeight.w700,
                  fontSize: 11.5)),
        ],
      ),
    );
  }
}

/// Tira visual de asientos: ocupados en gris, libres en verde. Da una lectura
/// de un vistazo de cuántos puestos quedan sin recurrir a un mapa posicional.
class _SeatStrip extends StatelessWidget {
  const _SeatStrip({required this.available, required this.total});
  final int available;
  final int total;

  @override
  Widget build(BuildContext context) {
    final booked = total - available;
    return Wrap(
      spacing: 3,
      runSpacing: 3,
      children: [
        for (var i = 0; i < total; i++)
          Icon(
            i < booked ? Icons.event_seat_rounded : Icons.event_seat_outlined,
            size: 15,
            color: i < booked ? AppColors.textTertiary : AppColors.success,
          ),
      ],
    );
  }
}

class _SeatBadge extends StatelessWidget {
  const _SeatBadge({required this.available, required this.total});
  final int available;
  final int total;

  @override
  Widget build(BuildContext context) {
    final color = available == 0
        ? AppColors.error
        : available <= 1
            ? AppColors.warning
            : AppColors.success;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.event_seat_rounded, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            available == 0 ? 'Completo' : '$available de $total libres',
            style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

// ── Booking sheet ────────────────────────────────────────────────────────────

class _BookSeatsSheet extends ConsumerStatefulWidget {
  const _BookSeatsSheet({required this.trip});
  final PooledTripEntity trip;

  @override
  ConsumerState<_BookSeatsSheet> createState() => _BookSeatsSheetState();
}

class _BookSeatsSheetState extends ConsumerState<_BookSeatsSheet> {
  final Set<int> _selected = <int>{};
  final _pickupCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  bool _submitting = false;

  void _toggleSeat(int n) {
    setState(() {
      if (_selected.contains(n)) {
        _selected.remove(n);
      } else if (_selected.length < _maxSelectable) {
        _selected.add(n);
      }
    });
  }

  int get _maxSelectable {
    final t = widget.trip;
    // Booking the whole vehicle is only allowed if the driver enabled fleet.
    if (t.allowFleet) return t.availableSeats;
    return t.availableSeats == t.totalSeats
        ? t.totalSeats - 1 == 0
            ? 1
            : t.totalSeats - 1
        : t.availableSeats;
  }

  @override
  void dispose() {
    _pickupCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    if (_selected.isEmpty) return;
    setState(() => _submitting = true);
    final seatNumbers = _selected.toList()..sort();
    final err = await ref.read(pooledProvider.notifier).bookSeats(
          tripId: widget.trip.id,
          seats: seatNumbers.length,
          seatNumbers: seatNumbers,
          pickupAddress: _pickupCtrl.text.trim(),
          notes: _notesCtrl.text.trim(),
        );
    if (!mounted) return;
    if (err == null) {
      HapticFeedback.mediumImpact();
      Navigator.of(context).pop(true);
    } else {
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err), backgroundColor: AppColors.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final trip = widget.trip;
    final total = trip.farePerSeat * _selected.length;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.outlineLight,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('${trip.origin.displayName} → ${trip.destination.displayName}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('${trip.driverName} · ${trip.vehicleDescription}',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
            const SizedBox(height: 12),
            Row(
              children: [
                _VehicleTypePill(type: trip.vehicleType),
                const SizedBox(width: 8),
                Text(
                  trip.availableSeats == 0
                      ? 'Completo'
                      : '${trip.availableSeats} de ${trip.totalSeats} puestos libres',
                  style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textSecondary),
                ),
              ],
            ),
            const SizedBox(height: 20),

            Row(
              children: [
                const Text('Elige tus asientos',
                    style: TextStyle(fontWeight: FontWeight.w700)),
                const Spacer(),
                Text(
                  _selected.isEmpty
                      ? 'Toca un puesto libre'
                      : '${_selected.length} seleccionado(s)',
                  style: const TextStyle(
                      fontSize: 12.5, color: AppColors.textSecondary),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _SeatMapPicker(
              totalSeats: trip.totalSeats,
              columns: trip.vehicleType.seatColumns,
              occupied: trip.occupiedSeats.toSet(),
              selected: _selected,
              onToggle: _toggleSeat,
            ),
            const SizedBox(height: 12),
            const _SeatLegend(),
            if (trip.allowFleet && _selected.length == trip.totalSeats)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Reservando el vehículo completo (flete)',
                    style: TextStyle(color: _kPooledColor, fontSize: 12)),
              ),
            const SizedBox(height: 16),

            TextField(
              controller: _pickupCtrl,
              decoration: const InputDecoration(
                labelText: 'Dónde te recogen (opcional)',
                prefixIcon: Icon(Icons.my_location_rounded),
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notesCtrl,
              decoration: const InputDecoration(
                labelText: 'Notas para el conductor (opcional)',
                prefixIcon: Icon(Icons.notes_rounded),
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),

            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: _kPooledColor.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Text('Total a pagar',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  const Spacer(),
                  Text(CurrencyFormatter.format(total),
                      style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: _kPooledColor)),
                ],
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'El pago es un gasto compartido del viaje. Acuerda el medio de '
              'pago directamente con el conductor.',
              style: TextStyle(fontSize: 11.5, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 16),

            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: (_submitting || _selected.isEmpty) ? null : _confirm,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kPooledColor,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: AppColors.outlineLight,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: Colors.white),
                      )
                    : Text(
                        _selected.isEmpty
                            ? 'Elige al menos un puesto'
                            : 'Confirmar reserva',
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

/// Mapa de asientos: una cuadrícula de puestos numerados donde el pasajero
/// elige cuáles ocupa. Ocupados en gris (no tocables), libres con borde verde,
/// seleccionados en azul. El conductor va al frente (volante).
class _SeatMapPicker extends StatelessWidget {
  const _SeatMapPicker({
    required this.totalSeats,
    required this.columns,
    required this.occupied,
    required this.selected,
    required this.onToggle,
  });

  final int totalSeats;
  final int columns;
  final Set<int> occupied;
  final Set<int> selected;
  final ValueChanged<int> onToggle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Frente del vehículo (conductor).
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.surfaceVariantLight,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.airline_seat_recline_normal_rounded,
                      size: 15, color: AppColors.textSecondary),
                  SizedBox(width: 4),
                  Text('Conductor',
                      style: TextStyle(
                          fontSize: 11, color: AppColors.textSecondary)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (var n = 1; n <= totalSeats; n++)
              _SeatTile(
                number: n,
                state: occupied.contains(n)
                    ? _SeatState.occupied
                    : selected.contains(n)
                        ? _SeatState.selected
                        : _SeatState.free,
                onTap: () => onToggle(n),
              ),
          ],
        ),
      ],
    );
  }
}

enum _SeatState { free, selected, occupied }

class _SeatTile extends StatelessWidget {
  const _SeatTile({
    required this.number,
    required this.state,
    required this.onTap,
  });

  final int number;
  final _SeatState state;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (bg, border, fg) = switch (state) {
      _SeatState.occupied => (
          AppColors.surfaceVariantLight,
          AppColors.outlineLight,
          AppColors.textTertiary,
        ),
      _SeatState.selected => (_kPooledColor, _kPooledColor, Colors.white),
      _SeatState.free => (Colors.white, AppColors.success, AppColors.success),
    };
    return InkWell(
      onTap: state == _SeatState.occupied ? null : onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: 46,
        height: 46,
        decoration: BoxDecoration(
          color: bg,
          border: Border.all(color: border, width: 1.4),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.event_seat_rounded, size: 16, color: fg),
            Text('$number',
                style: TextStyle(
                    fontSize: 10, fontWeight: FontWeight.w700, color: fg)),
          ],
        ),
      ),
    );
  }
}

class _SeatLegend extends StatelessWidget {
  const _SeatLegend();

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 16,
      runSpacing: 6,
      children: const [
        _LegendDot(color: AppColors.success, label: 'Libre', filled: false),
        _LegendDot(color: _kPooledColor, label: 'Tu selección', filled: true),
        _LegendDot(color: AppColors.textTertiary, label: 'Ocupado', filled: true),
      ],
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({
    required this.color,
    required this.label,
    required this.filled,
  });

  final Color color;
  final String label;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            color: filled ? color : Colors.white,
            border: Border.all(color: color, width: 1.4),
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        const SizedBox(width: 5),
        Text(label,
            style: const TextStyle(
                fontSize: 11.5, color: AppColors.textSecondary)),
      ],
    );
  }
}
