import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';

class TripHistoryScreen extends StatefulWidget {
  const TripHistoryScreen({super.key});

  @override
  State<TripHistoryScreen> createState() => _TripHistoryScreenState();
}

class _TripHistoryScreenState extends State<TripHistoryScreen> {
  int _filterIndex = 0;
  static const _filters = ['Todos', 'Hoy', 'Semana', 'Mes'];

  List<_TripRecord> get _filtered {
    return switch (_filterIndex) {
      1 => _mockTrips.where((t) => t.isToday).toList(),
      2 => _mockTrips.where((t) => t.isThisWeek).toList(),
      _ => _mockTrips,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final filtered = _filtered;

    return Scaffold(
      appBar: AppBar(title: const Text('Historial de viajes')),
      body: Column(
        children: [
          // Filter chips
          SizedBox(
            height: 52,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingM,
                vertical: AppConstants.spacingS,
              ),
              itemCount: _filters.length,
              separatorBuilder: (_, __) =>
                  const SizedBox(width: AppConstants.spacingS),
              itemBuilder: (context, i) => FilterChip(
                label: Text(_filters[i]),
                selected: _filterIndex == i,
                onSelected: (_) => setState(() => _filterIndex = i),
                selectedColor: AppColors.primaryContainer,
                labelStyle: TextStyle(
                  color: _filterIndex == i
                      ? AppColors.primary
                      : AppColors.textSecondary,
                  fontWeight: _filterIndex == i
                      ? FontWeight.w600
                      : FontWeight.w400,
                ),
                showCheckmark: false,
              ),
            ),
          ),

          // Summary banner
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingM,
            ),
            child: _SummaryBanner(trips: filtered),
          ),
          const SizedBox(height: AppConstants.spacingS),

          // List
          Expanded(
            child: filtered.isEmpty
                ? Center(
                    child: Text(
                      'Sin viajes en este período',
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: AppColors.textSecondary),
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

class _SummaryBanner extends StatelessWidget {
  const _SummaryBanner({required this.trips});

  final List<_TripRecord> trips;

  @override
  Widget build(BuildContext context) {
    final totalEarnings =
        trips.fold<double>(0, (acc, t) => acc + t.earnings);

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
            label: 'Viajes',
            value: trips.length.toString(),
          ),
          Container(width: 1, height: 32, color: AppColors.primary.withValues(alpha: 0.3)),
          _BannerStat(
            label: 'Ganancias',
            value: CurrencyFormatter.format(totalEarnings),
          ),
          Container(width: 1, height: 32, color: AppColors.primary.withValues(alpha: 0.3)),
          _BannerStat(
            label: 'Promedio',
            value: trips.isEmpty
                ? '\$0'
                : CurrencyFormatter.format(totalEarnings / trips.length),
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

class _TripHistoryTile extends StatelessWidget {
  const _TripHistoryTile({required this.trip});

  final _TripRecord trip;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: trip.serviceType.containerColor,
                  borderRadius:
                      BorderRadius.circular(AppConstants.radiusMedium),
                ),
                child: Icon(
                  trip.serviceType.icon,
                  size: 18,
                  color: trip.serviceType.color,
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      trip.serviceType.displayName,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: trip.serviceType.color,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      trip.dateTime,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
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
          Row(
            children: [
              const Icon(Icons.radio_button_checked_rounded,
                  size: 12, color: AppColors.pickupMarker),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  trip.origin,
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Row(
            children: [
              const Icon(Icons.location_on_rounded,
                  size: 12, color: AppColors.destinationMarker),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  trip.destination,
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingS),
          Row(
            children: [
              _TripChip(
                  icon: Icons.straighten_rounded,
                  label: '${trip.distanceKm.toStringAsFixed(1)} km'),
              const SizedBox(width: AppConstants.spacingS),
              _TripChip(
                  icon: Icons.access_time_rounded,
                  label: '${trip.durationMin} min'),
            ],
          ),
        ],
      ),
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
      children: [
        Icon(icon, size: 11, color: AppColors.textTertiary),
        const SizedBox(width: 2),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: AppColors.textSecondary,
          ),
        ),
      ],
    );
  }
}

class _TripRecord {
  const _TripRecord({
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
  });

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
}

const _mockTrips = [
  _TripRecord(
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
  ),
  _TripRecord(
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
  ),
  _TripRecord(
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
  ),
  _TripRecord(
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
  ),
  _TripRecord(
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
  ),
  _TripRecord(
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
  ),
];
