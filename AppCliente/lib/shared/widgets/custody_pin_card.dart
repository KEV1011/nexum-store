import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Tarjeta que muestra un PIN de custodia de 4 dígitos al cliente.
///
/// El cliente se lo dicta al conductor en el momento de la entrega (o de la
/// recogida, según [label]): sin ese PIN el conductor no puede cerrar el
/// servicio, así que nadie puede marcar una entrega que no ocurrió.
class CustodyPinCard extends StatelessWidget {
  const CustodyPinCard({
    required this.pin,
    this.label = 'PIN de entrega',
    this.hint = 'Dícteselo al repartidor solo cuando reciba su pedido.',
    this.color = const Color(0xFF0A7D57),
    super.key,
  });

  final String pin;
  final String label;
  final String hint;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.verified_user_outlined, size: 18, color: color),
              const SizedBox(width: 8),
              Text(
                label.toUpperCase(),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  pin,
                  style: TextStyle(
                    fontSize: 34,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 12,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    color: color,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Copiar',
                icon: Icon(Icons.copy_rounded, size: 20, color: color),
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: pin));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('PIN copiado')),
                  );
                },
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            hint,
            style: TextStyle(
              fontSize: 12,
              height: 1.3,
              color: color.withValues(alpha: 0.85),
            ),
          ),
        ],
      ),
    );
  }
}
