import 'package:flutter/material.dart';
import 'package:nexum_driver/core/network/dio_client.dart';

/// Fletes de carga asignados al conductor por su flota (GET /driver/freights).
///
/// La empresa/dueño toma el flete en su portal y asigna conductor + vehículo;
/// aquí el conductor ve QUÉ lleva, de dónde a dónde, cuándo y el contacto del
/// cliente. Los cambios de estado (en ruta / completado) los gestiona la flota
/// desde el portal — esta vista es informativa para operar la carga.
class DriverFreightsScreen extends StatefulWidget {
  const DriverFreightsScreen({super.key});

  @override
  State<DriverFreightsScreen> createState() => _DriverFreightsScreenState();
}

class _DriverFreightsScreenState extends State<DriverFreightsScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _freights = const [];

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
      final res =
          await DioClient().get<Map<String, dynamic>>('/driver/freights');
      final data = (res.data?['data'] as List?)?.cast<Map<String, dynamic>>();
      if (mounted && data != null) setState(() => _freights = data);
    } catch (_) {
      // sin conexión: lista vacía con mensaje honesto
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mis fletes de carga')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _freights.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      const SizedBox(height: 48),
                      Icon(Icons.local_shipping_outlined,
                          size: 56, color: Colors.grey.shade400),
                      const SizedBox(height: 12),
                      Text(
                        'Sin fletes asignados.\nCuando tu flota te asigne una '
                        'carga, aparecerá aquí.',
                        textAlign: TextAlign.center,
                        style:
                            TextStyle(color: Colors.grey.shade600, height: 1.4),
                      ),
                    ],
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _freights.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, i) => _tile(_freights[i]),
                  ),
      ),
    );
  }

  Widget _tile(Map<String, dynamic> f) {
    final status = f['status'] as String? ?? '';
    final done = status == 'COMPLETED';
    final price = (f['offeredPrice'] as num?)?.toDouble() ?? 0;
    final net = (f['netEarning'] as num?)?.toDouble();
    final phone = f['clientPhone'] as String?;
    final scheduled = f['scheduledFor'] as String?;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: done ? Colors.grey.shade300 : const Color(0xFFFDBA74),
        ),
        color: done ? Colors.grey.shade50 : const Color(0xFFFFF7ED),
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
                    color: done
                        ? Colors.green.shade700
                        : Colors.amber.shade900,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                '\$${price.toStringAsFixed(0)}',
                style: const TextStyle(
                    fontWeight: FontWeight.w800, fontSize: 15),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '${f['originAddress']} → ${f['destAddress']}',
            style: const TextStyle(
                fontWeight: FontWeight.w600, fontSize: 13.5, height: 1.3),
          ),
          const SizedBox(height: 4),
          Text(
            '${f['cargoDescription']} · ${f['weightKg']} kg · ${f['vehicleType']}',
            style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
          ),
          if (scheduled != null) ...[
            const SizedBox(height: 2),
            Text(
              'Programado: ${scheduled.substring(0, 16).replaceAll('T', ' ')}',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ],
          if (!done && phone != null && phone.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'Cliente: ${f['clientName'] ?? ''} · $phone',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
            ),
          ],
          if (done && net != null) ...[
            const SizedBox(height: 4),
            Text(
              'Tu neto: \$${net.toStringAsFixed(0)}',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: Colors.green.shade700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
