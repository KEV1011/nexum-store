import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/features/earnings/domain/entities/daily_earnings_entity.dart';

/// Gráfico de barras semanal de ganancias.
/// Construido con CustomPainter (sin dependencias de terceros).
/// La barra de hoy se resalta en verde primario.
class WeeklyBarChart extends StatelessWidget {
  const WeeklyBarChart({super.key, required this.history});

  final List<DailyEarningsEntity> history;

  @override
  Widget build(BuildContext context) {
    if (history.isEmpty) {
      return const SizedBox(height: 160);
    }

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final maxEarning = history
        .map((d) => d.totalEarnings)
        .reduce(math.max);

    return SizedBox(
      height: 160,
      child: CustomPaint(
        painter: _BarChartPainter(
          data: history,
          maxValue: maxEarning == 0 ? 1 : maxEarning,
          isDark: isDark,
        ),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class _BarChartPainter extends CustomPainter {
  _BarChartPainter({
    required this.data,
    required this.maxValue,
    required this.isDark,
  });

  final List<DailyEarningsEntity> data;
  final double maxValue;
  final bool isDark;

  static const _dayNames = ['Hoy', 'Ayer', 'Hace 2d', 'Hace 3d', 'Hace 4d', 'Hace 5d', 'Hace 6d'];
  static const _topPadding = 16.0;
  static const _bottomPadding = 36.0; // espacio para etiquetas
  static const _barSpacing = 6.0;

  @override
  void paint(Canvas canvas, Size size) {
    final chartHeight = size.height - _topPadding - _bottomPadding;
    final totalItems = data.length;
    final barWidth = (size.width - (_barSpacing * (totalItems + 1))) / totalItems;

    final textStyle = TextStyle(
      color: isDark ? Colors.white60 : AppColors.textSecondary,
      fontSize: 10,
    );

    for (var i = 0; i < totalItems; i++) {
      final item = data[i];
      final isToday = i == 0;
      final barHeight = maxValue > 0
          ? (item.totalEarnings / maxValue) * chartHeight
          : 0.0;

      final x = _barSpacing + i * (barWidth + _barSpacing);
      final top = _topPadding + chartHeight - barHeight;
      final rect = Rect.fromLTWH(x, top, barWidth, barHeight);

      // Pintar barra
      final paint = Paint()
        ..color = isToday
            ? AppColors.primary
            : (isDark ? AppColors.primary.withOpacity(0.35) : AppColors.primaryLight.withOpacity(0.7))
        ..style = PaintingStyle.fill;

      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, const Radius.circular(4)),
        paint,
      );

      // Valor encima de la barra
      if (item.totalEarnings > 0) {
        final valueText = CurrencyFormatter.format(item.totalEarnings);
        final valuePainter = TextPainter(
          text: TextSpan(
            text: valueText,
            style: TextStyle(
              color: isToday ? AppColors.primary : textStyle.color,
              fontSize: 9,
              fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: barWidth + 20);

        valuePainter.paint(
          canvas,
          Offset(
            x + barWidth / 2 - valuePainter.width / 2,
            top - valuePainter.height - 2,
          ),
        );
      }

      // Etiqueta del día debajo de la barra
      final labelText = i < _dayNames.length ? _dayNames[i] : '';
      final labelPainter = TextPainter(
        text: TextSpan(text: labelText, style: textStyle),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: barWidth + 10);

      labelPainter.paint(
        canvas,
        Offset(
          x + barWidth / 2 - labelPainter.width / 2,
          size.height - _bottomPadding + 6,
        ),
      );
    }
  }

  @override
  bool shouldRepaint(_BarChartPainter oldDelegate) =>
      oldDelegate.data != data || oldDelegate.maxValue != maxValue;
}
