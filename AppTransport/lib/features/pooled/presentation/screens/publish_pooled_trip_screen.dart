import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:nexum_driver/features/pooled/presentation/providers/pooled_driver_provider.dart';

const _kPooledColor = Color(0xFF1E3A8A);

class PublishPooledTripScreen extends ConsumerStatefulWidget {
  const PublishPooledTripScreen({super.key});

  @override
  ConsumerState<PublishPooledTripScreen> createState() =>
      _PublishPooledTripScreenState();
}

class _PublishPooledTripScreenState
    extends ConsumerState<PublishPooledTripScreen> {
  PooledCity _origin = PooledCity.pamplona;
  PooledCity _destination = PooledCity.cucuta;
  DateTime _departure = DateTime.now().add(const Duration(hours: 2));
  int _seats = 3;
  bool _allowFleet = false;
  bool _submitting = false;

  final _fareCtrl = TextEditingController();
  final _vehicleCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  FareCapInfo? _cap;
  bool _loadingCap = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refreshCap());
  }

  @override
  void dispose() {
    _fareCtrl.dispose();
    _vehicleCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _refreshCap() async {
    if (_origin == _destination) {
      setState(() => _cap = null);
      return;
    }
    setState(() => _loadingCap = true);
    final cap = await ref.read(pooledDriverProvider.notifier).fetchFareCap(
          origin: _origin,
          destination: _destination,
          seats: _seats,
        );
    if (!mounted) return;
    setState(() {
      _cap = cap;
      _loadingCap = false;
      // Prefill with the suggested fare if the field is empty.
      if (_fareCtrl.text.isEmpty && cap != null) {
        _fareCtrl.text = cap.suggestedFarePerSeat.toStringAsFixed(0);
      }
    });
  }

  double? get _fare {
    final raw = _fareCtrl.text.replaceAll(RegExp(r'[^0-9]'), '');
    return raw.isEmpty ? null : double.tryParse(raw);
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _departure.isAfter(now) ? _departure : now,
      firstDate: now,
      lastDate: now.add(const Duration(days: 30)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_departure),
    );
    if (time == null) return;
    setState(() {
      _departure =
          DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  Future<void> _publish() async {
    if (_origin == _destination) {
      _toast('El origen y el destino no pueden ser iguales');
      return;
    }
    if (_vehicleCtrl.text.trim().isEmpty) {
      _toast('Describe tu vehículo (ej: Chevrolet Spark Blanco · ABC 123)');
      return;
    }
    final fare = _fare;
    if (fare == null) {
      _toast('Ingresa la tarifa por puesto');
      return;
    }
    if (_departure.isBefore(DateTime.now())) {
      _toast('La hora de salida debe ser en el futuro');
      return;
    }

    setState(() => _submitting = true);
    final err = await ref.read(pooledDriverProvider.notifier).publish(
          origin: _origin,
          destination: _destination,
          departureTime: _departure,
          totalSeats: _seats,
          farePerSeat: fare,
          vehicleDescription: _vehicleCtrl.text.trim(),
          notes: _notesCtrl.text.trim(),
          allowFleet: _allowFleet,
        );
    if (!mounted) return;
    if (err == null) {
      HapticFeedback.mediumImpact();
      context.pushReplacement('/pooled-trips');
    } else {
      setState(() => _submitting = false);
      _toast(err);
    }
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: AppColors.error),
    );
  }

  @override
  Widget build(BuildContext context) {
    final d = _departure;
    final dtLabel =
        '${d.day}/${d.month}/${d.year} · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: _kPooledColor,
        foregroundColor: Colors.white,
        title: const Text('Publicar viaje'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _label('Ruta'),
          Row(
            children: [
              Expanded(child: _cityDropdown(_origin, (c) {
                setState(() => _origin = c);
                _refreshCap();
              })),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: Icon(Icons.arrow_forward_rounded, color: _kPooledColor),
              ),
              Expanded(child: _cityDropdown(_destination, (c) {
                setState(() => _destination = c);
                _refreshCap();
              })),
            ],
          ),
          const SizedBox(height: 16),

          _label('Salida'),
          _tile(
            icon: Icons.event_rounded,
            text: dtLabel,
            onTap: _pickDateTime,
          ),
          const SizedBox(height: 16),

          _label('Puestos disponibles'),
          Row(
            children: [
              _stepBtn(Icons.remove_rounded, _seats > 1, () {
                setState(() => _seats--);
                _refreshCap();
              }),
              Expanded(
                child: Center(
                  child: Text('$_seats',
                      style: const TextStyle(
                          fontSize: 26, fontWeight: FontWeight.w800)),
                ),
              ),
              _stepBtn(Icons.add_rounded, _seats < 7, () {
                setState(() => _seats++);
                _refreshCap();
              }),
            ],
          ),
          const SizedBox(height: 16),

          _label('Tu vehículo'),
          TextField(
            controller: _vehicleCtrl,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              hintText: 'Ej: Chevrolet Spark Blanco · ABC 123',
              prefixIcon: Icon(Icons.directions_car_rounded),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),

          _label('Tarifa por puesto'),
          TextField(
            controller: _fareCtrl,
            keyboardType: TextInputType.number,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Ej: 22000',
              prefixText: '\$  ',
              prefixIcon: const Icon(Icons.attach_money_rounded),
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          _fareCapBanner(),
          const SizedBox(height: 16),

          SwitchListTile.adaptive(
            value: _allowFleet,
            onChanged: (v) => setState(() => _allowFleet = v),
            activeColor: _kPooledColor,
            contentPadding: EdgeInsets.zero,
            title: const Text('Permitir flete completo',
                style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: const Text(
                'Un pasajero puede reservar todos los puestos a la vez',
                style: TextStyle(fontSize: 12)),
          ),
          const SizedBox(height: 8),

          _label('Notas (opcional)'),
          TextField(
            controller: _notesCtrl,
            maxLines: 2,
            decoration: const InputDecoration(
              hintText: 'Punto de encuentro, equipaje, mascotas...',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 24),

          SizedBox(
            height: 54,
            child: ElevatedButton(
              onPressed: _submitting ? null : _publish,
              style: ElevatedButton.styleFrom(
                backgroundColor: _kPooledColor,
                foregroundColor: Colors.white,
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
                  : const Text('Publicar viaje',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _fareCapBanner() {
    if (_loadingCap) {
      return Padding(
        padding: EdgeInsets.symmetric(vertical: 4),
        child: Text('Calculando tarifa sugerida...',
            style: TextStyle(fontSize: 12, color: context.textSecondaryColor)),
      );
    }
    final cap = _cap;
    if (cap == null) {
      return Text('Selecciona una ruta válida.',
          style: TextStyle(fontSize: 12, color: context.textSecondaryColor));
    }
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _kPooledColor.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          const Icon(Icons.verified_user_rounded, size: 18, color: _kPooledColor),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Sugerido: ${CurrencyFormatter.format(cap.suggestedFarePerSeat)} / puesto',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: _kPooledColor),
                ),
                const SizedBox(height: 2),
                Text(
                  'Ruta de ${cap.distanceKm.toStringAsFixed(0)} km · '
                  '~${cap.durationMinutes} min. Tú defines tu tarifa.',
                  style: TextStyle(
                      fontSize: 11.5, color: context.textSecondaryColor),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _cityDropdown(PooledCity value, ValueChanged<PooledCity> onChanged) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.outlineColor),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<PooledCity>(
          value: value,
          isExpanded: true,
          items: [
            for (final c in PooledCity.values)
              DropdownMenuItem(value: c, child: Text(c.displayName)),
          ],
          onChanged: (c) {
            if (c != null) onChanged(c);
          },
        ),
      ),
    );
  }

  Widget _tile({
    required IconData icon,
    required String text,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: context.outlineColor),
        ),
        child: Row(
          children: [
            Icon(icon, color: _kPooledColor, size: 20),
            const SizedBox(width: 12),
            Text(text, style: const TextStyle(fontWeight: FontWeight.w600)),
            const Spacer(),
            Icon(Icons.edit_rounded, size: 16, color: context.textSecondaryColor),
          ],
        ),
      ),
    );
  }

  Widget _stepBtn(IconData icon, bool enabled, VoidCallback onTap) {
    return Material(
      color: enabled
          ? _kPooledColor.withValues(alpha: 0.1)
          : context.surfaceVariantColor,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: enabled ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Icon(icon,
              color: enabled ? _kPooledColor : context.textSecondaryColor),
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(text,
            style: TextStyle(
                fontWeight: FontWeight.w700, color: context.textPrimaryColor)),
      );
}
