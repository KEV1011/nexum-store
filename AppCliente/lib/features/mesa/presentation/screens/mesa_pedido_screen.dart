/// Cómo va el pedido de la mesa: los pasos de la cocina y, al servirse, la
/// calificación. Consulta la MISMA ruta que la carta web del QR.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/features/mesa/data/mesa_api.dart';
import 'package:nexum_client/features/mesa/domain/pedido_mesa.dart';
import 'package:nexum_client/features/mesa/presentation/mesa_providers.dart';

class MesaPedidoScreen extends ConsumerStatefulWidget {
  const MesaPedidoScreen({required this.codigo, required this.pedidoId, super.key});

  final String codigo;
  final String pedidoId;

  @override
  ConsumerState<MesaPedidoScreen> createState() => _MesaPedidoScreenState();
}

class _MesaPedidoScreenState extends ConsumerState<MesaPedidoScreen> {
  PedidoMesa? _pedido;
  String? _error;
  bool _noExiste = false;
  Timer? _sondeo;
  int _estrellas = 0;
  final _comentario = TextEditingController();
  bool _calificando = false;

  @override
  void initState() {
    super.initState();
    _cargar();
    // Cada 10 s, como la carta web: el aviso por push llega aparte, esto es
    // para quien tiene la pantalla abierta.
    _sondeo = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_pedido?.terminado ?? false) return;
      _cargar();
    });
  }

  @override
  void dispose() {
    _sondeo?.cancel();
    _comentario.dispose();
    super.dispose();
  }

  Future<void> _cargar() async {
    try {
      final p = await ref.read(mesaApiProvider).pedido(widget.codigo, widget.pedidoId);
      if (!mounted) return;
      setState(() {
        _pedido = p;
        _noExiste = p == null;
        _error = null;
        if (p?.calificacion != null && _estrellas == 0) _estrellas = p!.calificacion!;
      });
    } catch (e) {
      if (!mounted) return;
      // Con el pedido ya en pantalla, un sondeo fallido no lo tapa.
      if (_pedido == null) {
        setState(() => _error = mensajeDe(e, 'No pudimos consultar tu pedido.'));
      }
    }
  }

  Future<void> _calificar() async {
    if (_estrellas == 0) return;
    setState(() => _calificando = true);
    try {
      await ref.read(mesaApiProvider).calificar(
            widget.codigo,
            widget.pedidoId,
            _estrellas,
            _comentario.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('¡Gracias! Tu calificación quedó guardada.')),
      );
      await _cargar();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(mensajeDe(e, 'No se pudo guardar tu calificación.'))),
      );
    } finally {
      if (mounted) setState(() => _calificando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _pedido;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Volver',
          onPressed: () => safeBack(context, fallback: AppRoutes.splash),
        ),
        title: Text(p == null ? 'Tu pedido' : 'Pedido #${p.orderRef}'),
      ),
      body: _noExiste
          ? const Center(child: Text('No encontramos ese pedido.'))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!),
                      const SizedBox(height: AppConstants.spacingM),
                      OutlinedButton(onPressed: _cargar, child: const Text('Reintentar')),
                    ],
                  ),
                )
              : p == null
                  ? const Center(child: CircularProgressIndicator())
                  : _cuerpo(p),
    );
  }

  Widget _cuerpo(PedidoMesa p) {
    return ListView(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      children: [
        Text(
          p.negocio,
          style: TextStyle(color: context.textSecondaryColor, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 4),
        Text(
          p.estadoTexto,
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            color: context.textPrimaryColor,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          p.paraLlevar ? 'Para llevar · recoges en el mostrador' : 'Mesa ${p.mesa}',
          style: TextStyle(color: context.textSecondaryColor),
        ),
        if (p.prepMinutos != null && !p.terminado)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'La cocina calcula unos ${p.prepMinutos} min.',
              style: TextStyle(color: context.textSecondaryColor),
            ),
          ),
        const SizedBox(height: AppConstants.spacingL),
        for (final paso in p.pasos) _Paso(paso),
        const SizedBox(height: AppConstants.spacingL),
        for (final plato in p.platos)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(plato, style: TextStyle(color: context.textPrimaryColor)),
          ),
        const Divider(height: AppConstants.spacingL),
        Row(
          children: [
            const Expanded(child: Text('Total', style: TextStyle(fontWeight: FontWeight.w700))),
            Text(
              CurrencyFormatter.format(p.total),
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ],
        ),
        Text(
          'Lo pagas en el local.',
          style: TextStyle(color: context.textSecondaryColor, fontSize: 12.5),
        ),
        if (p.estado == 'delivered') ...[
          const SizedBox(height: AppConstants.spacingL),
          Text(
            p.calificacion == null ? '¿Qué tal estuvo?' : 'Tu calificación',
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          Row(
            children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  tooltip: i == 1 ? '1 estrella' : '$i estrellas',
                  iconSize: 32,
                  onPressed: () => setState(() => _estrellas = i),
                  icon: Icon(
                    i <= _estrellas ? Icons.star_rounded : Icons.star_outline_rounded,
                    color: AppColors.warning,
                  ),
                ),
            ],
          ),
          TextField(
            controller: _comentario,
            maxLength: 280,
            decoration: const InputDecoration(hintText: 'Cuéntale al local (opcional)'),
          ),
          FilledButton(
            onPressed: _estrellas == 0 || _calificando ? null : _calificar,
            child: Text(p.calificacion == null ? 'Calificar' : 'Corregir calificación'),
          ),
        ],
        if (!p.paraLlevar) ...[
          const SizedBox(height: AppConstants.spacingM),
          OutlinedButton(
            onPressed: () => context.go(
              AppRoutes.mesaCartaPath(widget.codigo, mesa: p.mesa),
            ),
            child: const Text('Pedir algo más'),
          ),
        ],
      ],
    );
  }
}

class _Paso extends StatelessWidget {
  const _Paso(this.paso);
  final PasoMesa paso;

  @override
  Widget build(BuildContext context) {
    final color = paso.estado == 'cancelado'
        ? AppColors.error
        : paso.hecho || paso.actual
            ? context.primaryTextColor
            : context.textTertiaryColor;
    final hora = paso.at == null
        ? null
        : '${paso.at!.hour.toString().padLeft(2, '0')}:'
            '${paso.at!.minute.toString().padLeft(2, '0')}';
    return Padding(
      padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
      child: Row(
        children: [
          Icon(
            paso.hecho
                ? Icons.check_circle_rounded
                : paso.actual
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_unchecked_rounded,
            color: color,
            size: 22,
          ),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Text(
              paso.titulo,
              style: TextStyle(
                fontWeight: paso.actual ? FontWeight.w800 : FontWeight.w600,
                color: paso.hecho || paso.actual
                    ? context.textPrimaryColor
                    : context.textSecondaryColor,
              ),
            ),
          ),
          if (hora != null) Text(hora, style: TextStyle(color: context.textSecondaryColor)),
        ],
      ),
    );
  }
}
