import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/freight/presentation/widgets/freight_route_map.dart';

/// Fletes de carga del conductor: los que puede TOMAR (abiertos, para su flota
/// y sus camiones) y los que ya tiene ASIGNADOS.
///
/// - Disponibles: GET /driver/freight/available → { freights, vehicles }.
///   Toma con POST /driver/freight/:id/take { vehicleId } (elige camión).
/// - Asignados: GET /driver/freights (ACCEPTED/IN_PROGRESS/COMPLETED).
///   El ciclo se maneja desde aquí: Iniciar viaje (in_progress) y Completar
///   entrega (completed, liquida el neto) vía POST /driver/freight/:id/status —
///   aplica igual si él tomó el flete o si la flota se lo asignó del portal.
class DriverFreightsScreen extends StatefulWidget {
  const DriverFreightsScreen({super.key});

  @override
  State<DriverFreightsScreen> createState() => _DriverFreightsScreenState();
}

class _DriverFreightsScreenState extends State<DriverFreightsScreen> {
  bool _loading = true;
  String? _busyId;
  List<Map<String, dynamic>> _mine = const [];
  List<Map<String, dynamic>> _available = const [];
  List<Map<String, dynamic>> _vehicles = const [];

  static const _statusLabel = <String, String>{
    'ACCEPTED': 'Asignado a ti',
    'IN_PROGRESS': 'En ruta',
    'COMPLETED': 'Completado',
  };

  /// Refresco periódico: nuevos fletes disponibles y posición en vivo.
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _load();
    _refreshTimer = Timer.periodic(const Duration(seconds: 20), (_) => _load());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final dio = DioClient();
      final mine = await dio.get<Map<String, dynamic>>('/driver/freights');
      final avail =
          await dio.get<Map<String, dynamic>>('/driver/freight/available');
      final mineData =
          (mine.data?['data'] as List?)?.cast<Map<String, dynamic>>();
      final availData = avail.data?['data'] as Map<String, dynamic>?;
      if (!mounted) return;
      setState(() {
        if (mineData != null) _mine = mineData;
        if (availData != null) {
          _available =
              (availData['freights'] as List?)?.cast<Map<String, dynamic>>() ??
                  const [];
          _vehicles =
              (availData['vehicles'] as List?)?.cast<Map<String, dynamic>>() ??
                  const [];
        }
      });
    } catch (_) {
      // sin conexión: se conservan las listas actuales
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _take(Map<String, dynamic> f) async {
    if (_vehicles.isEmpty) return;
    String vehicleId = _vehicles.first['id'] as String;
    // Con más de un camión, el conductor elige cuál usar.
    if (_vehicles.length > 1) {
      final chosen = await showModalBottomSheet<String>(
        context: context,
        builder: (ctx) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('¿Con cuál camión?',
                    style: TextStyle(fontWeight: FontWeight.w700)),
              ),
              for (final v in _vehicles)
                ListTile(
                  leading: const Icon(Icons.local_shipping_rounded),
                  title: Text('${v['plate']} · ${v['type']}'),
                  subtitle: v['capacityKg'] != null
                      ? Text('${v['capacityKg']} kg')
                      : null,
                  onTap: () => Navigator.pop(ctx, v['id'] as String),
                ),
            ],
          ),
        ),
      );
      if (chosen == null) return;
      vehicleId = chosen;
    }

    setState(() => _busyId = f['id'] as String);
    try {
      await DioClient().post<Map<String, dynamic>>(
        '/driver/freight/${f['id']}/take',
        data: {'vehicleId': vehicleId},
      );
      _snack('Flete tomado. Está en "Mis fletes".', error: false);
      await _load();
    } catch (e) {
      _snack('No se pudo tomar: otro pudo haberlo tomado antes.');
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  /// Inicia la ruta o confirma la entrega del flete asignado.
  Future<void> _updateStatus(Map<String, dynamic> f, String status) async {
    final id = f['id'] as String;
    setState(() => _busyId = id);
    try {
      final res = await DioClient().post<Map<String, dynamic>>(
        '/driver/freight/$id/status',
        data: {'status': status},
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (status == 'completed') {
        final net = (data?['netEarning'] as num?)?.toDouble();
        _snack(
          net != null
              ? 'Flete completado. Tu neto: \$${net.toStringAsFixed(0)}'
              : 'Flete completado.',
          error: false,
        );
      } else {
        _snack('Viaje iniciado. ¡Buen camino!', error: false);
      }
      await _load();
    } on DioException catch (e) {
      final body = e.response?.data;
      final msg = body is Map<String, dynamic> ? body['error'] as String? : null;
      _snack(msg ?? 'No se pudo actualizar el flete.');
    } catch (_) {
      _snack('No se pudo actualizar el flete.');
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  /// La entrega liquida dinero: se confirma antes de enviarla.
  Future<void> _confirmComplete(Map<String, dynamic> f) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Completar el flete?'),
        content: const Text(
          'Confirma que la carga fue entregada en su destino. '
          'Al completar se liquida tu ganancia.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Aún no'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sí, entregada'),
          ),
        ],
      ),
    );
    if (ok ?? false) await _updateStatus(f, 'completed');
  }

  void _snack(String msg, {bool error = true}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? Colors.red.shade700 : Colors.green.shade700,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final empty = _mine.isEmpty && _available.isEmpty;
    return Scaffold(
      appBar: AppBar(title: const Text('Fletes de carga')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (empty) ...[
                    const SizedBox(height: 48),
                    Icon(Icons.local_shipping_outlined,
                        size: 56, color: Colors.grey.shade400),
                    const SizedBox(height: 12),
                    Text(
                      'Sin fletes por ahora.\nCuando entre una carga para tu '
                      'tipo de camión, aparecerá aquí para tomarla.',
                      textAlign: TextAlign.center,
                      style:
                          TextStyle(color: Colors.grey.shade600, height: 1.4),
                    ),
                  ],
                  if (_available.isNotEmpty) ...[
                    _sectionTitle('Disponibles para tomar', _available.length),
                    for (final f in _available) _availableTile(f),
                    const SizedBox(height: 16),
                  ],
                  if (_mine.isNotEmpty) ...[
                    _sectionTitle('Mis fletes', _mine.length),
                    for (final f in _mine) _mineTile(f),
                  ],
                ],
              ),
      ),
    );
  }

  Widget _sectionTitle(String t, int n) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text('$t ($n)',
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      );

  Widget _availableTile(Map<String, dynamic> f) {
    final price = (f['offeredPrice'] as num?)?.toDouble() ?? 0;
    final busy = _busyId == f['id'];
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFDBA74)),
        color: const Color(0xFFFFF7ED),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${f['originAddress']} → ${f['destAddress']}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 13.5)),
              ),
              Text('\$${price.toStringAsFixed(0)}',
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 15)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${f['cargoDescription']} · ${f['weightKg']} kg · ${f['vehicleType']}',
            style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: busy ? null : () => _take(f),
              icon: busy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.check_rounded, size: 18),
              label: Text(busy ? 'Tomando…' : 'Tomar flete'),
              style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFF59E0B)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _mineTile(Map<String, dynamic> f) {
    final status = f['status'] as String? ?? '';
    final done = status == 'COMPLETED';
    final price = (f['offeredPrice'] as num?)?.toDouble() ?? 0;
    final net = (f['netEarning'] as num?)?.toDouble();
    final phone = f['clientPhone'] as String?;
    final busy = _busyId == f['id'];

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade300),
        color: done ? Colors.grey.shade50 : Colors.white,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: done ? Colors.green.shade50 : Colors.amber.shade100,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  _statusLabel[status] ?? status,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color:
                        done ? Colors.green.shade700 : Colors.amber.shade900,
                  ),
                ),
              ),
              const Spacer(),
              Text('\$${price.toStringAsFixed(0)}',
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 15)),
            ],
          ),
          const SizedBox(height: 8),
          Text('${f['originAddress']} → ${f['destAddress']}',
              style: const TextStyle(
                  fontWeight: FontWeight.w600, fontSize: 13.5, height: 1.3)),
          // Mapa del trayecto en los estados activos (aceptado / en ruta): al
          // iniciar el viaje el conductor ve origen → destino en el mapa.
          if (status == 'ACCEPTED' || status == 'IN_PROGRESS') ...[
            const SizedBox(height: 8),
            Builder(builder: (_) {
              final map = FreightRouteMap.fromFreight(f);
              return map ?? const SizedBox.shrink();
            }),
          ],
          const SizedBox(height: 4),
          Text(
            '${f['cargoDescription']} · ${f['weightKg']} kg · ${f['vehicleType']}',
            style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
          ),
          if (!done && phone != null && phone.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Cliente: ${f['clientName'] ?? ''} · $phone',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
          ],
          if (done && net != null) ...[
            const SizedBox(height: 4),
            Text('Tu neto: \$${net.toStringAsFixed(0)}',
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: Colors.green.shade700)),
          ],
          // El conductor maneja el ciclo desde la app: iniciar y completar.
          if (status == 'ACCEPTED' || status == 'IN_PROGRESS') ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: busy
                    ? null
                    : () => status == 'ACCEPTED'
                        ? _updateStatus(f, 'in_progress')
                        : _confirmComplete(f),
                icon: busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : Icon(
                        status == 'ACCEPTED'
                            ? Icons.play_arrow_rounded
                            : Icons.flag_rounded,
                        size: 18),
                label: Text(busy
                    ? 'Enviando…'
                    : status == 'ACCEPTED'
                        ? 'Iniciar viaje'
                        : 'Completar entrega'),
                style: FilledButton.styleFrom(
                  backgroundColor: status == 'ACCEPTED'
                      ? const Color(0xFFF59E0B)
                      : const Color(0xFF059669),
                ),
              ),
            ),
            const SizedBox(height: 8),
            // Trazabilidad en ruta: el conductor registra tanqueos y paradas
            // para que la empresa tenga control total del trayecto.
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _openEventSheet(f),
                    icon: const Icon(Icons.local_gas_station_rounded, size: 17),
                    label: const Text('Tanqueo / parada'),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: () => _showEventLog(f),
                  icon: const Icon(Icons.receipt_long_rounded, size: 17),
                  label: const Text('Bitácora'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  // ── Trazabilidad: registrar evento y ver bitácora ─────────────────────────

  Future<void> _openEventSheet(Map<String, dynamic> f) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FreightEventSheet(freightId: f['id'] as String),
    );
    if (saved == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Evento registrado en la bitácora.')),
      );
    }
  }

  Future<void> _showEventLog(Map<String, dynamic> f) async {
    List<Map<String, dynamic>> events = const [];
    try {
      final res = await DioClient().get<Map<String, dynamic>>(
        '/driver/freight/${f['id']}/events',
      );
      events = ((res.data?['data'] as List<dynamic>?) ?? const [])
          .cast<Map<String, dynamic>>();
    } catch (_) {}
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Bitácora del flete'),
        content: SizedBox(
          width: double.maxFinite,
          child: events.isEmpty
              ? const Text(
                  'Aún no has registrado tanqueos ni paradas en este flete.')
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: events.length,
                  itemBuilder: (_, i) {
                    final e = events[i];
                    final type = e['type'] as String? ?? '';
                    final when = DateTime.tryParse(
                        e['createdAt'] as String? ?? '');
                    final icon = switch (type) {
                      'FUEL' => Icons.local_gas_station_rounded,
                      'STOP' => Icons.pause_circle_outline_rounded,
                      _ => Icons.sticky_note_2_outlined,
                    };
                    final title = switch (type) {
                      'FUEL' =>
                        'Tanqueo · \$${((e['amountCop'] as num?) ?? 0).toStringAsFixed(0)}',
                      'STOP' => 'Parada',
                      _ => 'Nota',
                    };
                    final parts = <String>[
                      if (when != null)
                        '${when.toLocal().hour.toString().padLeft(2, '0')}:${when.toLocal().minute.toString().padLeft(2, '0')}',
                      if (e['gallons'] != null) '${e['gallons']} gal',
                      if (e['odometerKm'] != null) '${e['odometerKm']} km',
                      if ((e['note'] as String?)?.isNotEmpty == true)
                        e['note'] as String,
                    ];
                    return ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(icon, size: 20),
                      title: Text(title,
                          style: const TextStyle(fontSize: 13.5)),
                      subtitle: parts.isEmpty
                          ? null
                          : Text(parts.join(' · '),
                              style: const TextStyle(fontSize: 12)),
                    );
                  },
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }
}

/// Sheet para registrar un evento del flete en ruta: tanqueo (monto/galones/
/// odómetro + foto del recibo), parada o nota. Adjunta la posición GPS actual
/// (best-effort) para la trazabilidad de la empresa.
class _FreightEventSheet extends StatefulWidget {
  const _FreightEventSheet({required this.freightId});

  final String freightId;

  @override
  State<_FreightEventSheet> createState() => _FreightEventSheetState();
}

class _FreightEventSheetState extends State<_FreightEventSheet> {
  String _type = 'FUEL';
  final _amountCtrl = TextEditingController();
  final _gallonsCtrl = TextEditingController();
  final _odoCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  XFile? _photo;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _amountCtrl.dispose();
    _gallonsCtrl.dispose();
    _odoCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final img = await ImagePicker()
        .pickImage(source: ImageSource.camera, imageQuality: 80);
    if (img != null && mounted) setState(() => _photo = img);
  }

  Future<void> _save() async {
    if (_type == 'FUEL' && double.tryParse(_amountCtrl.text.trim()) == null) {
      setState(() => _error = 'Escribe el monto del tanqueo en pesos.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });

    // Posición actual best-effort (no bloquea el registro si no hay GPS).
    double? lat;
    double? lng;
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.medium),
      ).timeout(const Duration(seconds: 6));
      lat = pos.latitude;
      lng = pos.longitude;
    } catch (_) {}

    try {
      final form = FormData.fromMap({
        'type': _type,
        if (lat != null) 'lat': lat.toString(),
        if (lng != null) 'lng': lng.toString(),
        if (_amountCtrl.text.trim().isNotEmpty)
          'amountCop': _amountCtrl.text.trim(),
        if (_gallonsCtrl.text.trim().isNotEmpty)
          'gallons': _gallonsCtrl.text.trim(),
        if (_odoCtrl.text.trim().isNotEmpty)
          'odometerKm': _odoCtrl.text.trim(),
        if (_noteCtrl.text.trim().isNotEmpty) 'note': _noteCtrl.text.trim(),
        if (_photo != null)
          'photo': MultipartFile.fromBytes(
            await _photo!.readAsBytes(),
            filename: 'evento.jpg',
            contentType: DioMediaType('image', 'jpeg'),
          ),
      });
      await DioClient().post<Map<String, dynamic>>(
        '/driver/freight/${widget.freightId}/events',
        data: form,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on DioException catch (e) {
      setState(() {
        _saving = false;
        _error = (e.response?.data as Map?)?['error'] as String? ??
            'No se pudo registrar el evento.';
      });
    } catch (_) {
      setState(() {
        _saving = false;
        _error = 'No se pudo registrar el evento.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isFuel = _type == 'FUEL';
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Registrar en la bitácora',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(
                  value: 'FUEL',
                  label: Text('Tanqueo'),
                  icon: Icon(Icons.local_gas_station_rounded, size: 16)),
              ButtonSegment(
                  value: 'STOP',
                  label: Text('Parada'),
                  icon: Icon(Icons.pause_circle_outline_rounded, size: 16)),
              ButtonSegment(
                  value: 'NOTE',
                  label: Text('Nota'),
                  icon: Icon(Icons.sticky_note_2_outlined, size: 16)),
            ],
            selected: {_type},
            onSelectionChanged: (s) => setState(() => _type = s.first),
          ),
          const SizedBox(height: 12),
          if (isFuel) ...[
            TextField(
              controller: _amountCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Monto (COP) *',
                prefixText: r'$ ',
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _gallonsCtrl,
                    keyboardType: TextInputType.number,
                    decoration:
                        const InputDecoration(labelText: 'Galones'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _odoCtrl,
                    keyboardType: TextInputType.number,
                    decoration:
                        const InputDecoration(labelText: 'Odómetro (km)'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
          TextField(
            controller: _noteCtrl,
            maxLines: 2,
            decoration: InputDecoration(
              labelText: isFuel
                  ? 'Estación / nota (opcional)'
                  : 'Descripción (dónde y por qué)',
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              OutlinedButton.icon(
                onPressed: _pickPhoto,
                icon: Icon(
                    _photo == null
                        ? Icons.photo_camera_outlined
                        : Icons.check_circle_rounded,
                    size: 17),
                label: Text(_photo == null ? 'Foto del recibo' : 'Foto lista'),
              ),
              const Spacer(),
              Text('Se guarda tu ubicación',
                  style:
                      TextStyle(fontSize: 11, color: Colors.grey.shade600)),
            ],
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_error!,
                  style: const TextStyle(color: Colors.red, fontSize: 12.5)),
            ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Guardando…' : 'Guardar en la bitácora'),
            ),
          ),
        ],
      ),
    );
  }
}
