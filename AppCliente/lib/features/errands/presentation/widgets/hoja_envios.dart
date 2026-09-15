// El selector de los dos envíos que existen.
//
// «Envíos» es un paraguas sobre DOS flujos que no se parecen: mandar un
// paquete que ya tienes (pide destinatario) y pedir que te traigan algo
// (pide presupuesto de compra). Meterlos en un solo formulario obligaría a
// preguntar por todo a todo el mundo.
//
// Vive aquí y no dentro de una pantalla porque lo abren dos sitios: el home
// y la pestaña de movilidad. Copiarlo en ambos los dejaría separándose en
// cuanto alguien tocara uno.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';

/// Abre el selector de envíos.
///
/// [sobreMapa] fija la paleta oscura: en la pestaña de movilidad la hoja sale
/// encima del mapa, que es oscuro en los dos temas. En el home, en cambio,
/// sigue al tema del teléfono.
Future<void> mostrarHojaEnvios(BuildContext context, {bool sobreMapa = false}) {
  final oscuro =
      sobreMapa || Theme.of(context).brightness == Brightness.dark;
  final fondo = sobreMapa ? AppColors.surfaceDark : context.zSuperficie;

  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: fondo,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 44,
                height: 5,
                decoration: BoxDecoration(
                  color: sobreMapa ? AppColors.outlineDark : context.zBorde,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              '¿Qué necesitas?',
              style: TextStyle(
                color: sobreMapa ? Colors.white : context.zTexto,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 14),
            _OpcionEnvio(
              icono: Icons.inventory_2_rounded,
              titulo: 'Enviar un paquete',
              subtitulo: 'Ya lo tienes listo: de una dirección a otra',
              sobreMapa: sobreMapa,
              oscuro: oscuro,
              onTap: () {
                Navigator.of(ctx).pop();
                context.push(
                  AppRoutes.transportBooking,
                  extra: TransportServiceType.envios,
                );
              },
            ),
            const SizedBox(height: 10),
            _OpcionEnvio(
              icono: Icons.shopping_basket_rounded,
              titulo: 'Que me traigan algo',
              subtitulo: 'Droguería, mercado, pagos, recoger un documento…',
              sobreMapa: sobreMapa,
              oscuro: oscuro,
              onTap: () {
                Navigator.of(ctx).pop();
                context.push(AppRoutes.errandBooking);
              },
            ),
          ],
        ),
      ),
    ),
  );
}

class _OpcionEnvio extends StatelessWidget {
  const _OpcionEnvio({
    required this.icono,
    required this.titulo,
    required this.subtitulo,
    required this.sobreMapa,
    required this.oscuro,
    required this.onTap,
  });

  final IconData icono;
  final String titulo;
  final String subtitulo;
  final bool sobreMapa;
  final bool oscuro;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tinte = ZipaTokens.envios;
    final fondoIcono = oscuro ? tinte.fondo.oscuro : tinte.fondo.claro;
    final glifo = oscuro ? tinte.glifo.oscuro : tinte.glifo.claro;

    final fondoTarjeta =
        sobreMapa ? AppColors.surfaceVariantDark : context.zHundida;
    final textoPrincipal = sobreMapa ? Colors.white : context.zTexto;
    final textoSecundario =
        sobreMapa ? AppColors.textSecondaryDark : context.zTexto2;

    return Material(
      color: fondoTarjeta,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: fondoIcono,
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: Icon(icono, color: glifo, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      titulo,
                      style: TextStyle(
                        color: textoPrincipal,
                        fontWeight: FontWeight.w700,
                        fontSize: 14.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitulo,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: textoSecundario, fontSize: 12),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: textoSecundario,
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
