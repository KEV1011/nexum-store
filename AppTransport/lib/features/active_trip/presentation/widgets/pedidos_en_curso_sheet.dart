import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/shared/services/servicios_abiertos.dart';
import 'package:nexum_driver/shared/widgets/hoja_deslizable.dart';

/// Los otros pedidos que lleva, para cambiar a uno.
///
/// En un pueblo los locales quedan a dos cuadras: el repartidor que va con un
/// pedido recibe otro cercano, o un segundo del mismo local. La pantalla del
/// viaje enseña UNO —el que está atendiendo— y desde aquí pasa al otro. Cada
/// uno conserva su fase en el servidor, así que volver a él lo deja donde iba.
///
/// Devuelve el elegido, o null si cierra la hoja.
Future<ServicioAbierto?> mostrarPedidosEnCurso(
  BuildContext context,
  List<ServicioAbierto> otros,
) {
  return showModalBottomSheet<ServicioAbierto>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.surfaceColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => envolverHoja(ctx, _Contenido(otros)),
  );
}

class _Contenido extends StatelessWidget {
  const _Contenido(this.otros);

  final List<ServicioAbierto> otros;

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
              otros.length == 1 ? 'Llevas otro pedido' : 'Llevas ${otros.length} pedidos más',
              style: TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w800,
                color: context.textPrimaryColor,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Toca uno para atenderlo. El que dejas queda donde iba.',
              style: TextStyle(fontSize: 14, color: context.textSecondaryColor),
            ),
            const SizedBox(height: 12),
            for (final s in otros) _Fila(s),
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Seguir con este'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Fila extends StatelessWidget {
  const _Fila(this.s);

  final ServicioAbierto s;

  @override
  Widget build(BuildContext context) {
    final r = s.solicitud;
    // Yendo al local importa el local; con el pedido en la mano, la entrega.
    final donde = r == null
        ? ''
        : s.fase == 'en_curso'
            ? 'Entregar en ${r.destination.address}'
            : 'Recoger en ${r.passenger.name}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: context.backgroundColor,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => Navigator.of(context).pop(s),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.shopping_bag_rounded, color: AppColors.primary, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
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
                        style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
                      ),
                      if (donde.isNotEmpty)
                        Text(
                          donde,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
                        ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: context.textSecondaryColor),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
