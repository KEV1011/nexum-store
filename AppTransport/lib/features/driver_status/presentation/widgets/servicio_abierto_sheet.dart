import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/shared/services/servicios_abiertos.dart';
import 'package:nexum_driver/shared/widgets/hoja_deslizable.dart';

enum AccionServicioAbierto { retomar, soltar, despues }

/// La hoja que aparece al abrir la app con un servicio sin cerrar.
///
/// Es una hoja y no un diálogo a propósito: los botones del tema tienen ancho
/// mínimo infinito, y dentro de un `AlertDialog` (que mide a lo ancho lo que
/// le piden sus hijos) eso revienta. En una columna de ancho acotado ocupan
/// toda la fila, que es lo que se quiere.
Future<AccionServicioAbierto?> mostrarServicioAbierto(
  BuildContext context,
  ServicioAbierto s,
) {
  return showModalBottomSheet<AccionServicioAbierto>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.surfaceColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => envolverHoja(ctx, _Contenido(s)),
  );
}

class _Contenido extends StatelessWidget {
  const _Contenido(this.s);

  final ServicioAbierto s;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Tienes un servicio sin cerrar',
              style: TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w800,
                color: context.textPrimaryColor,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              [s.nombre, if (s.ref.isNotEmpty) s.ref].join(' · '),
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: context.textPrimaryColor,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              s.faseTexto,
              style: TextStyle(fontSize: 14, color: context.textSecondaryColor),
            ),
            const SizedBox(height: 12),
            Text(
              s.puedeSoltar
                  ? 'La app se cerró mientras lo atendías y el cliente sigue '
                      'esperando. Retómalo, o suéltalo para que se lo asignemos '
                      'a otro conductor.'
                  : 'La app se cerró mientras lo atendías. '
                      '${s.motivoNoSoltar ?? 'Retómalo para terminarlo.'}',
              style: TextStyle(
                fontSize: 14,
                height: 1.35,
                color: context.textSecondaryColor,
              ),
            ),
            const SizedBox(height: 18),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(AccionServicioAbierto.retomar),
              child: const Text('Retomar'),
            ),
            if (s.puedeSoltar) ...[
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () => Navigator.of(context).pop(AccionServicioAbierto.soltar),
                style: OutlinedButton.styleFrom(foregroundColor: AppColors.error),
                child: const Text('Soltar para que lo tome otro'),
              ),
            ],
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => Navigator.of(context).pop(AccionServicioAbierto.despues),
              child: const Text('Ahora no'),
            ),
          ],
        ),
      ),
    );
  }
}
