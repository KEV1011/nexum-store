import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/safe_back.dart';

/// Muestra el documento legal VIGENTE que sirve el backend.
///
/// No es una copia dentro de la app a propósito. Los documentos están
/// versionados en el servidor y de cada aceptación queda constancia con su
/// versión: si la app llevara su propio texto, en cuanto se publicara una
/// versión nueva enseñaría una cosa distinta de la que el usuario aceptó, que
/// es justo lo que un documento legal no puede permitirse.
class LegalDocScreen extends ConsumerStatefulWidget {
  const LegalDocScreen({required this.kind, super.key});

  /// 'terms' o 'privacy'.
  final String kind;

  @override
  ConsumerState<LegalDocScreen> createState() => _LegalDocScreenState();
}

class _LegalDocScreenState extends ConsumerState<LegalDocScreen> {
  bool _cargando = true;
  String? _error;
  String _titulo = '';
  String _cuerpo = '';
  String _version = '';
  DateTime? _publicado;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final res = await ref.read(apiClientProvider).get<Map<String, dynamic>>(
            '/legal/${widget.kind}',
          );
      final d = res.data?['data'] as Map<String, dynamic>?;
      if (d == null) throw Exception('respuesta vacía');
      if (!mounted) return;
      setState(() {
        _titulo = (d['title'] as String?) ?? 'Documento';
        _cuerpo = (d['body'] as String?) ?? '';
        _version = (d['version'] as String?) ?? '';
        _publicado = d['publishedAt'] != null
            ? DateTime.tryParse(d['publishedAt'] as String)
            : null;
        _cargando = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _cargando = false;
        _error = e is DioException && e.type == DioExceptionType.connectionError
            ? 'Sin conexión. Conéctate a internet para leer el documento.'
            : 'No pudimos cargar el documento. Inténtalo de nuevo.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.kind == 'terms'
            ? 'Términos de servicio'
            : 'Política de privacidad'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => safeBack(context),
        ),
      ),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _estadoError()
              : _documento(),
    );
  }

  Widget _estadoError() => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off_rounded,
                  size: 44, color: Theme.of(context).disabledColor),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _cargar,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Reintentar'),
              ),
            ],
          ),
        ),
      );

  Widget _documento() => ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
        children: [
          Text(
            _titulo,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          // La versión importa: es la que queda en la constancia de aceptación.
          Text(
            [
              if (_version.isNotEmpty) 'Versión $_version',
              if (_publicado != null)
                'Publicada el ${_publicado!.day}/${_publicado!.month}/${_publicado!.year}',
            ].join(' · '),
            style: TextStyle(
              fontSize: 12,
              color: Theme.of(context).textTheme.bodySmall?.color,
            ),
          ),
          const SizedBox(height: 18),
          SelectableText(_cuerpo, style: const TextStyle(fontSize: 14, height: 1.55)),
        ],
      );
}
