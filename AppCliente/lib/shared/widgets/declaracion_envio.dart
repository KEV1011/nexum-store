/// Quién entrega el paquete y qué declara que va dentro.
///
/// UNA SOLA IMPLEMENTACIÓN PARA LOS DOS CAMINOS. El envío urbano y el flete
/// de carga piden exactamente lo mismo y lo valida el mismo código del
/// servidor (`lib/remitente`). Dos formularios acabarían pidiendo cosas
/// distintas y uno de los dos mandaría algo que el backend rechaza.
///
/// EL CATÁLOGO Y LA LISTA SALEN DEL SERVIDOR (`GET /legal/envios`), no de
/// una lista escrita aquí: añadir una categoría no puede exigir que medio
/// pueblo actualice el APK, y dos listas acabarían ofreciendo opciones que
/// el servidor rechaza.
///
/// Mientras la lista no cargue, el formulario NO se dibuja a medias: sin
/// poder leer qué no se transporta, aceptar la casilla no significaría
/// nada.
library;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/app_colors.dart';

/// Lo que el formulario entrega cuando está completo.
class DatosDeEnvio {
  const DatosDeEnvio({required this.remitente, required this.declaracion});

  final Map<String, dynamic> remitente;
  final Map<String, dynamic> declaracion;
}

class _Categoria {
  const _Categoria(this.valor, this.etiqueta);
  final String valor;
  final String etiqueta;
}

class _NoAdmitido {
  const _NoAdmitido(this.que, this.porque);
  final String que;
  final String porque;
}

class DeclaracionEnvio extends StatefulWidget {
  const DeclaracionEnvio({
    required this.dio,
    required this.onChanged,
    super.key,
  });

  final Dio dio;

  /// `null` mientras falte algo. El padre apaga su botón con esto.
  final ValueChanged<DatosDeEnvio?> onChanged;

  @override
  State<DeclaracionEnvio> createState() => _DeclaracionEnvioState();
}

class _DeclaracionEnvioState extends State<DeclaracionEnvio> {
  final _nombre = TextEditingController();
  final _documento = TextEditingController();
  final _valor = TextEditingController();
  String _tipoDoc = 'CC';
  String? _categoria;
  bool _acepta = false;

  List<_Categoria> _categorias = const [];
  List<_NoAdmitido> _noAdmitido = const [];
  bool _cargando = true;
  bool _fallo = false;

  @override
  void initState() {
    super.initState();
    _nombre.addListener(_recalcular);
    _documento.addListener(_recalcular);
    _valor.addListener(_recalcular);
    _cargar();
  }

  @override
  void dispose() {
    _nombre.dispose();
    _documento.dispose();
    _valor.dispose();
    super.dispose();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _fallo = false;
    });
    try {
      final r = await widget.dio.get<Map<String, dynamic>>('/legal/envios');
      final d = r.data?['data'] as Map<String, dynamic>?;
      final cats = (d?['categorias'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map((m) => _Categoria(m['valor'] as String? ?? '', m['etiqueta'] as String? ?? ''))
          .where((c) => c.valor.isNotEmpty)
          .toList();
      final lista = (d?['noAdmitido'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map((m) => _NoAdmitido(m['que'] as String? ?? '', m['porque'] as String? ?? ''))
          .where((n) => n.que.isNotEmpty)
          .toList();
      if (!mounted) return;
      if (cats.isEmpty || lista.isEmpty) {
        setState(() {
          _cargando = false;
          _fallo = true;
        });
        return;
      }
      setState(() {
        _categorias = cats;
        _noAdmitido = lista;
        _cargando = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _cargando = false;
        _fallo = true;
      });
    }
  }

  /// Solo dígitos del documento: así «1.090.123-4» y «10901234» se miden
  /// igual, exactamente como lo hace el servidor.
  String get _docLimpio => _documento.text.replaceAll(RegExp(r'[\s.\-]'), '');

  void _recalcular() {
    final nombre = _nombre.text.trim();
    final cat = _categoria;
    final completo =
        nombre.length >= 3 && _docLimpio.length >= 4 && cat != null && _acepta;
    if (!completo) {
      widget.onChanged(null);
      return;
    }
    final valor = int.tryParse(_valor.text.replaceAll(RegExp(r'[^0-9]'), ''));
    widget.onChanged(DatosDeEnvio(
      remitente: {
        'tipoDoc': _tipoDoc,
        'documento': _documento.text.trim(),
        'nombre': nombre,
      },
      declaracion: {
        'categoria': cat,
        'aceptaRestricciones': true,
        if (valor != null && valor > 0) 'valorDeclarado': valor,
      },
    ));
  }

  void _verLista() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        maxChildSize: 0.92,
        builder: (_, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
          children: [
            const Text(
              'Lo que no podemos transportar',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 19,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Si va algo de esta lista, el que responde es quien conduce.',
              style: TextStyle(fontSize: 13, color: ctx.textSecondaryColor),
            ),
            const SizedBox(height: 16),
            for (final n in _noAdmitido)
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 2),
                      child: Icon(Icons.block_rounded,
                          size: 17, color: AppColors.error),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            n.que,
                            style: const TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 14.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          // El POR QUÉ va siempre al lado: «prohibido» a
                          // secas se lee como burocracia y se salta.
                          Text(
                            n.porque,
                            style: TextStyle(
                              fontSize: 12.5,
                              height: 1.35,
                              color: ctx.textSecondaryColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: SizedBox(
            width: 20, height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }

    if (_fallo) {
      // Sin la lista no se dibuja el formulario: aceptar una casilla que
      // remite a algo que no se pudo leer no significa nada.
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.error.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
        ),
        child: Row(
          children: [
            const Icon(Icons.wifi_off_rounded, size: 18, color: AppColors.error),
            const SizedBox(width: 10),
            const Expanded(
              child: Text(
                'No pudimos cargar las condiciones del envío.',
                style: TextStyle(fontSize: 13),
              ),
            ),
            TextButton(onPressed: _cargar, child: const Text('Reintentar')),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Quien entrega el paquete',
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: context.textPrimaryColor,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'No tiene que ser quien pide el envío: puede ser quien se lo pasa '
          'al mensajero en la puerta.',
          style: TextStyle(fontSize: 12.5, color: context.textTertiaryColor),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _nombre,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: 'Nombre completo',
            prefixIcon: Icon(Icons.badge_outlined),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 104,
              child: DropdownButtonFormField<String>(
                initialValue: _tipoDoc,
                decoration: const InputDecoration(labelText: 'Tipo'),
                items: const [
                  DropdownMenuItem(value: 'CC', child: Text('C.C.')),
                  DropdownMenuItem(value: 'TI', child: Text('T.I.')),
                  DropdownMenuItem(value: 'CE', child: Text('C.E.')),
                  DropdownMenuItem(value: 'PA', child: Text('Pasap.')),
                ],
                onChanged: (v) {
                  if (v == null) return;
                  setState(() => _tipoDoc = v);
                  _recalcular();
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextFormField(
                controller: _documento,
                keyboardType: TextInputType.text,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9A-Za-z.\-]')),
                ],
                decoration: const InputDecoration(
                  labelText: 'Número de documento',
                  prefixIcon: Icon(Icons.credit_card_outlined),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Text(
          'Qué va dentro',
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: context.textPrimaryColor,
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _categoria,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Tipo de mercancía',
            prefixIcon: Icon(Icons.category_outlined),
          ),
          items: [
            for (final c in _categorias)
              DropdownMenuItem(value: c.valor, child: Text(c.etiqueta)),
          ],
          onChanged: (v) {
            setState(() => _categoria = v);
            _recalcular();
          },
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _valor,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
            labelText: 'Cuánto vale (opcional)',
            prefixIcon: Icon(Icons.attach_money_rounded),
            // Decirlo aquí y no en letra pequeña: prometer un seguro que
            // nadie contrató es la peor forma de perder a un cliente.
            helperText: 'Sirve para sustentar un reclamo. No es un seguro.',
            helperMaxLines: 2,
          ),
        ),
        const SizedBox(height: 8),
        CheckboxListTile(
          value: _acepta,
          onChanged: (v) {
            setState(() => _acepta = v ?? false);
            _recalcular();
          },
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          dense: true,
          title: Text(
            'Declaro que lo que envío no está en la lista de mercancía '
            'que no se transporta.',
            style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
          ),
          subtitle: Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: _verLista,
              style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('Ver la lista'),
            ),
          ),
        ),
      ],
    );
  }
}
