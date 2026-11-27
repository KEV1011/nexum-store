import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/shared/services/servicios_abiertos.dart';
import 'package:nexum_driver/shared/widgets/hoja_deslizable.dart';

/// La lista de los encargos que lleva (pedidos y mandados), para cambiar a uno.
///
/// Un local tarda 20 o 30 minutos en preparar: mientras tanto el repartidor va
/// por otro, o deja otro preparando. La pantalla del viaje enseña UNO —el que
/// está atendiendo— y desde aquí ve todos y pasa a otro. Cada uno conserva su
/// fase en el servidor, así que volver a él lo deja donde iba.
///
/// [actual] es el que está en pantalla (va arriba, sin poder elegirlo); en el
/// inicio no hay ninguno. Devuelve el elegido, o null si cierra la hoja.
Future<ServicioAbierto?> mostrarPedidosEnCurso(
  BuildContext context,
  List<ServicioAbierto> otros, {
  ServicioAbierto? actual,
}) {
  return showModalBottomSheet<ServicioAbierto>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.surfaceColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => envolverHoja(ctx, _Contenido(otros, actual)),
  );
}

/// «Tus encargos (3)»: cuenta el que está en pantalla y los demás.
String tituloDeEncargos(int total) =>
    total == 1 ? 'Tu encargo en curso' : 'Tus encargos ($total)';

class _Contenido extends StatelessWidget {
  const _Contenido(this.otros, this.actual);

  final List<ServicioAbierto> otros;
  final ServicioAbierto? actual;

  @override
  Widget build(BuildContext context) {
    final total = otros.length + (actual == null ? 0 : 1);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              tituloDeEncargos(total),
              style: TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w800,
                color: context.textPrimaryColor,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              actual == null
                  ? 'Toca uno para atenderlo. Cada uno sigue donde iba.'
                  : 'Toca otro para atenderlo. El que dejas queda donde iba.',
              style: TextStyle(fontSize: 14, color: context.textSecondaryColor),
            ),
            const SizedBox(height: 12),
            if (actual != null) _Fila(actual!, enPantalla: true),
            for (final s in otros) _Fila(s),
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(actual == null ? 'Cerrar' : 'Seguir con este'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Fila extends StatelessWidget {
  const _Fila(this.s, {this.enPantalla = false});

  final ServicioAbierto s;
  final bool enPantalla;

  @override
  Widget build(BuildContext context) {
    final r = s.solicitud;
    // Yendo al local importa el local; con el encargo en la mano, la entrega.
    // En un pedido el «pasajero» de la oferta es el NEGOCIO; en un mandado el
    // local es el punto de recogida.
    final donde = r == null
        ? ''
        : s.fase == 'en_curso'
            ? 'Entregar en ${r.destination.address}'
            : s.tipo == 'errand'
                ? 'Recoger en ${r.origin.address}'
                : 'Recoger en ${r.passenger.name}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: context.backgroundColor,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: enPantalla ? () => Navigator.of(context).pop() : () => Navigator.of(context).pop(s),
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
                  child: Icon(
                    s.tipo == 'errand' ? Icons.shopping_cart_rounded : Icons.shopping_bag_rounded,
                    color: AppColors.primary,
                    size: 22,
                  ),
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
                        enPantalla ? 'Lo estás atendiendo · ${s.faseTexto}' : s.faseTexto,
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
                if (!enPantalla)
                  Icon(Icons.chevron_right_rounded, color: context.textSecondaryColor),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
