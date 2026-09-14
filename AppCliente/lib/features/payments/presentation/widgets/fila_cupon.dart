import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';

/// La fila del cupón, encima del botón de pedir.
///
/// Va aquí y no en una pantalla aparte por la misma razón que el método de
/// pago: lo que cambia el precio tiene que verse ANTES de confirmar. Un
/// descuento que solo aparece en el recibo llega tarde para decidir.
///
/// Tiene tres estados y los tres se ven distintos a propósito: sin cupón
/// invita a poner uno, con cupón aplicado enseña cuánto se ahorra y cómo
/// quitarlo, y con error dice qué pasó — un código rechazado en silencio hace
/// que la persona lo escriba tres veces.
class FilaCupon extends StatelessWidget {
  const FilaCupon({
    required this.onAplicar,
    required this.onQuitar,
    this.codigo,
    this.descuento = 0,
    this.error,
    this.cargando = false,
    super.key,
  });

  /// El código aplicado, o null si no hay ninguno.
  final String? codigo;

  /// Lo que descuenta, en pesos.
  final int descuento;

  /// Por qué se rechazó el último código que se intentó.
  final String? error;

  final bool cargando;
  final ValueChanged<String> onAplicar;
  final VoidCallback onQuitar;

  bool get _aplicado => codigo != null && descuento > 0;

  @override
  Widget build(BuildContext context) {
    if (_aplicado) return _vistaAplicado(context);
    return _vistaSinCupon(context);
  }

  Widget _vistaAplicado(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1B8A5A).withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF1B8A5A).withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.local_offer_rounded, size: 20, color: Color(0xFF1B8A5A)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Se aplicó ${CurrencyFormatter.format(descuento.toDouble())} '
                  'de descuento',
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF126943),
                  ),
                ),
                Text(
                  codigo!,
                  style: TextStyle(fontSize: 11.5, color: context.textSecondaryColor),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: cargando ? null : onQuitar,
            child: const Text('Quitar'),
          ),
        ],
      ),
    );
  }

  Widget _vistaSinCupon(BuildContext context) {
    return Material(
      color: context.surfaceVariantColor,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: cargando ? null : () => _pedirCodigo(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Icon(Icons.local_offer_outlined,
                  size: 20, color: context.textSecondaryColor),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Agregar código del cupón',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: context.textPrimaryColor,
                      ),
                    ),
                    if (error != null)
                      Text(
                        error!,
                        style: const TextStyle(
                          fontSize: 11.5,
                          color: Color(0xFFC62828),
                        ),
                      ),
                  ],
                ),
              ),
              if (cargando)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pedirCodigo(BuildContext context) async {
    final ctrl = TextEditingController();
    final codigo = await showDialog<String>(
      context: context,
      builder: (dialogo) => AlertDialog(
        title: const Text('Código del cupón'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(hintText: 'NX-ABC123'),
          onSubmitted: (v) => Navigator.of(dialogo).pop(v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogo).pop(),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogo).pop(ctrl.text),
            child: const Text('Aplicar'),
          ),
        ],
      ),
    );
    final limpio = (codigo ?? '').trim();
    if (limpio.isNotEmpty) onAplicar(limpio);
  }
}
