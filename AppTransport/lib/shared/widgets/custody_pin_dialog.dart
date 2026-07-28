import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';

/// Fase de la cadena de custodia: al recoger la mercancía o al entregarla.
enum CustodyPinPhase { pickup, delivery }

/// Pide el PIN de custodia de 4 dígitos que debe dictar la otra persona.
///
/// Devuelve el PIN escrito, o `null` si el conductor cerró el diálogo (en cuyo
/// caso el servicio NO debe avanzar de estado).
///
/// El PIN no se valida aquí: lo comprueba el backend, que es el único que lo
/// conoce. Si lo rechaza, se vuelve a abrir este diálogo con [errorText].
Future<String?> showCustodyPinDialog(
  BuildContext context, {
  required CustodyPinPhase phase,
  String? errorText,
}) {
  return showDialog<String>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _CustodyPinDialog(phase: phase, errorText: errorText),
  );
}

class _CustodyPinDialog extends StatefulWidget {
  const _CustodyPinDialog({required this.phase, this.errorText});

  final CustodyPinPhase phase;
  final String? errorText;

  @override
  State<_CustodyPinDialog> createState() => _CustodyPinDialogState();
}

class _CustodyPinDialogState extends State<_CustodyPinDialog> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void initState() {
    super.initState();
    _error = widget.errorText;
    _controller.addListener(() {
      if (_error != null) setState(() => _error = null);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _isPickup => widget.phase == CustodyPinPhase.pickup;

  String get _titulo => _isPickup ? 'PIN de recogida' : 'PIN de entrega';

  String get _instruccion => _isPickup
      ? 'Pide el PIN de 4 dígitos a quien te entrega el paquete y escríbelo aquí.'
      : 'Pide el PIN de 4 dígitos a quien recibe el paquete y escríbelo aquí.';

  void _confirm() {
    final pin = _controller.text.trim();
    if (pin.length != 4) {
      setState(() => _error = 'El PIN son 4 dígitos.');
      return;
    }
    Navigator.of(context).pop(pin);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: Row(
        children: [
          Icon(
            _isPickup ? Icons.inventory_2_outlined : Icons.verified_user_outlined,
            color: AppColors.primary,
          ),
          const SizedBox(width: 10),
          Text(_titulo),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _instruccion,
            style: const TextStyle(fontSize: 14, height: 1.35),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            autofocus: true,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            maxLength: 4,
            style: const TextStyle(
              fontSize: 30,
              fontWeight: FontWeight.bold,
              letterSpacing: 14,
            ),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            onSubmitted: (_) => _confirm(),
            decoration: InputDecoration(
              counterText: '',
              hintText: '••••',
              errorText: _error,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: _confirm,
          child: const Text('Confirmar'),
        ),
      ],
    );
  }
}
