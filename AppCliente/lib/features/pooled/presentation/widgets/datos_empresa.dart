import 'package:flutter/material.dart';

import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/features/pooled/domain/comodidades.dart';

/// Las tres cosas que se preguntan antes de comprar un pasaje de bus: con quién
/// viajo, qué trae el vehículo y qué pasa con mi maleta.
///
/// Viven juntas y sueltas porque se pintan en tres sitios —la tarjeta del
/// buscador, la hoja de reserva y «Mis reservas»— y tres copias se separarían
/// en cuanto alguien tocara una.

/// La nota de la empresa, o «Nuevo».
///
/// Sin calificaciones NO se pinta un número: ni un cero, que se lee como
/// pésimo, ni un cinco de fábrica, que fue el error que hubo que borrar de los
/// negocios y de los conductores. Y el conteo va al lado porque un 4,9 con dos
/// votos y otro con doscientos no son la misma información.
class NotaEmpresa extends StatelessWidget {
  const NotaEmpresa({required this.rating, this.votos, super.key});

  final double? rating;
  final int? votos;

  @override
  Widget build(BuildContext context) {
    if (rating == null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(
          color: context.cardColor2,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          'Nuevo',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: context.textSecondaryColor,
          ),
        ),
      );
    }
    final n = votos ?? 0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.star_rounded, size: 15, color: AppColors.starText),
        const SizedBox(width: 2),
        Text(
          rating!.toStringAsFixed(1).replaceAll('.', ','),
          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800),
        ),
        if (n > 0) ...[
          const SizedBox(width: 3),
          Text(
            '($n)',
            style: TextStyle(fontSize: 11, color: context.textSecondaryColor),
          ),
        ],
      ],
    );
  }
}

/// Lo que trae el vehículo, en chips.
///
/// Solo lo declarado. Una comodidad ausente no se pinta tachada: no sabemos si
/// el bus no la tiene o si la empresa no la declaró, y afirmar lo primero sería
/// inventar.
class ChipsComodidades extends StatelessWidget {
  const ChipsComodidades({required this.claves, this.compacto = true, super.key});

  final List<String> claves;

  /// Compacto para la tarjeta del buscador; con texto en la hoja de reserva,
  /// donde hay sitio y es donde se termina de decidir.
  final bool compacto;

  @override
  Widget build(BuildContext context) {
    final lista = comodidadesDe(claves);
    if (lista.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final c in lista)
          Container(
            padding: EdgeInsets.symmetric(
              horizontal: compacto ? 7 : 9,
              vertical: compacto ? 3 : 5,
            ),
            decoration: BoxDecoration(
              color: context.cardColor2,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(c.icono, size: compacto ? 13 : 15, color: context.textSecondaryColor),
                if (!compacto) ...[
                  const SizedBox(width: 5),
                  Text(
                    c.etiqueta,
                    style: TextStyle(fontSize: 12, color: context.textPrimaryColor),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

/// Las condiciones del tiquete, tal como las redactó el servidor.
///
/// El texto NO se arma aquí: llega hecho. Si la app lo redactara por su cuenta,
/// la empresa creería estar publicando una regla y el pasajero leería otra.
///
/// Sin condiciones se dice que la empresa no las ha publicado, en vez de
/// callar: quien viaja con una maleta grande necesita saber que nadie le ha
/// prometido nada.
class CondicionesTiquete extends StatelessWidget {
  const CondicionesTiquete({required this.lineas, this.hayEmpresa = true, super.key});

  final List<String> lineas;
  final bool hayEmpresa;

  @override
  Widget build(BuildContext context) {
    if (!hayEmpresa) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.assignment_outlined, size: 15, color: context.textSecondaryColor),
            const SizedBox(width: 6),
            Text(
              'Condiciones del tiquete',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: context.textPrimaryColor,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        if (lineas.isEmpty)
          Text(
            'Esta empresa no ha publicado sus condiciones. Pregúntale antes de '
            'viajar si llevas equipaje grande, mascota o menores de edad.',
            style: TextStyle(fontSize: 12, color: context.textSecondaryColor, height: 1.35),
          )
        else
          for (final l in lineas)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('· ', style: TextStyle(color: context.textSecondaryColor)),
                  Expanded(
                    child: Text(
                      l,
                      style: TextStyle(
                        fontSize: 12,
                        color: context.textSecondaryColor,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}

/// Cómo cobra la empresa el pasaje.
///
/// El texto lo redacta el SERVIDOR (`lib/cobro-pasaje.ts`), igual que las
/// condiciones: si lo escribiera cada lado, la empresa creería publicar una
/// cosa y aquí saldría otra.
///
/// Se pinta SIEMPRE, incluso sin declarar, porque la línea que manda entonces
/// —«acuérdalo con la empresa»— es justo la que hoy falta: hasta ahora la
/// reserva terminaba sin decir una palabra sobre el dinero.
class FormaDePago extends StatelessWidget {
  const FormaDePago({required this.lineas, super.key});

  final List<String> lineas;

  @override
  Widget build(BuildContext context) {
    if (lineas.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.payments_outlined, size: 15, color: context.textSecondaryColor),
              const SizedBox(width: 6),
              Text(
                'Cómo se paga',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimaryColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          for (final l in lineas)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('· ', style: TextStyle(color: context.textSecondaryColor)),
                  Expanded(
                    child: Text(
                      l,
                      style: TextStyle(
                        fontSize: 12,
                        color: context.textSecondaryColor,
                        height: 1.35,
                      ),
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
