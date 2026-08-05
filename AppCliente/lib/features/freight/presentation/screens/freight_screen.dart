import 'package:dio/dio.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/freight/presentation/widgets/freight_route_map.dart';
import 'package:nexum_client/shared/widgets/custody_pin_card.dart';
import 'package:nexum_client/shared/widgets/address_autocomplete_field.dart';

/// Fletes y acarreos con camiones (turbo / camión / mula).
///
/// El cliente publica su carga (peso, tipo de camión, precio ofrecido, fecha
/// opcional) y las flotas de carga verificadas la toman desde su portal. La
/// lista inferior muestra sus fletes con el estado real del backend.
class FreightScreen extends ConsumerStatefulWidget {
  const FreightScreen({super.key});

  @override
  ConsumerState<FreightScreen> createState() => _FreightScreenState();
}

class _FreightScreenState extends ConsumerState<FreightScreen> {
  final _origin = TextEditingController();
  final _dest = TextEditingController();
  final _originCity = TextEditingController();
  final _destCity = TextEditingController();
  final _description = TextEditingController();
  final _weight = TextEditingController();
  final _price = TextEditingController();

  String _vehicleType = 'TURBO';
  DateTime? _scheduledFor;
  DateTime? _promisedAt;
  bool _sending = false;
  bool _loading = true;
  List<Map<String, dynamic>> _mine = const [];

  static const _types = <(String, String, IconData)>[
    ('TURBO', 'Turbo', Icons.local_shipping_outlined),
    ('CAMION', 'Camión', Icons.local_shipping_rounded),
    ('MULA', 'Mula', Icons.fire_truck_rounded),
  ];

  static const _statusLabel = <String, String>{
    'REQUESTED': 'Buscando transportador',
    'ACCEPTED': 'Aceptado por una flota',
    'IN_PROGRESS': 'Carga en ruta',
    'COMPLETED': 'Entregado',
    'CANCELLED': 'Cancelado',
  };

  /// Refresco periódico: mantiene el estado y la posición EN VIVO del
  /// transportador (driverLat/Lng del DTO) sin que el usuario tenga que salir
  /// y volver a entrar.
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _loadMine();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _loadMine(),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    for (final c in [_origin, _dest, _originCity, _destCity, _description, _weight, _price]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadMine() async {
    try {
      final dio = ref.read(apiClientProvider);
      final res = await dio.get<Map<String, dynamic>>('/client/freight');
      final data = (res.data?['data'] as List?)?.cast<Map<String, dynamic>>();
      if (mounted && data != null) setState(() => _mine = data);
    } on DioException {
      // sin conexión: la lista simplemente queda vacía
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    final weight = int.tryParse(_weight.text.replaceAll(RegExp(r'\D'), '')) ?? 0;
    final price = int.tryParse(_price.text.replaceAll(RegExp(r'\D'), '')) ?? 0;
    if (_origin.text.trim().length < 4 || _dest.text.trim().length < 4) {
      _snack('Indica la dirección de recogida y la de entrega.');
      return;
    }
    if (_description.text.trim().isEmpty) {
      _snack('Describe qué carga vas a mover.');
      return;
    }
    if (weight <= 0) {
      _snack('Indica el peso aproximado en kg.');
      return;
    }
    if (price <= 0) {
      _snack('Indica el precio que ofreces por el flete.');
      return;
    }

    setState(() => _sending = true);
    try {
      final dio = ref.read(apiClientProvider);
      await dio.post<Map<String, dynamic>>('/client/freight/request', data: {
        'originAddress': _origin.text.trim(),
        'destAddress': _dest.text.trim(),
        if (_originCity.text.trim().isNotEmpty) 'originCity': _originCity.text.trim(),
        if (_destCity.text.trim().isNotEmpty) 'destCity': _destCity.text.trim(),
        'cargoDescription': _description.text.trim(),
        'weightKg': weight,
        'vehicleType': _vehicleType,
        'offeredPrice': price,
        if (_scheduledFor != null) 'scheduledFor': _scheduledFor!.toUtc().toIso8601String(),
        if (_promisedAt != null) 'promisedAt': _promisedAt!.toUtc().toIso8601String(),
      });
      _origin.clear();
      _dest.clear();
      _description.clear();
      _weight.clear();
      _price.clear();
      setState(() {
        _scheduledFor = null;
        _promisedAt = null;
      });
      _snack('Flete publicado. Las flotas de carga ya pueden tomarlo.', error: false);
      await _loadMine();
    } on DioException catch (e) {
      _snack(
        (e.response?.data as Map?)?['error'] as String? ??
            'No se pudo publicar el flete. Revisa tu conexión.',
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _cancel(String id) async {
    try {
      final dio = ref.read(apiClientProvider);
      await dio.post<Map<String, dynamic>>('/client/freight/$id/cancel');
      await _loadMine();
    } on DioException catch (e) {
      _snack((e.response?.data as Map?)?['error'] as String? ?? 'No se pudo cancelar.');
    }
  }

  /// Selector de fecha+hora compartido por la salida programada y la entrega
  /// comprometida. Devuelve null si el usuario cancela en cualquier paso.
  Future<DateTime?> _pickDateTime({required TimeOfDay inicial}) async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 60)),
      initialDate: now,
    );
    if (date == null || !mounted) return null;
    final time = await showTimePicker(context: context, initialTime: inicial);
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  Future<void> _pickSchedule() async {
    final d = await _pickDateTime(inicial: const TimeOfDay(hour: 8, minute: 0));
    if (d != null) setState(() => _scheduledFor = d);
  }

  Future<void> _pickPromised() async {
    final d = await _pickDateTime(inicial: const TimeOfDay(hour: 18, minute: 0));
    if (d == null) return;
    // El backend rechaza prometer antes de salir; avisar aquí evita el viaje
    // de ida y vuelta y explica el porqué.
    if (_scheduledFor != null && d.isBefore(_scheduledFor!)) {
      _snack('La entrega comprometida no puede ser antes de la salida programada.');
      return;
    }
    setState(() => _promisedAt = d);
  }

  String _fmt(DateTime d) =>
      '${d.day}/${d.month} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  void _snack(String msg, {bool error = true}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? Colors.red.shade700 : Colors.green.shade700,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Fletes y acarreos')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Mueve tu carga con camiones de flotas verificadas: acarreos en tu '
            'ciudad o fletes entre ciudades, al momento o programados.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13, height: 1.35),
          ),
          const SizedBox(height: 16),

          // ── Tipo de camión ──
          Row(
            children: [
              for (final (code, label, icon) in _types) ...[
                Expanded(
                  child: InkWell(
                    onTap: () => setState(() => _vehicleType = code),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: _vehicleType == code
                            ? Theme.of(context).colorScheme.primary
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _vehicleType == code
                              ? Theme.of(context).colorScheme.primary
                              : Colors.grey.shade300,
                        ),
                      ),
                      child: Column(
                        children: [
                          Icon(icon,
                              size: 22,
                              color: _vehicleType == code ? Colors.white : Colors.grey.shade600),
                          const SizedBox(height: 2),
                          Text(label,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: _vehicleType == code ? Colors.white : Colors.grey.shade700,
                              )),
                        ],
                      ),
                    ),
                  ),
                ),
                if (code != 'MULA') const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: 12),

          // Las direcciones del flete van con sugerencias y con mapa: un
          // camión que llega a la cuadra equivocada cuesta horas, no minutos.
          AddressAutocompleteField(
            controller: _origin,
            label: 'Recogida',
            hint: 'Dirección de recogida',
            requiredField: true,
          ),
          const SizedBox(height: 10),
          AddressAutocompleteField(
            controller: _dest,
            label: 'Entrega',
            hint: 'Dirección de entrega',
            requiredField: true,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _field(_originCity, 'Ciudad origen (opcional)', Icons.location_city)),
              const SizedBox(width: 8),
              Expanded(child: _field(_destCity, 'Ciudad destino (opcional)', Icons.location_city)),
            ],
          ),
          const SizedBox(height: 10),
          _field(_description, '¿Qué carga llevas? (ej: trasteo, mercancía)', Icons.inventory_2_outlined),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _field(_weight, 'Peso aprox. (kg)', Icons.scale_outlined, numeric: true)),
              const SizedBox(width: 8),
              Expanded(child: _field(_price, 'Precio ofrecido (COP)', Icons.payments_outlined, numeric: true)),
            ],
          ),
          const SizedBox(height: 10),

          // ── Programar (opcional) ──
          InkWell(
            onTap: _pickSchedule,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Row(
                children: [
                  Icon(Icons.event_outlined, size: 20, color: Colors.grey.shade600),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _scheduledFor == null
                          ? 'Lo antes posible (toca para programar)'
                          : 'Programado: ${_fmt(_scheduledFor!)}',
                      style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                    ),
                  ),
                  if (_scheduledFor != null)
                    IconButton(
                      icon: const Icon(Icons.close_rounded, size: 18),
                      onPressed: () => setState(() => _scheduledFor = null),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),

          // ── Entrega comprometida (opcional) ──
          // Sin una hora contra la cual medir, "llegó tarde" es una opinión.
          InkWell(
            onTap: _pickPromised,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Row(
                children: [
                  Icon(Icons.schedule_rounded, size: 20, color: Colors.grey.shade600),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _promisedAt == null
                          ? '¿Para cuándo la necesitas? (opcional)'
                          : 'Entrega comprometida: ${_fmt(_promisedAt!)}',
                      style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                    ),
                  ),
                  if (_promisedAt != null)
                    IconButton(
                      icon: const Icon(Icons.close_rounded, size: 18),
                      onPressed: () => setState(() => _promisedAt = null),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),

          FilledButton.icon(
            onPressed: _sending ? null : _submit,
            icon: _sending
                ? const SizedBox(
                    width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.local_shipping_rounded),
            label: Text(_sending ? 'Publicando…' : 'Publicar flete'),
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
          ),

          const SizedBox(height: 24),
          Text('Mis fletes',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),

          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
          else if (_mine.isEmpty)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                'Aún no has publicado fletes.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
              ),
            )
          else
            for (final f in _mine) _FreightTile(
              freight: f,
              statusLabel: _statusLabel[f['status']] ?? (f['status'] as String? ?? ''),
              onCancel: (f['status'] == 'REQUESTED' || f['status'] == 'ACCEPTED')
                  ? () => _cancel(f['id'] as String)
                  : null,
            ),
        ],
      ),
    );
  }

  Widget _field(TextEditingController c, String hint, IconData icon, {bool numeric = false}) {
    return TextField(
      controller: c,
      keyboardType: numeric ? TextInputType.number : TextInputType.text,
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: Icon(icon, size: 20),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      ),
    );
  }
}

class _FreightTile extends StatelessWidget {
  const _FreightTile({required this.freight, required this.statusLabel, this.onCancel});

  final Map<String, dynamic> freight;
  final String statusLabel;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final status = freight['status'] as String? ?? '';
    final done = status == 'COMPLETED';
    final cancelled = status == 'CANCELLED';
    final price = (freight['offeredPrice'] as num?)?.toDouble() ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${freight['originAddress']} → ${freight['destAddress']}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5),
                ),
              ),
              Text(
                CurrencyFormatter.format(price),
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
              ),
            ],
          ),
          // PIN de custodia: al cargar lo dicta quien entrega la mercancía, al
          // entregar quien la recibe. Se muestra el que toca según el estado.
          if (status == 'ACCEPTED' && freight['pickupPin'] != null) ...[
            const SizedBox(height: 10),
            CustodyPinCard(
              pin: freight['pickupPin'] as String,
              label: 'PIN de carga',
              hint: 'Dígaselo al conductor solo cuando recoja la carga.',
              color: const Color(0xFFB45309),
            ),
          ],
          if (status == 'IN_PROGRESS' && freight['deliveryPin'] != null) ...[
            const SizedBox(height: 10),
            CustodyPinCard(
              pin: freight['deliveryPin'] as String,
              label: 'PIN de entrega',
              hint: 'Quien reciba la carga debe dictarlo al conductor.',
              color: const Color(0xFFB45309),
            ),
          ],
          // Mapa del trayecto una vez tomado el flete (aceptado / en ruta): el
          // cliente ve por dónde va su carga.
          if (status == 'ACCEPTED' || status == 'IN_PROGRESS') ...[
            const SizedBox(height: 8),
            Builder(builder: (_) {
              final map = FreightRouteMap.fromFreight(freight, height: 130);
              return map ?? const SizedBox.shrink();
            }),
          ],
          const SizedBox(height: 4),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: done
                      ? Colors.green.shade50
                      : cancelled
                          ? Colors.grey.shade200
                          : Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  statusLabel,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: done
                        ? Colors.green.shade700
                        : cancelled
                            ? Colors.grey.shade600
                            : Colors.amber.shade800,
                  ),
                ),
              ),
              const Spacer(),
              if (onCancel != null)
                TextButton(
                  onPressed: onCancel,
                  child: const Text('Cancelar', style: TextStyle(fontSize: 12)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
