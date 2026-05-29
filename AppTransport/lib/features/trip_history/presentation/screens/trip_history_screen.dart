import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/shared/widgets/skeleton_loader.dart';

// ── Trip record model ─────────────────────────────────────────────────────────

class _TripRecord {
  const _TripRecord({
    required this.id,
    required this.serviceType,
    required this.dateTime,
    required this.origin,
    required this.destination,
    required this.distanceKm,
    required this.durationMin,
    required this.earnings,
    required this.rating,
    required this.isToday,
    required this.isThisWeek,
    required this.isThisMonth,
    required this.passengerName,
  });

  final String id;
  final ServiceType serviceType;
  final String dateTime;
  final String origin;
  final String destination;
  final double distanceKm;
  final int durationMin;
  final double earnings;
  final double rating;
  final bool isToday;
  final bool isThisWeek;
  final bool isThisMonth;
  final String passengerName;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const _mockTrips = [
  _TripRecord(
    id: '#1042',
    serviceType: ServiceType.moto,
    dateTime: 'Hoy, 14:32',
    origin: 'Parque Agueda Gallardo',
    destination: 'Terminal de Transportes',
    distanceKm: 2.3,
    durationMin: 8,
    earnings: 7200,
    rating: 5.0,
    isToday: true,
    isThisWeek: true,
    isThisMonth: true,
    passengerName: 'Valentina R.',
  ),
  _TripRecord(
    id: '#1041',
    serviceType: ServiceType.moto,
    dateTime: 'Hoy, 11:15',
    origin: 'Mercado Central',
    destination: 'Colegio Nacional',
    distanceKm: 1.8,
    durationMin: 6,
    earnings: 5800,
    rating: 4.8,
    isToday: true,
    isThisWeek: true,
    isThisMonth: true,
    passengerName: 'Luis M.',
  ),
  _TripRecord(
    id: '#1040',
    serviceType: ServiceType.envios,
    dateTime: 'Ayer, 16:44',
    origin: 'Droguería La Economía',
    destination: 'Barrio El Centro',
    distanceKm: 1.2,
    durationMin: 5,
    earnings: 5200,
    rating: 5.0,
    isToday: false,
    isThisWeek: true,
    isThisMonth: true,
    passengerName: 'Carolina P.',
  ),
  _TripRecord(
    id: '#1039',
    serviceType: ServiceType.motocarro,
    dateTime: 'Ayer, 09:30',
    origin: 'Plaza de Mercado',
    destination: 'Barrio La Esperanza',
    distanceKm: 3.1,
    durationMin: 12,
    earnings: 9300,
    rating: 4.5,
    isToday: false,
    isThisWeek: true,
    isThisMonth: true,
    passengerName: 'Jorge H.',
  ),
  _TripRecord(
    id: '#1038',
    serviceType: ServiceType.moto,
    dateTime: 'Lun, 15:20',
    origin: 'Hospital San Juan de Dios',
    destination: 'Urbanización El Pinar',
    distanceKm: 2.7,
    durationMin: 10,
    earnings: 8100,
    rating: 4.9,
    isToday: false,
    isThisWeek: true,
    isThisMonth: true,
    passengerName: 'Marcela T.',
  ),
  _TripRecord(
    id: '#1037',
    serviceType: ServiceType.taxi,
    dateTime: 'Lun, 08:45',
    origin: 'Hotel Orquídea',
    destination: 'Alcaldía Municipal',
    distanceKm: 1.5,
    durationMin: 7,
    earnings: 6400,
    rating: 5.0,
    isToday: false,
    isThisWeek: true,
    isThisMonth: true,
    passengerName: 'Andrés F.',
  ),
  _TripRecord(
    id: '#1036',
    serviceType: ServiceType.particular,
    dateTime: 'Dom, 19:00',
    origin: 'Aeropuerto Camilo Daza',
    destination: 'Hotel Cúcuta Plaza',
    distanceKm: 8.4,
    durationMin: 22,
    earnings: 22800,
    rating: 5.0,
    isToday: false,
    isThisWeek: false,
    isThisMonth: true,
    passengerName: 'Claudia V.',
  ),
  _TripRecord(
    id: '#1035',
    serviceType: ServiceType.moto,
    dateTime: '20 may, 13:10',
    origin: 'Parroquia Jesús de Nazaret',
    destination: 'Supertiendas Olímpica',
    distanceKm: 1.9,
    durationMin: 7,
    earnings: 6000,
    rating: 4.7,
    isToday: false,
    isThisWeek: false,
    isThisMonth: true,
    passengerName: 'Sebastián C.',
  ),
  _TripRecord(
    id: '#1034',
    serviceType: ServiceType.envios,
    dateTime: '18 may, 17:30',
    origin: 'Farmacia Salud Total',
    destination: 'Lomas del Norte',
    distanceKm: 2.2,
    durationMin: 9,
    earnings: 7500,
    rating: 5.0,
    isToday: false,
    isThisWeek: false,
    isThisMonth: true,
    passengerName: 'Isabel R.',
  ),
  _TripRecord(
    id: '#1033',
    serviceType: ServiceType.motocarro,
    dateTime: '15 may, 10:00',
    origin: 'Bodega Zona Industrial',
    destination: 'Depósito Central',
    distanceKm: 4.8,
    durationMin: 18,
    earnings: 13200,
    rating: 4.6,
    isToday: false,
    isThisWeek: false,
    isThisMonth: true,
    passengerName: 'Ricardo B.',
  ),
];

// ── Screen ────────────────────────────────────────────────────────────────────

class TripHistoryScreen extends StatefulWidget {
  const TripHistoryScreen({super.key});

  @override
  State<TripHistoryScreen> createState() => _TripHistoryScreenState();
}

class _TripHistoryScreenState extends State<TripHistoryScreen> {
  bool _loading = true;
  int _dateFilterIndex = 0;
  ServiceType? _serviceTypeFilter;

  static const _dateFilters = ['Todos', 'Hoy', 'Semana', 'Mes'];

  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 750), () {
      if (mounted) setState(() => _loading = false);
    });
  }

  List<_TripRecord> get _filtered {
    var list = switch (_dateFilterIndex) {
      1 => _mockTrips.where((t) => t.isToday).toList(),
      2 => _mockTrips.where((t) => t.isThisWeek).toList(),
      3 => _mockTrips.where((t) => t.isThisMonth).toList(),
      _ => _mockTrips.toList(),
    };
    if (_serviceTypeFilter != null) {
      list = list.where((t) => t.serviceType == _serviceTypeFilter).toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final filtered = _filtered;

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Historial de viajes')),
        body: SkeletonLoader(
          child: ListView.separated(
            padding: const EdgeInsets.all(AppConstants.spacingM),
            itemCount: 5,
            separatorBuilder: (_, __) =>
                const SizedBox(height: AppConstants.spacingS),
            itemBuilder: (_, __) => const SkeletonTripTile(),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Historial de viajes')),
      body: Column(
        children: [
          // ── Date filter chips ──────────────────────────────────────────
          SizedBox(
            height: 52,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingM,
                vertical: AppConstants.spacingS,
              ),
              itemCount: _dateFilters.length,
              separatorBuilder: (_, __) =>
                  const SizedBox(width: AppConstants.spacingS),
              itemBuilder: (context, i) => FilterChip(
                label: Text(_dateFilters[i]),
                selected: _dateFilterIndex == i,
                onSelected: (_) => setState(() => _dateFilterIndex = i),
                selectedColor: AppColors.primaryContainer,
                labelStyle: TextStyle(
                  color: _dateFilterIndex == i
                      ? AppColors.primary
                      : AppColors.textSecondary,
                  fontWeight: _dateFilterIndex == i
                      ? FontWeight.w600
                      : FontWeight.w400,
                ),
                showCheckmark: false,
              ),
            ),
          ),

          // ── Service type filter chips ──────────────────────────────────
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingM,
              ),
              children: [
                // "Todos los tipos" chip
                Padding(
                  padding:
                      const EdgeInsets.only(right: AppConstants.spacingS),
                  child: FilterChip(
                    avatar: _serviceTypeFilter == null
                        ? const Icon(Icons.filter_list_rounded, size: 14)
                        : null,
                    label: const Text('Tipo'),
                    selected: _serviceTypeFilter == null,
                    onSelected: (_) =>
                        setState(() => _serviceTypeFilter = null),
                    selectedColor: AppColors.surfaceVariantLight,
                    showCheckmark: false,
                    labelStyle: TextStyle(
                      fontSize: 12,
                      color: _serviceTypeFilter == null
                          ? AppColors.textPrimary
                          : AppColors.textSecondary,
                    ),
                  ),
                ),
                ...ServiceType.values.map((type) {
                  final isSelected = _serviceTypeFilter == type;
                  return Padding(
                    padding:
                        const EdgeInsets.only(right: AppConstants.spacingS),
                    child: FilterChip(
                      avatar: Icon(type.icon,
                          size: 14,
                          color: isSelected ? type.color : AppColors.textSecondary),
                      label: Text(type.displayName),
                      selected: isSelected,
                      onSelected: (_) =>
                          setState(() => _serviceTypeFilter = type),
                      selectedColor: type.containerColor,
                      showCheckmark: false,
                      labelStyle: TextStyle(
                        fontSize: 12,
                        color: isSelected ? type.color : AppColors.textSecondary,
                        fontWeight: isSelected
                            ? FontWeight.w600
                            : FontWeight.w400,
                      ),
                    ),
                  );
                }),
              ],
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),

          // ── Summary banner ─────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingM),
            child: _SummaryBanner(trips: filtered),
          ),
          const SizedBox(height: AppConstants.spacingS),

          // ── Trip list ──────────────────────────────────────────────────
          Expanded(
            child: filtered.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.route_rounded,
                            size: 48, color: AppColors.outlineLight),
                        const SizedBox(height: AppConstants.spacingM),
                        Text(
                          'Sin viajes en este período',
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(color: AppColors.textSecondary),
                        ),
                      ],
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(AppConstants.spacingM),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) =>
                        const SizedBox(height: AppConstants.spacingS),
                    itemBuilder: (context, i) =>
                        _TripHistoryTile(trip: filtered[i]),
                  ),
          ),
        ],
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _SummaryBanner extends StatelessWidget {
  const _SummaryBanner({required this.trips});
  final List<_TripRecord> trips;

  @override
  Widget build(BuildContext context) {
    final totalEarnings = trips.fold<double>(0, (acc, t) => acc + t.earnings);
    final avgRating = trips.isEmpty
        ? 0.0
        : trips.fold<double>(0, (acc, t) => acc + t.rating) / trips.length;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppConstants.spacingM,
        vertical: AppConstants.spacingS,
      ),
      decoration: BoxDecoration(
        color: AppColors.primaryContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _BannerStat(
              label: 'Viajes', value: trips.length.toString()),
          Container(
              width: 1,
              height: 32,
              color: AppColors.primary.withValues(alpha: 0.3)),
          _BannerStat(
              label: 'Ganancias',
              value: CurrencyFormatter.format(totalEarnings)),
          Container(
              width: 1,
              height: 32,
              color: AppColors.primary.withValues(alpha: 0.3)),
          _BannerStat(
            label: 'Calificación',
            value: trips.isEmpty
                ? '--'
                : '★ ${avgRating.toStringAsFixed(1)}',
          ),
        ],
      ),
    );
  }
}

class _BannerStat extends StatelessWidget {
  const _BannerStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Text(
          value,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: AppColors.primary,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.primaryDim,
            fontSize: 11,
          ),
        ),
      ],
    );
  }
}

class _TripHistoryTile extends StatefulWidget {
  const _TripHistoryTile({required this.trip});
  final _TripRecord trip;

  @override
  State<_TripHistoryTile> createState() => _TripHistoryTileState();
}

class _TripHistoryTileState extends State<_TripHistoryTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final trip = widget.trip;

    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: AnimatedContainer(
        duration: AppConstants.shortAnimation,
        padding: const EdgeInsets.all(AppConstants.spacingM),
        decoration: BoxDecoration(
          color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: Border.all(
            color: _expanded
                ? trip.serviceType.color.withValues(alpha: 0.4)
                : (isDark ? AppColors.outlineDark : AppColors.outlineLight),
            width: _expanded ? 1.5 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header row ───────────────────────────────────────────────
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: trip.serviceType.containerColor,
                    borderRadius:
                        BorderRadius.circular(AppConstants.radiusMedium),
                  ),
                  child: Icon(trip.serviceType.icon,
                      size: 18, color: trip.serviceType.color),
                ),
                const SizedBox(width: AppConstants.spacingS),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            trip.serviceType.displayName,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: trip.serviceType.color,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            trip.id,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: AppColors.textTertiary,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        trip.dateTime,
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      CurrencyFormatter.format(trip.earnings),
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary,
                      ),
                    ),
                    Row(
                      children: [
                        const Icon(Icons.star_rounded,
                            size: 12, color: AppColors.star),
                        Text(
                          ' ${trip.rating.toStringAsFixed(1)}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingS),

            // ── Route rows ───────────────────────────────────────────────
            _RouteRow(
              icon: Icons.radio_button_checked_rounded,
              color: AppColors.pickupMarker,
              text: trip.origin,
            ),
            const SizedBox(height: 2),
            _RouteRow(
              icon: Icons.location_on_rounded,
              color: AppColors.destinationMarker,
              text: trip.destination,
            ),
            const SizedBox(height: AppConstants.spacingS),

            // ── Chips row ────────────────────────────────────────────────
            Row(
              children: [
                _TripChip(
                    icon: Icons.straighten_rounded,
                    label: '${trip.distanceKm.toStringAsFixed(1)} km'),
                const SizedBox(width: AppConstants.spacingS),
                _TripChip(
                    icon: Icons.access_time_rounded,
                    label: '${trip.durationMin} min'),
                const Spacer(),
                Icon(
                  _expanded
                      ? Icons.expand_less_rounded
                      : Icons.expand_more_rounded,
                  size: 16,
                  color: AppColors.textTertiary,
                ),
              ],
            ),

            // ── Expanded detail ──────────────────────────────────────────
            if (_expanded) ...[
              const Divider(height: AppConstants.spacingL),
              Row(
                children: [
                  _DetailItem(
                    icon: Icons.person_rounded,
                    label: 'Pasajero',
                    value: trip.passengerName,
                  ),
                  const SizedBox(width: AppConstants.spacingL),
                  _DetailItem(
                    icon: Icons.payments_outlined,
                    label: 'Tarifa neta',
                    value: CurrencyFormatter.format(trip.earnings),
                    valueColor: AppColors.primary,
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RouteRow extends StatelessWidget {
  const _RouteRow(
      {required this.icon, required this.color, required this.text});
  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 4),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

class _TripChip extends StatelessWidget {
  const _TripChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 11, color: AppColors.textTertiary),
        const SizedBox(width: 2),
        Text(
          label,
          style: const TextStyle(
              fontSize: 11, color: AppColors.textSecondary),
        ),
      ],
    );
  }
}

class _DetailItem extends StatelessWidget {
  const _DetailItem({
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
  });
  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: AppColors.textSecondary),
        const SizedBox(width: 4),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(
                  fontSize: 10, color: AppColors.textSecondary),
            ),
            Text(
              value,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: valueColor ?? AppColors.textPrimary,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
