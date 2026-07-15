import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/features/driver_status/domain/entities/driver_status_entity.dart';

/// Barra de estado que aparece en la parte superior de la pantalla de inicio.
///
/// Muestra en un solo horizonte:
///  - Chip de estado con punto de color (En línea / Desconectado)
///  - Número de viajes completados hoy
///  - Ganancias acumuladas del día en COP
///
/// La altura fija es de 72 dp. Se espera que el padre la envuelva en
/// [SafeArea] para evitar superposición con la barra de estado del sistema.
class StatusIndicatorBar extends StatelessWidget {
  const StatusIndicatorBar({
    super.key,
    required this.status,
  });

  final DriverStatusEntity status;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 72,
      width: double.infinity,
      decoration: BoxDecoration(
        color: context.surfaceColor,
        boxShadow: [
          BoxShadow(
            color: AppColors.shadow,
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            // ── Status chip ──────────────────────────────────────────────────
            _StatusChip(isOnline: status.isOnline),

            const Spacer(),

            // ── Daily trips ───────────────────────────────────────────────────
            _StatColumn(
              label: 'Viajes',
              value: status.dailyTrips.toString(),
              icon: Icons.route_rounded,
            ),

            const SizedBox(width: 20),

            // ── Daily earnings ────────────────────────────────────────────────
            _StatColumn(
              label: 'Ganancias',
              value: CurrencyFormatter.format(status.dailyEarnings),
              icon: Icons.payments_rounded,
            ),
          ],
        ),
      ),
    );
  }
}

// ── _StatusChip ───────────────────────────────────────────────────────────────

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.isOnline});

  final bool isOnline;

  @override
  Widget build(BuildContext context) {
    final color = isOnline ? AppColors.online : AppColors.offline;
    final label = isOnline ? 'En línea' : 'Desconectado';

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withAlpha(26),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withAlpha(77)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Dot indicador animado
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: color.withAlpha(128),
                  blurRadius: isOnline ? 6 : 0,
                  spreadRadius: isOnline ? 1 : 0,
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

// ── _StatColumn ───────────────────────────────────────────────────────────────

class _StatColumn extends StatelessWidget {
  const _StatColumn({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 12, color: context.textSecondaryColor),
            const SizedBox(width: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: context.textSecondaryColor,
                fontWeight: FontWeight.w400,
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: context.textPrimaryColor,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }
}
