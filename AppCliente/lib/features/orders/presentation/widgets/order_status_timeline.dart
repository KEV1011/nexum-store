import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';

/// El recorrido del pedido: qué pasó, cuándo, y qué falta.
///
/// Los pasos los manda el SERVIDOR ([pasos]) porque dependen de la forma del
/// pedido —en mesa, domicilio urbano, encomienda en taquilla o encomienda a
/// la puerta— y hasta ahora eran cinco etiquetas fijas: a quien mandaba una
/// caja en bus a otra ciudad le decía «Conductor recogiendo» durante seis
/// horas, y a quien pedía en la mesa le prometía un repartidor inexistente.
///
/// Cuando no llegan (backend anterior a la bitácora, o la pantalla del
/// listado que no la pide) se cae a los cinco de siempre, derivados del
/// estado. Un respaldo peor es mejor que una línea en blanco.
class OrderStatusTimeline extends StatelessWidget {
  const OrderStatusTimeline({
    required this.status,
    this.pasos = const [],
    super.key,
  });

  final CustomerOrderStatus status;

  /// Los pasos con su hora, tal como los armó el servidor.
  final List<PasoPedido> pasos;

  /// Respaldo: los 5 de siempre, alineados con `CustomerOrderStatusX.step`.
  static const _labels = [
    'Pedido confirmado',
    'En preparación',
    'Conductor recogiendo',
    'En camino hacia ti',
    'Entregado',
  ];

  @override
  Widget build(BuildContext context) {
    if (pasos.isNotEmpty) {
      return Column(
        children: [
          for (var i = 0; i < pasos.length; i++)
            _TimelineStep(
              label: pasos[i].titulo,
              detalle: pasos[i].detalle,
              // Solo si de verdad se registró. Sin hora no se escribe nada:
              // poner la de otro paso sería peor que el hueco.
              hora: pasos[i].at,
              isDone: pasos[i].cumplido,
              isCurrent: pasos[i].actual,
              isCancelled: pasos[i].cancelado,
              isLast: i == pasos.length - 1,
            ),
        ],
      );
    }

    if (status == CustomerOrderStatus.cancelled) {
      return const _TimelineStep(
        label: 'Pedido cancelado',
        isDone: false,
        isCurrent: true,
        isLast: true,
        isCancelled: true,
      );
    }
    final currentStep = status.step;

    return Column(
      children: [
        for (var i = 0; i < _labels.length; i++)
          _TimelineStep(
            label: _labels[i],
            isDone: i < currentStep,
            isCurrent: i == currentStep,
            isLast: i == _labels.length - 1,
          ),
      ],
    );
  }
}

/// «14:32» o «Ayer 18:05». La fecha solo cuando NO es hoy: en un domicilio
/// de treinta minutos, repetir la fecha en cada renglón es ruido; en una
/// encomienda de tres días, la hora sola no dice nada.
String horaDePaso(DateTime t, DateTime ahora) {
  final hoy = DateTime(ahora.year, ahora.month, ahora.day);
  final dia = DateTime(t.year, t.month, t.day);
  final hhmm = '${t.hour.toString().padLeft(2, '0')}:'
      '${t.minute.toString().padLeft(2, '0')}';
  final dias = hoy.difference(dia).inDays;
  if (dias == 0) return hhmm;
  if (dias == 1) return 'Ayer $hhmm';
  return '${t.day}/${t.month} $hhmm';
}

class _TimelineStep extends StatelessWidget {
  const _TimelineStep({
    required this.label,
    required this.isDone,
    required this.isCurrent,
    required this.isLast,
    this.detalle,
    this.hora,
    this.isCancelled = false,
  });

  final String label;
  final String? detalle;
  final DateTime? hora;
  final bool isDone;
  final bool isCurrent;
  final bool isCancelled;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final active = isDone || isCurrent || isCancelled;
    final color = isCancelled
        ? AppColors.error
        : (active ? AppColors.primary : context.outlineColor);

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: active ? color : Colors.transparent,
                  shape: BoxShape.circle,
                  border: Border.all(color: color, width: 2),
                ),
                child: isCancelled
                    ? const Icon(Icons.close_rounded, size: 14, color: Colors.white)
                    : isDone
                        ? const Icon(Icons.check, size: 14, color: Colors.white)
                        : isCurrent
                            ? const _PulsingDot()
                            : null,
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    color: isDone ? AppColors.primary : context.outlineColor,
                  ),
                ),
            ],
          ),
          const SizedBox(width: AppConstants.spacingM),
          Padding(
            padding: const EdgeInsets.only(
              top: 2,
              bottom: AppConstants.spacingL,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 14,
                          fontWeight:
                              isCurrent ? FontWeight.w700 : FontWeight.w500,
                          color: active ? null : context.textTertiaryColor,
                        ),
                      ),
                    ),
                    // La hora, solo si el paso la tiene. Un renglón sin hora
                    // es un paso que no dejó registro, y eso se dice
                    // callando, no con un guion que parece un dato.
                    if (hora != null) ...[
                      const SizedBox(width: 8),
                      Text(
                        horaDePaso(hora!, DateTime.now()),
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: context.textSecondaryColor,
                        ),
                      ),
                    ],
                  ],
                ),
                if (detalle != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      detalle!,
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 12.5,
                        height: 1.3,
                        color: context.textSecondaryColor,
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

class _PulsingDot extends StatefulWidget {
  const _PulsingDot();

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FadeTransition(
        opacity: Tween<double>(begin: 0.4, end: 1).animate(_ctrl),
        child: Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: context.surfaceColor,
            shape: BoxShape.circle,
          ),
        ),
      ),
    );
  }
}
