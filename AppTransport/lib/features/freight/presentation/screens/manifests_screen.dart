import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/core/utils/safe_back.dart';

/// Remitos de mercancía que lleva el conductor.
///
/// Sustituye la hoja de papel que hoy viaja en la cabina. Lo importante no es
/// verla en pantalla: es que al entregar se concilie bulto por bulto. El papel
/// solo decía "recibido a satisfacción" y firmaban; si faltaba un rollo, la
/// discusión llegaba semanas después y sin pruebas.
class ManifestsScreen extends ConsumerStatefulWidget {
  const ManifestsScreen({super.key});

  @override
  ConsumerState<ManifestsScreen> createState() => _ManifestsScreenState();
}

class _ManifestsScreenState extends ConsumerState<ManifestsScreen> {
  List<Map<String, dynamic>> _remitos = [];
  bool _cargando = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaitedCargar();
  }

  void unawaitedCargar() {
    // ignore: discarded_futures — carga inicial en segundo plano.
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final res = await DioClient().dio
          .get<Map<String, dynamic>>('/driver/manifests');
      final lista = (res.data?['data'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        _remitos = lista;
        _cargando = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _cargando = false;
        _error = 'No pudimos cargar tus remitos. Revisa tu conexión.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        title: const Text('Remitos de mercancía'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => safeBack(context, '/home'),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _cargar,
        child: _cargando
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? _Mensaje(texto: _error!)
                : _remitos.isEmpty
                    ? const _Mensaje(
                        texto: 'No llevas remitos por ahora.\n\n'
                            'Cuando tu empresa te despache mercancía, aparecerá '
                            'aquí con el detalle de cada bulto.',
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _remitos.length,
                        itemBuilder: (_, i) => _TarjetaRemito(
                          remito: _remitos[i],
                          onEntregado: _cargar,
                        ),
                      ),
      ),
    );
  }
}

class _Mensaje extends StatelessWidget {
  const _Mensaje({required this.texto});
  final String texto;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(32),
      children: [
        const SizedBox(height: 60),
        Icon(Icons.assignment_outlined,
            size: 48, color: context.textSecondaryColor),
        const SizedBox(height: 12),
        Text(texto,
            textAlign: TextAlign.center,
            style: TextStyle(color: context.textSecondaryColor, height: 1.4)),
      ],
    );
  }
}

// ── Tarjeta ───────────────────────────────────────────────────────────────────

class _TarjetaRemito extends StatelessWidget {
  const _TarjetaRemito({required this.remito, required this.onEntregado});

  final Map<String, dynamic> remito;
  final Future<void> Function() onEntregado;

  @override
  Widget build(BuildContext context) {
    final estado = remito['status'] as String? ?? 'DISPATCHED';
    final entregado = estado == 'RECEIVED';
    final unidad = remito['unitLabel'] as String? ?? 'bulto';
    final medida = remito['measureLabel'] as String? ?? 'unidades';
    final total = (remito['totalMeasure'] as num?)?.toDouble() ?? 0;
    final bultos = (remito['totalItems'] as num?)?.toInt() ?? 0;
    final diferencias = (remito['discrepancyCount'] as num?)?.toInt() ?? 0;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${remito['code']}'
                    '${remito['reference'] != null ? ' · ${remito['reference']}' : ''}',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      color: context.textPrimaryColor,
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: entregado
                        ? (diferencias > 0
                            ? Colors.red.shade50
                            : Colors.green.shade50)
                        : Colors.amber.shade50,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    entregado
                        ? (diferencias > 0
                            ? '$diferencias novedad${diferencias > 1 ? 'es' : ''}'
                            : 'Entregado')
                        : 'En ruta',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: entregado
                          ? (diferencias > 0
                              ? Colors.red.shade700
                              : Colors.green.shade700)
                          : Colors.amber.shade800,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Para ${remito['clientName']}'
              '${remito['clientCity'] != null ? ' · ${remito['clientCity']}' : ''}',
              style: TextStyle(color: context.textSecondaryColor, fontSize: 13),
            ),
            const SizedBox(height: 2),
            Text(
              '$bultos ${unidad}s · ${total.toStringAsFixed(1)} $medida',
              style: TextStyle(
                color: context.textPrimaryColor,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (entregado) ...[
              const SizedBox(height: 6),
              Text(
                'Recibió: ${remito['receivedByName'] ?? '—'}',
                style:
                    TextStyle(color: context.textSecondaryColor, fontSize: 12),
              ),
            ],
            if (!entregado) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () async {
                    final ok = await Navigator.of(context).push<bool>(
                      MaterialPageRoute(
                        builder: (_) => _EntregaScreen(remito: remito),
                      ),
                    );
                    if (ok == true) await onEntregado();
                  },
                  icon: const Icon(Icons.assignment_turned_in_outlined),
                  label: const Text('Registrar entrega'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Conciliación de la entrega ────────────────────────────────────────────────

class _EntregaScreen extends StatefulWidget {
  const _EntregaScreen({required this.remito});
  final Map<String, dynamic> remito;

  @override
  State<_EntregaScreen> createState() => _EntregaScreenState();
}

class _EntregaScreenState extends State<_EntregaScreen> {
  final _nombreCtrl = TextEditingController();
  final _cedulaCtrl = TextEditingController();
  // position -> {status, receivedMeasure, note}. Solo se guardan las novedades:
  // lo que no se toca se da por conforme, para que registrar una entrega normal
  // no obligue a tocar 17 bultos parado en la calle.
  final Map<int, Map<String, dynamic>> _novedades = {};
  bool _enviando = false;

  @override
  void dispose() {
    _nombreCtrl.dispose();
    _cedulaCtrl.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> get _items =>
      (widget.remito['items'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>();

  Future<void> _enviar() async {
    if (_nombreCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Escribe el nombre de quien recibe.')),
      );
      return;
    }
    setState(() => _enviando = true);
    try {
      await DioClient().dio.post<Map<String, dynamic>>(
        '/driver/manifests/${widget.remito['id']}/receive',
        data: {
          'receivedByName': _nombreCtrl.text.trim(),
          if (_cedulaCtrl.text.trim().isNotEmpty)
            'receivedByIdNumber': _cedulaCtrl.text.trim(),
          'items': _novedades.entries
              .map((e) => {'position': e.key, ...e.value})
              .toList(),
        },
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _enviando = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo registrar la entrega. $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final unidad = widget.remito['unitLabel'] as String? ?? 'bulto';
    final medida = widget.remito['measureLabel'] as String? ?? 'unidades';

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(title: Text('Entrega ${widget.remito['code']}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Marca solo los ${unidad}s con novedad. Los demás quedan como '
            'recibidos completos.',
            style: TextStyle(color: context.textSecondaryColor, fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nombreCtrl,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Nombre de quien recibe',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _cedulaCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Cédula (opcional)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 20),
          Text('Bultos', style: TextStyle(
            fontWeight: FontWeight.w700, color: context.textPrimaryColor)),
          const SizedBox(height: 8),
          ..._items.map((it) {
            final pos = (it['position'] as num).toInt();
            final declarado = (it['measure'] as num).toDouble();
            final nov = _novedades[pos];
            return _FilaBulto(
              position: pos,
              declarado: declarado,
              unidad: unidad,
              medida: medida,
              novedad: nov,
              onCambio: (n) => setState(() {
                if (n == null) {
                  _novedades.remove(pos);
                } else {
                  _novedades[pos] = n;
                }
              }),
            );
          }),
          const SizedBox(height: 20),
          if (_novedades.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '${_novedades.length} novedad${_novedades.length > 1 ? 'es' : ''} '
                'quedará${_novedades.length > 1 ? 'n' : ''} registrada'
                '${_novedades.length > 1 ? 's' : ''} en el remito.',
                style: TextStyle(
                    color: Colors.red.shade800, fontWeight: FontWeight.w600),
              ),
            ),
          FilledButton(
            onPressed: _enviando ? null : _enviar,
            child: _enviando
                ? const SizedBox(
                    height: 18, width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Confirmar entrega'),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _FilaBulto extends StatelessWidget {
  const _FilaBulto({
    required this.position,
    required this.declarado,
    required this.unidad,
    required this.medida,
    required this.novedad,
    required this.onCambio,
  });

  final int position;
  final double declarado;
  final String unidad;
  final String medida;
  final Map<String, dynamic>? novedad;
  final ValueChanged<Map<String, dynamic>?> onCambio;

  @override
  Widget build(BuildContext context) {
    final estado = novedad?['status'] as String?;
    final conNovedad = estado != null;

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: conNovedad ? Colors.red.shade50 : context.surfaceColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: conNovedad ? Colors.red.shade200 : context.outlineColor,
        ),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Text('$position',
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: context.textSecondaryColor)),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${declarado.toStringAsFixed(1)} $medida',
                    style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: context.textPrimaryColor)),
                if (conNovedad)
                  Text(
                    estado == 'MISSING'
                        ? 'No llegó'
                        : estado == 'DAMAGED'
                            ? 'Averiado'
                            : 'Llegó con ${novedad?['receivedMeasure'] ?? 0} $medida',
                    style: TextStyle(
                        fontSize: 12, color: Colors.red.shade700),
                  ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            icon: Icon(
              conNovedad ? Icons.error_outline : Icons.check_circle_outline,
              color: conNovedad ? Colors.red : Colors.green,
            ),
            onSelected: (v) async {
              if (v == 'OK') {
                onCambio(null);
                return;
              }
              if (v == 'SHORT') {
                final m = await _pedirMedida(context, declarado, medida);
                if (m == null) return;
                onCambio({'status': 'SHORT', 'receivedMeasure': m});
                return;
              }
              onCambio({'status': v});
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'OK', child: Text('Recibido completo')),
              PopupMenuItem(value: 'SHORT', child: Text('Llegó con menos')),
              PopupMenuItem(value: 'MISSING', child: Text('No llegó')),
              PopupMenuItem(value: 'DAMAGED', child: Text('Averiado')),
            ],
          ),
        ],
      ),
    );
  }

  Future<double?> _pedirMedida(
      BuildContext context, double declarado, String medida) async {
    final ctrl = TextEditingController();
    return showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('¿Cuánto llegó?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Declarado: ${declarado.toStringAsFixed(1)} $medida'),
            const SizedBox(height: 10),
            TextField(
              controller: ctrl,
              autofocus: true,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: 'Medida recibida ($medida)',
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () {
              final v = double.tryParse(ctrl.text.replaceAll(',', '.'));
              Navigator.of(ctx).pop(v);
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }
}
