import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart';
import 'package:nexum_client/features/intercity/presentation/providers/intercity_provider.dart';

// Color de identidad del módulo intermunicipal
const _kInterColor = AppColors.intercityBrand;

class IntercityBookingScreen extends ConsumerStatefulWidget {
  const IntercityBookingScreen({super.key});

  @override
  ConsumerState<IntercityBookingScreen> createState() =>
      _IntercityBookingScreenState();
}

class _IntercityBookingScreenState
    extends ConsumerState<IntercityBookingScreen> {
  IntercityCity _origin = IntercityCity.pamplona;
  IntercityCity _destination = IntercityCity.cucuta;
  DateTime _departureTime = DateTime.now().add(const Duration(hours: 2));
  IntercitySeats _seats = IntercitySeats.one;
  final _fareCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _pickupCtrl = TextEditingController();
  final _dropoffCtrl = TextEditingController();
  bool _isSubmitting = false;

  IntercityRoute? get _route =>
      IntercityRoute.between(_origin, _destination);

  double get _suggestedFare {
    final route = _route;
    if (route == null) return 0;
    return _seats.isFleet ? route.fleetFare : route.farePerSeat * _seats.count;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _fareCtrl.text = _suggestedFare.toInt().toString();
    });
  }

  @override
  void dispose() {
    _fareCtrl.dispose();
    _notesCtrl.dispose();
    _pickupCtrl.dispose();
    _dropoffCtrl.dispose();
    super.dispose();
  }

  void _swapCities() {
    HapticFeedback.selectionClick();
    setState(() {
      final tmp = _origin;
      _origin = _destination;
      _destination = tmp;
      _updateSuggestedFare();
    });
  }

  void _updateSuggestedFare() {
    _fareCtrl.text = _suggestedFare.toInt().toString();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _departureTime,
      firstDate: now,
      lastDate: now.add(const Duration(days: 30)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(primary: _kInterColor),
        ),
        child: child!,
      ),
    );
    if (picked == null || !mounted) return;
    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_departureTime),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(primary: _kInterColor),
        ),
        child: child!,
      ),
    );
    if (pickedTime == null || !mounted) return;
    setState(() {
      _departureTime = DateTime(
        picked.year,
        picked.month,
        picked.day,
        pickedTime.hour,
        pickedTime.minute,
      );
    });
  }

  Future<void> _submit() async {
    if (_origin == _destination) {
      _showError('Origen y destino deben ser diferentes.');
      return;
    }
    final fareText = _fareCtrl.text.trim();
    final fare = double.tryParse(fareText.replaceAll(RegExp(r'[^\d]'), ''));
    if (fare == null || fare < 5000) {
      _showError('Ingresa una oferta válida (mín. \$5.000).');
      return;
    }
    HapticFeedback.mediumImpact();
    setState(() => _isSubmitting = true);

    final request = IntercityRequestEntity(
      id: 'IC_${DateTime.now().millisecondsSinceEpoch}',
      origin: _origin,
      destination: _destination,
      departureTime: _departureTime,
      seats: _seats,
      offeredFare: fare,
      status: IntercityStatus.searching,
      createdAt: DateTime.now(),
      notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
      pickupAddress:
          _pickupCtrl.text.trim().isEmpty ? null : _pickupCtrl.text.trim(),
      dropoffAddress:
          _dropoffCtrl.text.trim().isEmpty ? null : _dropoffCtrl.text.trim(),
    );

    final error =
        await ref.read(intercityProvider.notifier).createRequest(request);
    if (!mounted) return;
    setState(() => _isSubmitting = false);
    if (error != null) {
      _showError(error);
      return;
    }
    context.go('/intercity/status');
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final route = _route;

    return Scaffold(
      backgroundColor: AppColors.intercityBg,
      appBar: AppBar(
        backgroundColor: AppColors.intercityBg,
        foregroundColor: Colors.white,
        title: const Text(
          'Viaje Intermunicipal',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 17,
            color: Colors.white,
          ),
        ),
        centerTitle: false,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          // safeBack: llegar aquí con context.go deja la pila vacía y un
          // pop() a secas cerraría la app.
          onPressed: () => safeBack(context),
        ),
        actions: [
          IconButton(
            tooltip: 'Mis viajes',
            icon: const Icon(Icons.history_rounded),
            onPressed: () => context.push('/intercity/history'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
        children: [
          // ── Ruta ──────────────────────────────────────────────────────────
          _DarkCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Ruta'),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _CityDropdown(
                        label: 'Origen',
                        value: _origin,
                        icon: Icons.radio_button_checked_rounded,
                        iconColor: AppColors.primary,
                        onChanged: (v) {
                          setState(() {
                            _origin = v;
                            _updateSuggestedFare();
                          });
                        },
                      ),
                    ),
                    GestureDetector(
                      onTap: _swapCities,
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 8),
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.intercityBrand.withValues(alpha: 0.3),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.swap_horiz_rounded,
                          color: AppColors.intercityAccent,
                          size: 20,
                        ),
                      ),
                    ),
                    Expanded(
                      child: _CityDropdown(
                        label: 'Destino',
                        value: _destination,
                        icon: Icons.location_on_rounded,
                        iconColor: AppColors.error,
                        onChanged: (v) {
                          setState(() {
                            _destination = v;
                            _updateSuggestedFare();
                          });
                        },
                      ),
                    ),
                  ],
                ),
                if (route != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: _kInterColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _RouteInfo(
                          icon: Icons.straighten_rounded,
                          label: '${route.distanceKm.toInt()} km',
                        ),
                        _RouteInfo(
                          icon: Icons.access_time_rounded,
                          label: route.durationLabel,
                        ),
                        _RouteInfo(
                          icon: Icons.payments_outlined,
                          label: 'Sugerido: ${route.fareLabel}/cupo',
                        ),
                      ],
                    ),
                  ),
                ] else if (_origin == _destination) ...[
                  const SizedBox(height: 8),
                  const Text(
                    'Origen y destino deben ser diferentes.',
                    style: TextStyle(color: AppColors.error, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),

          // ── Fecha y hora ──────────────────────────────────────────────────
          _DarkCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Fecha y hora de salida'),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: _pickDate,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppColors.intercityBg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.intercityOutline),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.calendar_month_rounded,
                            color: AppColors.intercityAccent, size: 20),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _formatDateTime(_departureTime),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        const Icon(Icons.edit_rounded,
                            color: AppColors.intercityTextMuted, size: 16),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // ── Cupos ─────────────────────────────────────────────────────────
          _DarkCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Cupos / modalidad'),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: IntercitySeats.values.map((s) {
                    final selected = s == _seats;
                    return GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        setState(() {
                          _seats = s;
                          _updateSuggestedFare();
                        });
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 9),
                        decoration: BoxDecoration(
                          color: selected
                              ? _kInterColor
                              : AppColors.intercityBg,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: selected
                                ? _kInterColor
                                : AppColors.intercityOutline,
                          ),
                          boxShadow: selected
                              ? [
                                  BoxShadow(
                                    color:
                                        _kInterColor.withValues(alpha: 0.4),
                                    blurRadius: 8,
                                    offset: const Offset(0, 3),
                                  ),
                                ]
                              : null,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              s.isFleet
                                  ? Icons.directions_car_rounded
                                  : Icons.person_rounded,
                              size: 15,
                              color: selected
                                  ? Colors.white
                                  : AppColors.intercityTextDim,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              s.label,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: selected
                                    ? Colors.white
                                    : AppColors.intercityTextSoft,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // ── Oferta de precio ──────────────────────────────────────────────
          _DarkCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Tu oferta'),
                const SizedBox(height: 4),
                Text(
                  route != null
                      ? 'Precio sugerido total: ${CurrencyFormatter.format(_suggestedFare)}'
                          '${route.isEstimated ? ' (aprox.)' : ''}'
                      : 'Elige un origen y un destino diferentes',
                  style: const TextStyle(
                    color: AppColors.intercityTextMuted,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _fareCtrl,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                  decoration: InputDecoration(
                    prefixText: '\$ ',
                    prefixStyle: const TextStyle(
                      color: AppColors.intercityAccent,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                    hintText: '0',
                    hintStyle: const TextStyle(color: AppColors.intercityOutline),
                    filled: true,
                    fillColor: AppColors.intercityBg,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.intercityOutline),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.intercityOutline),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide:
                          const BorderSide(color: _kInterColor, width: 2),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                const Row(
                  children: [
                    Icon(Icons.info_outline_rounded,
                        size: 13, color: AppColors.intercityTextMuted),
                    SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        'El conductor puede aceptar o hacer una contraoferta.',
                        style: TextStyle(
                            color: AppColors.intercityTextMuted, fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // ── Direcciones puntuales ─────────────────────────────────────────
          _DarkCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Recogida y destino (opcional)'),
                const SizedBox(height: 12),
                _DarkTextField(
                  controller: _pickupCtrl,
                  hint: 'Dirección de recogida en ${_origin.displayName}',
                  icon: Icons.radio_button_checked_rounded,
                  iconColor: AppColors.primary,
                ),
                const SizedBox(height: 8),
                _DarkTextField(
                  controller: _dropoffCtrl,
                  hint: 'Dirección de destino en ${_destination.displayName}',
                  icon: Icons.location_on_rounded,
                  iconColor: AppColors.error,
                ),
                const SizedBox(height: 8),
                _DarkTextField(
                  controller: _notesCtrl,
                  hint: 'Notas para el conductor (equipaje, paradas, etc.)',
                  icon: Icons.notes_rounded,
                  iconColor: AppColors.intercityTextMuted,
                  maxLines: 2,
                ),
              ],
            ),
          ),

          // ── CTA principal DENTRO del formulario ────────────────────────
          // Se agrega en el cuerpo desplazable (además de la barra inferior)
          // para que el botón de solicitar SIEMPRE sea visible al recorrer el
          // formulario — ninguna barra inferior, teclado o inset del sistema
          // puede ocultarlo en pantallas pequeñas.
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: _isSubmitting ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: _kInterColor,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.search_rounded),
              label: Text(
                _isSubmitting ? 'Enviando…' : 'Solicitar viaje intermunicipal',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  String _formatDateTime(DateTime dt) {
    const days = [
      'Lun',
      'Mar',
      'Mié',
      'Jue',
      'Vie',
      'Sáb',
      'Dom',
    ];
    const months = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
      'nov',
      'dic',
    ];
    final day = days[dt.weekday - 1];
    final month = months[dt.month - 1];
    final hour = dt.hour.toString().padLeft(2, '0');
    final min = dt.minute.toString().padLeft(2, '0');
    return '$day ${dt.day} $month · $hour:$min';
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _DarkCard extends StatelessWidget {
  const _DarkCard({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.intercitySurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.intercityOutline),
      ),
      child: child,
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: AppColors.intercityTextDim,
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.6,
      ),
    );
  }
}

class _CityDropdown extends StatelessWidget {
  const _CityDropdown({
    required this.label,
    required this.value,
    required this.icon,
    required this.iconColor,
    required this.onChanged,
  });

  final String label;
  final IntercityCity value;
  final IconData icon;
  final Color iconColor;
  final ValueChanged<IntercityCity> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 12, color: iconColor),
            const SizedBox(width: 4),
            Text(label,
                style: const TextStyle(
                    color: AppColors.intercityTextMuted, fontSize: 10)),
          ],
        ),
        const SizedBox(height: 4),
        DropdownButtonFormField<IntercityCity>(
          value: value,
          isExpanded: true,
          dropdownColor: AppColors.intercitySurface,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
          decoration: InputDecoration(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            filled: true,
            fillColor: AppColors.intercityBg,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: AppColors.intercityOutline),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: AppColors.intercityOutline),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide:
                  const BorderSide(color: _kInterColor, width: 1.5),
            ),
          ),
          items: IntercityCity.values
              .map(
                (c) => DropdownMenuItem(
                  value: c,
                  child: Text(c.displayName),
                ),
              )
              .toList(),
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
        ),
      ],
    );
  }
}

class _RouteInfo extends StatelessWidget {
  const _RouteInfo({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: AppColors.intercityAccent),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            label,
            style: const TextStyle(
              color: AppColors.intercityTextSoft,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _DarkTextField extends StatelessWidget {
  const _DarkTextField({
    required this.controller,
    required this.hint,
    required this.icon,
    required this.iconColor,
    this.maxLines = 1,
  });

  final TextEditingController controller;
  final String hint;
  final IconData icon;
  final Color iconColor;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      style: const TextStyle(color: Colors.white, fontSize: 13),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppColors.intercityOutlineSoft, fontSize: 13),
        prefixIcon: Icon(icon, size: 18, color: iconColor),
        filled: true,
        fillColor: AppColors.intercityBg,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.intercityOutline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.intercityOutline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _kInterColor, width: 1.5),
        ),
      ),
    );
  }
}
