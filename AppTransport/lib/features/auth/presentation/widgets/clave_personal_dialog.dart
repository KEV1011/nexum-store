import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';

/// Pide la clave personal al entrar. Devuelve la clave escrita, o `null` si el
/// conductor cerró el diálogo (entonces el ingreso no sigue).
///
/// La clave existe porque, sin SMS, el código del login es el mismo para
/// todos: es lo que impide que alguien que sepa tu número entre a tu cuenta.
Future<String?> pedirClavePersonal(BuildContext context, {String? error}) {
  return showDialog<String>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _ClaveDialog(error: error),
  );
}

class _ClaveDialog extends StatefulWidget {
  const _ClaveDialog({this.error});
  final String? error;

  @override
  State<_ClaveDialog> createState() => _ClaveDialogState();
}

class _ClaveDialogState extends State<_ClaveDialog> {
  final _ctrl = TextEditingController();
  late String? _error = widget.error;
  bool _ver = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _confirmar() {
    final c = _ctrl.text.trim();
    if (c.length < 4) {
      setState(() => _error = 'La clave tiene de 4 a 6 números.');
      return;
    }
    Navigator.of(context).pop(c);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: const Row(
        children: [
          Icon(Icons.lock_outline_rounded, color: AppColors.primary),
          SizedBox(width: 10),
          Flexible(child: Text('Tu clave personal')),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Escribe la clave de 4 a 6 números que creaste para tu cuenta.',
            style: TextStyle(fontSize: 14, height: 1.35),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _ctrl,
            autofocus: true,
            obscureText: !_ver,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            maxLength: 6,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            onChanged: (_) {
              if (_error != null) setState(() => _error = null);
            },
            onSubmitted: (_) => _confirmar(),
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.bold,
              letterSpacing: 10,
            ),
            decoration: InputDecoration(
              counterText: '',
              errorText: _error,
              errorMaxLines: 3,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              suffixIcon: IconButton(
                tooltip: _ver ? 'Ocultar la clave' : 'Mostrar la clave',
                icon: Icon(_ver ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                onPressed: () => setState(() => _ver = !_ver),
              ),
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            '¿La olvidaste? Escríbenos a soporte y la restablecemos.',
            style: TextStyle(fontSize: 12, height: 1.3),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: _confirmar,
          child: const Text('Entrar'),
        ),
      ],
    );
  }
}
