import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';

/// Por qué se puede confiar en quien viene a recogerte.
///
/// Va ANTES de la lista de comercios, no al final: quien baja hasta el pie ya
/// decidió, y a quien duda hay que respondérselo antes de que se vaya.
///
/// Dice dos cosas y las dos son ciertas, comprobables en el panel de
/// administración: la empresa está habilitada para transporte, y los papeles
/// de conductores y vehículos se revisan a diario —literalmente, el barrido de
/// vencimientos corre cada día y bloquea al que tiene un documento vencido—.
/// Si algún día deja de ser cierto, este widget se borra; un sello de
/// confianza que no se sostiene hace más daño que no tener ninguno.
class SelloConfianza extends StatelessWidget {
  const SelloConfianza({super.key});

  @override
  Widget build(BuildContext context) {
    final oscuro = Theme.of(context).brightness == Brightness.dark;
    final tinte = ZipaTokens.abierto;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: context.zSuperficie,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.zBorde),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: oscuro ? tinte.fondo.oscuro : tinte.fondo.claro,
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
            child: ZipaIcon(
              ZipaIconName.verificado,
              color: oscuro ? tinte.glifo.oscuro : tinte.glifo.claro,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Empresa habilitada',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: context.zTexto,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Conductores y vehículos verificados a diario',
                  style: TextStyle(
                    fontSize: 12.5,
                    height: 1.3,
                    color: context.zTexto2,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
