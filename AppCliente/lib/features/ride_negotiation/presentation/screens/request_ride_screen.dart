import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/ride_negotiation/presentation/providers/ride_negotiation_provider.dart';
import 'package:nexum_client/features/ride_negotiation/presentation/screens/ride_bids_screen.dart';

/// inDriver-style request: the passenger names a fare and drivers bid on it.
class RequestRideScreen extends ConsumerStatefulWidget {
  const RequestRideScreen({super.key});

  @override
  ConsumerState<RequestRideScreen> createState() => _RequestRideScreenState();
}

class _RequestRideScreenState extends ConsumerState<RequestRideScreen> {
  final _origin = TextEditingController();
  final _destination = TextEditingController();
  final _notes = TextEditingController();
  final _fare = TextEditingController();

  double _distanceKm = 5;
  bool _fareTouched = false;

  static const _base = 3500.0;
  static const _perKm = 1200.0;

  int get _eta => (_distanceKm * 2.4).round().clamp(3, 600);
  double get _suggested => ((_base + _distanceKm * _perKm) / 500).round() * 500;

  @override
  void initState() {
    super.initState();
    _fare.text = _suggested.toStringAsFixed(0);
  }

  @override
  void dispose() {
    _origin.dispose();
    _destination.dispose();
    _notes.dispose();
    _fare.dispose();
    super.dispose();
  }

  void _syncSuggestedFare() {
    if (!_fareTouched) {
      _fare.text = _suggested.toStringAsFixed(0);
    }
  }

  Future<void> _submit() async {
    final origin = _origin.text.trim();
    final dest = _destination.text.trim();
    final fare = double.tryParse(_fare.text.replaceAll(RegExp(r'[^0-9.]'), ''));

    if (origin.isEmpty || dest.isEmpty) {
      _toast('Ingresa origen y destino.');
      return;
    }
    if (fare == null || fare <= 0) {
      _toast('Ingresa una tarifa válida.');
      return;
    }

    final notifier = ref.read(rideNegotiationProvider.notifier);
    final error = await notifier.createRide(
      serviceType: 'particular',
      originAddress: origin,
      destinationAddress: dest,
      offeredFare: fare,
      distanceKm: _distanceKm,
      etaMinutes: _eta,
      notes: _notes.text.trim(),
    );

    if (!mounted) return;
    if (error != null) {
      _toast(error);
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const RideBidsScreen()),
    );
  }

  void _toast(String m) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(rideNegotiationProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        title: const Text('Pon tu precio'),
        backgroundColor: AppColors.surfaceLight,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _field(_origin, 'Origen', Icons.trip_origin_rounded, AppColors.primary,
              hintText: 'Ej: Calle 80 #15-32, Bogotá'),
          const SizedBox(height: 12),
          _field(_destination, 'Destino', Icons.place_rounded, AppColors.error,
              hintText: 'Ej: Aeropuerto El Dorado'),
          const SizedBox(height: 20),
          Row(
            children: [
              const Text('Distancia estimada',
                  style: TextStyle(fontWeight: FontWeight.w600)),
              const Spacer(),
              Text('${_distanceKm.toStringAsFixed(0)} km · $_eta min',
                  style: const TextStyle(color: AppColors.textSecondary)),
            ],
          ),
          Slider(
            value: _distanceKm,
            min: 1,
            max: 40,
            divisions: 39,
            activeColor: AppColors.primary,
            label: '${_distanceKm.toStringAsFixed(0)} km',
            onChanged: (v) => setState(() {
              _distanceKm = v;
              _syncSuggestedFare();
            }),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Text('Tu oferta',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                    const Spacer(),
                    Text('Sugerido: ${CurrencyFormatter.format(_suggested)}',
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.primaryDim)),
                    const SizedBox(width: 6),
                    GestureDetector(
                      onTap: () {
                        _fareTouched = false;
                        _syncSuggestedFare();
                        setState(() {});
                      },
                      child: const Text(
                        '↺ Sugerido',
                        style: TextStyle(
                            fontSize: 11.5,
                            color: AppColors.primaryDim,
                            decoration: TextDecoration.underline),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    _stepBtn(Icons.remove_rounded, () => _bumpFare(-500)),
                    Expanded(
                      child: TextField(
                        controller: _fare,
                        textAlign: TextAlign.center,
                        keyboardType: TextInputType.number,
                        onChanged: (_) => _fareTouched = true,
                        inputFormatters: [
                          FilteringTextInputFormatter.allow(RegExp(r'[0-9]')),
                        ],
                        style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primaryDim),
                        decoration: const InputDecoration(
                          prefixText: r'$ ',
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                    _stepBtn(Icons.add_rounded, () => _bumpFare(500)),
                  ],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: _InfoRow(
              icon: Icons.info_outline_rounded,
              text:
                  'Conductores cercanos ven tu precio y pueden aceptar o contraofertar.',
            ),
          ),
          _field(_notes, 'Notas para el conductor (opcional)',
              Icons.notes_rounded, AppColors.textSecondary,
              maxLines: 2),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: state.isCreating ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: state.isCreating
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Buscar conductor',
                      style: TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ),
          const SizedBox(height: 8),
          const Center(
            child: Text(
              'Los conductores cercanos verán tu oferta y podrán aceptarla\no proponerte otro precio.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
            ),
          ),
        ],
      ),
    );
  }

  void _bumpFare(double delta) {
    _fareTouched = true;
    final current =
        double.tryParse(_fare.text.replaceAll(RegExp(r'[^0-9.]'), '')) ?? 0;
    final next = (current + delta).clamp(0, 9999999).toDouble();
    _fare.text = next.toStringAsFixed(0);
  }

  Widget _stepBtn(IconData icon, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: const BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: AppColors.primaryDim),
        ),
      );

  Widget _field(
    TextEditingController c,
    String label,
    IconData icon,
    Color iconColor, {
    int maxLines = 1,
    String? hintText,
  }) =>
      TextField(
        controller: c,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          hintText: hintText,
          prefixIcon: Icon(icon, color: iconColor, size: 20),
          filled: true,
          fillColor: AppColors.surfaceLight,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.outlineLight),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.outlineLight),
          ),
        ),
      );
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 14, color: AppColors.textTertiary),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
                fontSize: 11.5, color: AppColors.textTertiary),
          ),
        ),
      ],
    );
  }
}
