import 'package:flutter/material.dart';
import 'package:nexum_driver/core/network/dio_client.dart';

/// Fletes de carga del conductor: los que puede TOMAR (abiertos, para su flota
/// y sus camiones) y los que ya tiene ASIGNADOS.
///
/// - Disponibles: GET /driver/freight/available → { freights, vehicles }.
///   Toma con POST /driver/freight/:id/take { vehicleId } (elige camión).
/// - Asignados: GET /driver/freights (ACCEPTED/IN_PROGRESS/COMPLETED).
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

  @override
  void initState() {
    super.initState();
    _load();
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
        ],
      ),
    );
  }
}
