import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/core/utils/fare_calculator.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/'
    'driver_status_provider.dart';
import 'package:nexum_driver/shared/widgets/skeleton_loader.dart';

// ── Models ───────────────────────────────────────────────────────────────────

class _DayEarning {
  const _DayEarning({
    required this.date,
    required this.totalTrips,
    required this.grossEarnings,
  });
  final DateTime date;
  final int totalTrips;
  final double grossEarnings;
  double get netEarnings => FareCalculator.calculateNetEarning(grossEarnings);
  double get commission => FareCalculator.calculateCommission(grossEarnings);
}

class _WeekEarning {
  const _WeekEarning({
    required this.label,
    required this.totalTrips,
    required this.grossEarnings,
  });
  final String label;
  final int totalTrips;
  final double grossEarnings;
  double get netEarnings => FareCalculator.calculateNetEarning(grossEarnings);
  double get commission => FareCalculator.calculateCommission(grossEarnings);
}

// ── Mock generators ──────────────────────────────────────────────────────────

List<_DayEarning> _generateWeekEarnings() {
  final now = DateTime.now();
  return [
    _DayEarning(date: now, totalTrips: 8, grossEarnings: 68000),
    _DayEarning(
      date: now.subtract(const Duration(days: 1)),
      totalTrips: 11,
      grossEarnings: 95500,
    ),
    _DayEarning(
      date: now.subtract(const Duration(days: 2)),
      totalTrips: 6,
      grossEarnings: 52000,
    ),
    _DayEarning(
      date: now.subtract(const Duration(days: 3)),
      totalTrips: 14,
      grossEarnings: 128000,
    ),
    _DayEarning(
      date: now.subtract(const Duration(days: 4)),
      totalTrips: 9,
      grossEarnings: 77500,
    ),
    _DayEarning(
      date: now.subtract(const Duration(days: 5)),
      totalTrips: 12,
      grossEarnings: 107000,
    ),
    _DayEarning(
      date: now.subtract(const Duration(days: 6)),
      totalTrips: 7,
      grossEarnings: 61000,
    ),
  ];
}

const _weeklyEarnings = [
  _WeekEarning(label: 'Sem 1', totalTrips: 58, grossEarnings: 490000),
  _WeekEarning(label: 'Sem 2', totalTrips: 64, grossEarnings: 545000),
  _WeekEarning(label: 'Sem 3', totalTrips: 71, grossEarnings: 598000),
  _WeekEarning(label: 'Sem 4', totalTrips: 67, grossEarnings: 569000),
];

String _compactCop(double v) {
  if (v >= 1000000) return '\$${(v / 1000000).toStringAsFixed(1)}M';
  if (v >= 1000) return '\$${(v / 1000).toStringAsFixed(0)}k';
  return '\$${v.toStringAsFixed(0)}';
}

// ── Screen ───────────────────────────────────────────────────────────────────

class EarningsScreen extends ConsumerStatefulWidget {
  const EarningsScreen({super.key});

  @override
  ConsumerState<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends ConsumerState<EarningsScreen>
    with SingleTickerProviderStateMixin {
  bool _loading = true;
  int _period = 0; // 0 = semana, 1 = mes
  int? _selectedBar;
  double _dailyGoal = 100000;
  double _monthlyGoal = 2000000;
  late AnimationController _chartAnim;

  @override
  void initState() {
    super.initState();
    _chartAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    Future.delayed(const Duration(milliseconds: 800), () {
      if (mounted) {
        setState(() => _loading = false);
        _chartAnim.forward();
      }
    });
  }

  @override
  void dispose() {
    _chartAnim.dispose();
    super.dispose();
  }

  void _onPeriodChanged(int p) {
    if (p == _period) return;
    setState(() {
      _period = p;
      _selectedBar = null;
    });
    _chartAnim
      ..reset()
      ..forward();
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = ref.watch(driverStatusProvider);

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Ganancias')),
        body: SkeletonLoader(
          child: ListView(
            padding: const EdgeInsets.all(AppConstants.spacingM),
            children: [
              const SkeletonBox(height: 40, radius: 12),
              const SizedBox(height: AppConstants.spacingM),
              const SkeletonStatRow(),
              const SizedBox(height: AppConstants.spacingM),
              const SkeletonBox(height: 160, radius: 12),
              const SizedBox(height: AppConstants.spacingM),
              const SkeletonBarChart(),
              const SizedBox(height: AppConstants.spacingM),
              const SkeletonBox(height: 80, radius: 12),
            ],
          ),
        ),
      );
    }

    // Inject live session data into today's slot
    final rawWeek = _generateWeekEarnings();
    final hasLive = status.dailyTrips > 0;
    final liveNet = status.dailyEarnings;
    final liveGross = hasLive
        ? liveNet / (1 - AppConstants.platformCommissionRate)
        : rawWeek.first.grossEarnings;
    final week = [
      _DayEarning(
        date: rawWeek.first.date,
        totalTrips: hasLive ? status.dailyTrips : rawWeek.first.totalTrips,
        grossEarnings: liveGross,
      ),
      ...rawWeek.skip(1),
    ];

    final isWeek = _period == 0;

    // Aggregates
    final weekGross = week.fold<double>(0, (s, e) => s + e.grossEarnings);
    final weekNet = FareCalculator.calculateNetEarning(weekGross);
    final weekTrips = week.fold<int>(0, (s, e) => s + e.totalTrips);

    final monthGross =
        _weeklyEarnings.fold<double>(0, (s, e) => s + e.grossEarnings);
    final monthNet = FareCalculator.calculateNetEarning(monthGross);
    final monthTrips =
        _weeklyEarnings.fold<int>(0, (s, e) => s + e.totalTrips);

    final todayNet = week.first.netEarnings;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis ganancias'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => context.pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share_rounded),
            tooltip: 'Exportar resumen',
            onPressed: () => _showExportDialog(
              context,
              isWeek: isWeek,
              net: isWeek ? weekNet : monthNet,
              gross: isWeek ? weekGross : monthGross,
              trips: isWeek ? weekTrips : monthTrips,
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingM,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Period selector
            _PeriodSelector(
              selected: _period,
              onChanged: _onPeriodChanged,
            ),
            const SizedBox(height: AppConstants.spacingM),

            // Hero card
            _HeroCard(
              isWeek: isWeek,
              hasLive: hasLive && isWeek,
              net: isWeek ? week.first.netEarnings : monthNet,
              gross: isWeek ? week.first.grossEarnings : monthGross,
              trips: isWeek ? week.first.totalTrips : monthTrips,
              date: week.first.date,
            ),
            const SizedBox(height: AppConstants.spacingM),

            // Commission breakdown
            _CommissionCard(
              gross: isWeek ? week.first.grossEarnings : monthGross,
              isWeek: isWeek,
              theme: theme,
            ),
            const SizedBox(height: AppConstants.spacingM),

            // Goal progress
            _GoalCard(
              current: isWeek ? todayNet : monthNet,
              goal: isWeek ? _dailyGoal : _monthlyGoal,
              isWeek: isWeek,
              theme: theme,
              onEditGoal: () => _showEditGoalDialog(context, isWeek),
            ),
            const SizedBox(height: AppConstants.spacingM),

            // Bar chart
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  isWeek ? 'Últimos 7 días' : 'Este mes — por semana',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                if (_selectedBar != null)
                  TextButton(
                    onPressed: () => setState(() => _selectedBar = null),
                    child: const Text('Limpiar'),
                  ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingS),
            _AnimatedBarChart(
              weekEntries: week.reversed.toList(),
              monthEntries: _weeklyEarnings,
              isWeek: isWeek,
              selectedIndex: _selectedBar,
              animation: _chartAnim,
              onSelect: (i) => setState(
                () => _selectedBar = _selectedBar == i ? null : i,
              ),
            ),
            const SizedBox(height: AppConstants.spacingM),

            // Summary row
            _SummaryRow(
              net: isWeek ? weekNet : monthNet,
              trips: isWeek ? weekTrips : monthTrips,
              avgPerTrip: isWeek
                  ? (weekTrips > 0 ? weekNet / weekTrips : 0)
                  : (monthTrips > 0 ? monthNet / monthTrips : 0),
            ),
            const SizedBox(height: AppConstants.spacingM),
            const Divider(),
            const SizedBox(height: AppConstants.spacingS),

            // Breakdown list
            Text(
              isWeek ? 'Detalle diario' : 'Detalle semanal',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppConstants.spacingS),
            if (isWeek)
              ...week.map((e) => _DayRow(earning: e))
            else
              ..._weeklyEarnings.map((e) => _WeekRow(earning: e)),

            const SizedBox(height: AppConstants.spacingL),
          ],
        ),
      ),
    );
  }

  // ── Dialogs ───────────────────────────────────────────────────────────────

  void _showExportDialog(
    BuildContext context, {
    required bool isWeek,
    required double net,
    required double gross,
    required int trips,
  }) {
    final period = isWeek ? 'Esta semana' : 'Este mes';
    final commission = FareCalculator.calculateCommission(gross);
    final commissionPct =
        (AppConstants.platformCommissionRate * 100).toStringAsFixed(0);
    final summary = '''
Resumen de ganancias — Nexum Driver
Período: $period
─────────────────────────────
Viajes completados: $trips
Tarifa bruta total: ${CurrencyFormatter.format(gross)}
Comisión Nexum ($commissionPct%): -${CurrencyFormatter.format(commission)}
─────────────────────────────
GANANCIAS NETAS: ${CurrencyFormatter.format(net)}
─────────────────────────────
Generado por Nexum Driver v${AppConstants.appVersion}''';

    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Exportar resumen'),
        content: SingleChildScrollView(
          child: SelectableText(
            summary,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 12,
              height: 1.6,
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cerrar'),
          ),
          ElevatedButton.icon(
            icon: const Icon(Icons.copy_rounded, size: 16),
            label: const Text('Copiar'),
            onPressed: () {
              Clipboard.setData(ClipboardData(text: summary));
              Navigator.of(ctx).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Resumen copiado al portapapeles'),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  void _showEditGoalDialog(BuildContext context, bool isWeek) {
    final current = isWeek ? _dailyGoal : _monthlyGoal;
    final ctrl = TextEditingController(text: current.toInt().toString());

    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isWeek ? 'Meta diaria' : 'Meta mensual'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(
            labelText: 'Meta en COP',
            prefixText: r'$ ',
            helperText: isWeek
                ? r'Ej: 100000 = $100.000'
                : r'Ej: 2000000 = $2.000.000',
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () {
              final v = double.tryParse(ctrl.text) ?? current;
              setState(() {
                if (isWeek) {
                  _dailyGoal = v.clamp(10000, 5000000);
                } else {
                  _monthlyGoal = v.clamp(100000, 50000000);
                }
              });
              Navigator.of(ctx).pop();
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }
}

// ── Period selector ──────────────────────────────────────────────────────────

class _PeriodSelector extends StatelessWidget {
  const _PeriodSelector({required this.selected, required this.onChanged});
  final int selected;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _Chip(
          label: 'Esta semana',
          active: selected == 0,
          onTap: () => onChanged(0),
        ),
        const SizedBox(width: AppConstants.spacingS),
        _Chip(
          label: 'Este mes',
          active: selected == 1,
          onTap: () => onChanged(1),
        ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.active,
    required this.onTap,
  });
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: active ? AppColors.primary : Colors.transparent,
          borderRadius:
              BorderRadius.circular(AppConstants.radiusCircular),
          border: Border.all(
            color: active ? AppColors.primary : AppColors.outlineLight,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: active ? Colors.white : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

// ── Hero card ────────────────────────────────────────────────────────────────

class _HeroCard extends StatelessWidget {
  const _HeroCard({
    required this.isWeek,
    required this.hasLive,
    required this.net,
    required this.gross,
    required this.trips,
    required this.date,
  });
  final bool isWeek;
  final bool hasLive;
  final double net;
  final double gross;
  final int trips;
  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingL),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  isWeek
                      ? 'Hoy, ${DateFormatter.formatDate(date)}'
                      : 'Mayo 2025',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: AppColors.textSecondary),
                ),
                if (hasLive) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(
                        AppConstants.radiusCircular,
                      ),
                    ),
                    child: const Text(
                      'EN VIVO',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: AppConstants.spacingS),
            TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: net),
              duration: const Duration(milliseconds: 700),
              curve: Curves.easeOut,
              builder: (_, v, __) => Text(
                CurrencyFormatter.format(v),
                style: theme.textTheme.displaySmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.primary,
                ),
              ),
            ),
            Text(
              'ganancias netas',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: AppColors.textSecondary),
            ),
            const SizedBox(height: AppConstants.spacingM),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _MiniStat(
                  label: 'Viajes',
                  value: '$trips',
                  icon: Icons.local_taxi_rounded,
                ),
                _MiniStat(
                  label: 'Tarifa bruta',
                  value: CurrencyFormatter.format(gross),
                  icon: Icons.receipt_outlined,
                ),
                _MiniStat(
                  label: 'Comisión',
                  value: CurrencyFormatter.format(
                    FareCalculator.calculateCommission(gross),
                  ),
                  icon: Icons.percent_rounded,
                  valueColor: AppColors.error,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Commission breakdown card ────────────────────────────────────────────────

class _CommissionCard extends StatelessWidget {
  const _CommissionCard({
    required this.gross,
    required this.isWeek,
    required this.theme,
  });
  final double gross;
  final bool isWeek;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final net = FareCalculator.calculateNetEarning(gross);
    final commission = FareCalculator.calculateCommission(gross);
    final driverPct =
        ((1 - AppConstants.platformCommissionRate) * 100).round();
    final nexumPct = (AppConstants.platformCommissionRate * 100).round();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.pie_chart_outline_rounded,
                  size: 18,
                  color: AppColors.textSecondary,
                ),
                const SizedBox(width: AppConstants.spacingS),
                Text(
                  'Desglose de comisión',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingM),
            // Segmented bar
            TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: 1),
              duration: const Duration(milliseconds: 700),
              curve: Curves.easeOut,
              builder: (_, t, __) => ClipRRect(
                borderRadius:
                    BorderRadius.circular(AppConstants.radiusSmall),
                child: SizedBox(
                  height: 12,
                  child: Row(
                    children: [
                      Flexible(
                        flex: (driverPct * t).round(),
                        child: Container(color: AppColors.primary),
                      ),
                      Flexible(
                        flex: (nexumPct * t + (1 - t) * 100).round(),
                        child: Container(
                          color: AppColors.error.withValues(alpha: 0.7),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppConstants.spacingS),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _CommissionLegend(
                  color: AppColors.primary,
                  label: 'Tú ($driverPct%)',
                  value: CurrencyFormatter.format(net),
                ),
                _CommissionLegend(
                  color: AppColors.error,
                  label: 'Nexum ($nexumPct%)',
                  value: '-${CurrencyFormatter.format(commission)}',
                  alignRight: true,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CommissionLegend extends StatelessWidget {
  const _CommissionLegend({
    required this.color,
    required this.label,
    required this.value,
    this.alignRight = false,
  });
  final Color color;
  final String label;
  final String value;
  final bool alignRight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final children = [
      Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
      const SizedBox(width: 6),
      Column(
        crossAxisAlignment:
            alignRight ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.textTheme.bodySmall
                ?.copyWith(color: AppColors.textSecondary),
          ),
          Text(
            value,
            style: theme.textTheme.bodySmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    ];
    return Row(
      children: alignRight ? children.reversed.toList() : children,
    );
  }
}

// ── Goal card ────────────────────────────────────────────────────────────────

class _GoalCard extends StatelessWidget {
  const _GoalCard({
    required this.current,
    required this.goal,
    required this.isWeek,
    required this.theme,
    required this.onEditGoal,
  });
  final double current;
  final double goal;
  final bool isWeek;
  final ThemeData theme;
  final VoidCallback onEditGoal;

  @override
  Widget build(BuildContext context) {
    final progress = (current / goal).clamp(0.0, 1.0);
    final reached = current >= goal;
    final remaining = (goal - current).clamp(0.0, goal);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  reached ? Icons.emoji_events_rounded : Icons.flag_outlined,
                  size: 18,
                  color: reached ? AppColors.star : AppColors.textSecondary,
                ),
                const SizedBox(width: AppConstants.spacingS),
                Text(
                  isWeek ? 'Meta del día' : 'Meta del mes',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const Spacer(),
                TextButton(
                  onPressed: onEditGoal,
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Editar'),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingS),
            TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: progress),
              duration: const Duration(milliseconds: 800),
              curve: Curves.easeOut,
              builder: (_, v, __) => ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: v,
                  backgroundColor: AppColors.outlineLight,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    reached ? AppColors.star : AppColors.primary,
                  ),
                  minHeight: 8,
                ),
              ),
            ),
            const SizedBox(height: AppConstants.spacingS),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${CurrencyFormatter.format(current)} de '
                  '${CurrencyFormatter.format(goal)}',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  reached
                      ? '¡Meta alcanzada! 🎉'
                      : 'Faltan ${CurrencyFormatter.format(remaining)}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color:
                        reached ? AppColors.success : AppColors.textSecondary,
                    fontWeight:
                        reached ? FontWeight.w700 : FontWeight.normal,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Animated interactive bar chart ───────────────────────────────────────────

class _AnimatedBarChart extends StatelessWidget {
  const _AnimatedBarChart({
    required this.weekEntries,
    required this.monthEntries,
    required this.isWeek,
    required this.selectedIndex,
    required this.animation,
    required this.onSelect,
  });
  final List<_DayEarning> weekEntries;
  final List<_WeekEarning> monthEntries;
  final bool isWeek;
  final int? selectedIndex;
  final Animation<double> animation;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final count = isWeek ? weekEntries.length : monthEntries.length;
    final maxGross = isWeek
        ? weekEntries
            .map((e) => e.grossEarnings)
            .reduce((a, b) => a > b ? a : b)
        : monthEntries
            .map((e) => e.grossEarnings)
            .reduce((a, b) => a > b ? a : b);

    return Column(
      children: [
        SizedBox(
          height: 170,
          child: AnimatedBuilder(
            animation: animation,
            builder: (_, __) => Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(count, (i) {
                final isSelected = selectedIndex == i;
                // today is last entry in week list
                final isHighlight = isWeek && i == weekEntries.length - 1;

                final gross = isWeek
                    ? weekEntries[i].grossEarnings
                    : monthEntries[i].grossEarnings;
                final net = isWeek
                    ? weekEntries[i].netEarnings
                    : monthEntries[i].netEarnings;
                final label = isWeek
                    ? DateFormatter.formatShortDate(weekEntries[i].date)
                    : monthEntries[i].label;
                final isBest = gross == maxGross;

                // Staggered interval per bar
                final interval = CurvedAnimation(
                  parent: animation,
                  curve: Interval(
                    i / count * 0.6,
                    (i / count * 0.6) + 0.6,
                    curve: Curves.easeOut,
                  ),
                );
                final barHeight = (gross / maxGross) * 130.0 * interval.value;

                return Expanded(
                  child: GestureDetector(
                    onTap: () => onSelect(i),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 3),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          // Best day crown
                          if (isBest && !isSelected)
                            const Text(
                              '👑',
                              style: TextStyle(fontSize: 10),
                            ),
                          // Selected value label
                          if (isSelected)
                            Text(
                              _compactCop(net),
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                color: isHighlight
                                    ? AppColors.primary
                                    : AppColors.secondary,
                              ),
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                            ),
                          const SizedBox(height: 2),
                          // Bar
                          Container(
                            width: double.infinity,
                            height: barHeight.clamp(4.0, 130.0),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? AppColors.secondary
                                  : isHighlight
                                      ? AppColors.primary
                                      : AppColors.primary
                                          .withValues(alpha: 0.3),
                              borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(
                                  AppConstants.radiusSmall,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            label,
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: (isHighlight || isSelected)
                                  ? FontWeight.w700
                                  : FontWeight.normal,
                              color: isSelected
                                  ? AppColors.secondary
                                  : isHighlight
                                      ? AppColors.primary
                                      : AppColors.textSecondary,
                            ),
                            textAlign: TextAlign.center,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
        // Selected day detail panel
        AnimatedSize(
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
          child: selectedIndex != null
              ? _SelectedPanel(
                  gross: isWeek
                      ? weekEntries[selectedIndex!].grossEarnings
                      : monthEntries[selectedIndex!].grossEarnings,
                  net: isWeek
                      ? weekEntries[selectedIndex!].netEarnings
                      : monthEntries[selectedIndex!].netEarnings,
                  trips: isWeek
                      ? weekEntries[selectedIndex!].totalTrips
                      : monthEntries[selectedIndex!].totalTrips,
                )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }
}

class _SelectedPanel extends StatelessWidget {
  const _SelectedPanel({
    required this.gross,
    required this.net,
    required this.trips,
  });
  final double gross;
  final double net;
  final int trips;

  @override
  Widget build(BuildContext context) {
    final commission = FareCalculator.calculateCommission(gross);
    return Container(
      margin: const EdgeInsets.only(top: AppConstants.spacingS),
      padding: const EdgeInsets.symmetric(
        horizontal: AppConstants.spacingM,
        vertical: AppConstants.spacingS,
      ),
      decoration: BoxDecoration(
        color: AppColors.secondaryContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _PanelStat('Neto', CurrencyFormatter.format(net), AppColors.success),
          _PanelStat(
            'Bruto',
            CurrencyFormatter.format(gross),
            AppColors.secondary,
          ),
          _PanelStat(
            'Comisión',
            '-${CurrencyFormatter.format(commission)}',
            AppColors.error,
          ),
          _PanelStat('Viajes', '$trips', AppColors.info),
        ],
      ),
    );
  }
}

class _PanelStat extends StatelessWidget {
  const _PanelStat(this.label, this.value, this.color);
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Text(
          value,
          style: theme.textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: color,
            fontSize: 11,
          ),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 9, color: AppColors.textSecondary),
        ),
      ],
    );
  }
}

// ── Summary row ──────────────────────────────────────────────────────────────

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.net,
    required this.trips,
    required this.avgPerTrip,
  });
  final double net;
  final int trips;
  final double avgPerTrip;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Row(
          children: [
            Expanded(
              child: _SummaryTile(
                label: 'Total neto',
                value: CurrencyFormatter.format(net),
                icon: Icons.account_balance_wallet_rounded,
              ),
            ),
            Container(width: 1, height: 48, color: AppColors.divider),
            Expanded(
              child: _SummaryTile(
                label: 'Viajes',
                value: '$trips',
                icon: Icons.route_rounded,
              ),
            ),
            Container(width: 1, height: 48, color: AppColors.divider),
            Expanded(
              child: _SummaryTile(
                label: 'Promedio / viaje',
                value: CurrencyFormatter.format(avgPerTrip),
                icon: Icons.trending_up_rounded,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Breakdown rows ───────────────────────────────────────────────────────────

class _DayRow extends StatelessWidget {
  const _DayRow({required this.earning});
  final _DayEarning earning;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: 4,
        ),
        leading: CircleAvatar(
          backgroundColor: AppColors.primary.withValues(alpha: 0.1),
          child: Text(
            earning.date.day.toString(),
            style: const TextStyle(
              color: AppColors.primary,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
        ),
        title: Text(
          DateFormatter.formatRelativeDate(earning.date),
          style: theme.textTheme.bodyMedium
              ?.copyWith(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          '${earning.totalTrips} viajes · '
          'Comisión ${CurrencyFormatter.format(earning.commission)}',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: AppColors.textSecondary),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              CurrencyFormatter.format(earning.netEarnings),
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
              ),
            ),
            Text(
              'neto',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WeekRow extends StatelessWidget {
  const _WeekRow({required this.earning});
  final _WeekEarning earning;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: 4,
        ),
        leading: CircleAvatar(
          backgroundColor: AppColors.secondary.withValues(alpha: 0.1),
          child: Text(
            earning.label,
            style: const TextStyle(
              color: AppColors.secondary,
              fontWeight: FontWeight.w700,
              fontSize: 11,
            ),
          ),
        ),
        title: Text(
          earning.label,
          style: theme.textTheme.bodyMedium
              ?.copyWith(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          '${earning.totalTrips} viajes · '
          '${_compactCop(earning.grossEarnings)} bruto',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: AppColors.textSecondary),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              CurrencyFormatter.format(earning.netEarnings),
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.secondary,
              ),
            ),
            Text(
              'neto',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Reusable small widgets ───────────────────────────────────────────────────

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.label,
    required this.value,
    required this.icon,
    this.valueColor,
  });
  final String label;
  final String value;
  final IconData icon;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Icon(icon, size: 18, color: AppColors.textSecondary),
        const SizedBox(height: 4),
        Text(
          value,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w700,
            color: valueColor,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
            fontSize: 10,
          ),
        ),
      ],
    );
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({
    required this.label,
    required this.value,
    required this.icon,
  });
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Icon(icon, color: AppColors.primary, size: 20),
        const SizedBox(height: 4),
        Text(
          value,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w700,
            color: AppColors.primary,
          ),
          textAlign: TextAlign.center,
        ),
        Text(
          label,
          style: theme.textTheme.bodySmall
              ?.copyWith(color: AppColors.textSecondary),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}
