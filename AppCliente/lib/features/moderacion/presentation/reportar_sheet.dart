import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/features/moderacion/data/moderacion_api.dart';

// ── Reportar y bloquear ──────────────────────────────────────────────────────
//
// Apple 1.2 y la política de contenido de usuario de Play piden las dos cosas
// en cualquier app donde la gente se escriba o publique. Y no basta con que
// existan: tienen que estar DONDE está el contenido. Un ajuste escondido en la
// cuenta no cuenta — el revisor abre el chat y busca el botón ahí.
//
// La hoja es una sola para los seis sitios (mensaje, conductor, pasajero,
// reseña, producto, comercio) porque la decisión es siempre la misma y porque
// seis hojas parecidas se desincronizan en un mes.

/// Abre la hoja de reporte. Devuelve `true` si se envió algo.
///
/// [bloqueablePersonaId] activa la casilla de bloquear: solo tiene sentido
/// cuando el reporte es sobre una PERSONA con la que se puede volver a
/// coincidir. En una reseña o un producto no se ofrece, porque bloquear al
/// autor de una reseña no evita nada.
Future<bool> mostrarReporte(
  BuildContext context,
  WidgetRef ref, {
  required String tipo,
  required String objetivoId,
  required String queSeReporta,
  String? bloqueablePersonaId,
}) async {
  final enviado = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.surfaceColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _HojaReporte(
      ref: ref,
      tipo: tipo,
      objetivoId: objetivoId,
      queSeReporta: queSeReporta,
      bloqueablePersonaId: bloqueablePersonaId,
    ),
  );
  return enviado == true;
}

class _HojaReporte extends StatefulWidget {
  const _HojaReporte({
    required this.ref,
    required this.tipo,
    required this.objetivoId,
    required this.queSeReporta,
    this.bloqueablePersonaId,
  });

  final WidgetRef ref;
  final String tipo;
  final String objetivoId;
  final String queSeReporta;
  final String? bloqueablePersonaId;

  @override
  State<_HojaReporte> createState() => _HojaReporteState();
}

class _HojaReporteState extends State<_HojaReporte> {
  final _detalle = TextEditingController();
  List<MotivoReporte>? _motivos;
  String? _error;
  String? _elegido;
  bool _bloquear = false;
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  @override
  void dispose() {
    _detalle.dispose();
    super.dispose();
  }

  Future<void> _cargar() async {
    try {
      final m = await widget.ref.read(moderacionApiProvider).motivos();
      if (!mounted) return;
      setState(() => _motivos = m);
    } catch (_) {
      if (!mounted) return;
      // Sin lista no se puede reportar, y decirlo es mejor que enseñar una
      // hoja vacía que parece rota.
      setState(() => _error = 'No pudimos cargar los motivos. Revisa tu conexión.');
    }
  }

  Future<void> _enviar() async {
    final motivo = _elegido;
    if (motivo == null) return;
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      final api = widget.ref.read(moderacionApiProvider);
      await api.reportar(
        tipo: widget.tipo,
        objetivoId: widget.objetivoId,
        motivo: motivo,
        detalle: _detalle.text,
      );
      // El bloqueo va después del reporte y por separado: si el reporte falla
      // por validación, no queremos haber bloqueado a nadie sin querer; y si
      // el bloqueo fallara, el reporte ya está puesto, que es lo que importa.
      final personaId = widget.bloqueablePersonaId;
      if (_bloquear && personaId != null) {
        await api.bloquear(tipo: 'driver', id: personaId, motivo: motivo);
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on DioException catch (e) {
      if (!mounted) return;
      // El mensaje del servidor es el útil: dice qué falta («cuéntanos qué
      // pasó»), no un «error 400».
      final msg = (e.response?.data is Map)
          ? (e.response!.data as Map)['error'] as String?
          : null;
      setState(() {
        _enviando = false;
        _error = msg ?? 'No se pudo enviar. Intenta de nuevo.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _error = 'No se pudo enviar. Intenta de nuevo.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final motivos = _motivos;
    return SafeArea(
      child: Padding(
        // El teclado tapa el campo de detalle sin esto.
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 16,
          bottom: 20 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: context.appDividerColor,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                'Reportar ${widget.queSeReporta}',
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimaryColor,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Lo revisa una persona del equipo. No se le avisa a nadie de '
                'que fuiste tú.',
                style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
              ),
              const SizedBox(height: 18),

              if (motivos == null && _error == null)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 30),
                  child: Center(child: CircularProgressIndicator()),
                ),

              if (motivos != null)
                ...motivos.map((m) => RadioListTile<String>(
                      value: m.valor,
                      groupValue: _elegido,
                      onChanged: _enviando ? null : (v) => setState(() => _elegido = v),
                      title: Text(
                        m.etiqueta,
                        style: TextStyle(fontSize: 14.5, color: context.textPrimaryColor),
                      ),
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                    )),

              if (motivos != null) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: _detalle,
                  enabled: !_enviando,
                  maxLines: 3,
                  maxLength: 1000,
                  decoration: InputDecoration(
                    labelText: _elegido == 'otro' ? 'Cuéntanos qué pasó' : 'Detalle (opcional)',
                    border: const OutlineInputBorder(),
                  ),
                ),
                if (widget.bloqueablePersonaId != null)
                  CheckboxListTile(
                    value: _bloquear,
                    onChanged: _enviando ? null : (v) => setState(() => _bloquear = v ?? false),
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    title: Text(
                      'No volver a coincidir con esta persona',
                      style: TextStyle(fontSize: 14, color: context.textPrimaryColor),
                    ),
                    subtitle: Text(
                      'No te asignaremos más servicios juntos. Puedes deshacerlo '
                      'desde tu cuenta.',
                      style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
                    ),
                  ),
              ],

              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8, bottom: 4),
                  child: Text(
                    _error!,
                    style: const TextStyle(fontSize: 13, color: Color(0xFFDC2626)),
                  ),
                ),

              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: _enviando ? null : () => Navigator.of(context).pop(false),
                      child: const Text('Cancelar'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: (_elegido == null || _enviando) ? null : _enviar,
                      child: _enviando
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Enviar reporte'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
