import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';

// Centro de Pamplona, Nariño
const _pamplona = LatLng(1.2136, -77.2811);

// Vehículos cercanos simulados (se animan periódicamente)
final _seedVehicles = <_NearbyVehicle>[
  _NearbyVehicle(TransportServiceType.taxi, const LatLng(1.2155, -77.2838)),
  _NearbyVehicle(TransportServiceType.taxi, const LatLng(1.2112, -77.2792)),
  _NearbyVehicle(TransportServiceType.taxi, const LatLng(1.2148, -77.2770)),
  _NearbyVehicle(TransportServiceType.taxi, const LatLng(1.2172, -77.2822)),
  _NearbyVehicle(TransportServiceType.moto, const LatLng(1.2162, -77.2802)),
  _NearbyVehicle(TransportServiceType.moto, const LatLng(1.2129, -77.2829)),
  _NearbyVehicle(TransportServiceType.moto, const LatLng(1.2141, -77.2768)),
  _NearbyVehicle(
      TransportServiceType.particular, const LatLng(1.2108, -77.2847)),
  _NearbyVehicle(
      TransportServiceType.particular, const LatLng(1.2175, -77.2759)),
  _NearbyVehicle(TransportServiceType.envios, const LatLng(1.2143, -77.2862)),
];

class _NearbyVehicle {
  _NearbyVehicle(this.type, this.position);
  final TransportServiceType type;
  LatLng position;
}

// ── Pantalla principal ────────────────────────────────────────────────────────

class TransportHomeScreen extends ConsumerStatefulWidget {
  const TransportHomeScreen({super.key});

  @override
  ConsumerState<TransportHomeScreen> createState() =>
      _TransportHomeScreenState();
}

class _TransportHomeScreenState extends ConsumerState<TransportHomeScreen>
    with TickerProviderStateMixin {
  final _mapController = MapController();
  TransportServiceType _selected = TransportServiceType.taxi;
  Timer? _vehicleTimer;
  final _rng = math.Random();
  late final List<_NearbyVehicle> _vehicles;
  late final AnimationController _panelCtrl;
  late final Animation<double> _panelAnim;

  static const Map<TransportServiceType, int> _driverCounts = {
    TransportServiceType.taxi: 4,
    TransportServiceType.moto: 3,
    TransportServiceType.particular: 2,
    TransportServiceType.envios: 1,
  };

  @override
  void initState() {
    super.initState();
    _vehicles = _seedVehicles
        .map((v) => _NearbyVehicle(v.type, v.position))
        .toList();

    _panelCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 550),
    );
    _panelAnim = CurvedAnimation(
      parent: _panelCtrl,
      curve: Curves.easeOutCubic,
    );
    _panelCtrl.forward();

    _vehicleTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted) return;
      setState(() {
        for (final v in _vehicles) {
          v.position = LatLng(
            v.position.latitude + (_rng.nextDouble() - 0.5) * 0.0006,
            v.position.longitude + (_rng.nextDouble() - 0.5) * 0.0006,
          );
        }
      });
    });
  }

  @override
  void dispose() {
    _vehicleTimer?.cancel();
    _panelCtrl.dispose();
    _mapController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(transportProvider);
    final hasActive = !state.isLoading && state.active.isNotEmpty;
    final topPad = MediaQuery.of(context).padding.top;

    return Scaffold(
      body: Stack(
        children: [
          // ── Mapa de fondo ────────────────────────────────────────────────
          FlutterMap(
            mapController: _mapController,
            options: const MapOptions(
              initialCenter: _pamplona,
              initialZoom: 15.2,
            ),
            children: [
              TileLayer(
                urlTemplate:
                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.nexum.client',
              ),
              MarkerLayer(
                markers: [
                  // Mi ubicación
                  Marker(
                    point: _pamplona,
                    width: 22,
                    height: 22,
                    child: _MyLocationDot(),
                  ),
                  // Vehículos cercanos del servicio seleccionado
                  ..._vehicles
                      .where((v) => v.type == _selected)
                      .map(
                        (v) => Marker(
                          point: v.position,
                          width: 44,
                          height: 44,
                          child: _VehicleMarker(type: v.type),
                        ),
                      ),
                ],
              ),
            ],
          ),

          // ── Barra superior ───────────────────────────────────────────────
          Positioned(
            top: topPad + 10,
            left: 16,
            right: 16,
            child: Row(
              children: [
                _LocationChip(),
                const Spacer(),
                _ProfileButton(),
              ],
            ),
          ),

          // ── Banner de viaje activo ───────────────────────────────────────
          if (hasActive)
            Positioned(
              top: topPad + 64,
              left: 16,
              right: 16,
              child: _ActiveTripBanner(request: state.active.first),
            ),

          // ── Panel inferior ───────────────────────────────────────────────
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0, 1),
                end: Offset.zero,
              ).animate(_panelAnim),
              child: _BottomPanel(
                selected: _selected,
                driverCounts: _driverCounts,
                history: state.past.take(3).toList(),
                onServiceTap: (t) => setState(() => _selected = t),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Punto de mi ubicación ─────────────────────────────────────────────────────

class _MyLocationDot extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.secondary,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(color: Colors.black38, blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: const Center(
        child: SizedBox(
          width: 10,
          height: 10,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}

// ── Marcador de vehículo ──────────────────────────────────────────────────────

class _VehicleMarker extends StatelessWidget {
  const _VehicleMarker({required this.type});
  final TransportServiceType type;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(type);
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 2.5),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.35),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Icon(_iconOf(type), size: 22, color: color),
    );
  }
}

// ── Chip de ubicación (top left) ──────────────────────────────────────────────

class _LocationChip extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(26),
        boxShadow: const [
          BoxShadow(color: Colors.black26, blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.location_on_rounded,
              size: 15, color: AppColors.serviceMoto),
          SizedBox(width: 4),
          Text(
            'Pamplona, Nariño',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          SizedBox(width: 2),
          Icon(Icons.keyboard_arrow_down_rounded,
              size: 17, color: AppColors.textSecondary),
        ],
      ),
    );
  }
}

// ── Botón perfil (top right) ──────────────────────────────────────────────────

class _ProfileButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 40,
      decoration: const BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(color: Colors.black26, blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: const Icon(Icons.person_rounded,
          size: 21, color: AppColors.textSecondary),
    );
  }
}

// ── Banner viaje activo ───────────────────────────────────────────────────────

class _ActiveTripBanner extends StatelessWidget {
  const _ActiveTripBanner({required this.request});
  final TransportRequestEntity request;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(request.serviceType);
    return GestureDetector(
      onTap: () =>
          context.push(AppRoutes.transportTrackingPath(request.id)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.45),
              blurRadius: 14,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Row(
          children: [
            Icon(_iconOf(request.serviceType), size: 20, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    request.status.label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    request.destinationAddress,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Colors.white70, fontSize: 11),
                  ),
                ],
              ),
            ),
            const Row(
              children: [
                Text(
                  'Ver',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700),
                ),
                SizedBox(width: 2),
                Icon(Icons.chevron_right_rounded,
                    size: 18, color: Colors.white),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Panel inferior ────────────────────────────────────────────────────────────

class _BottomPanel extends StatelessWidget {
  const _BottomPanel({
    required this.selected,
    required this.driverCounts,
    required this.history,
    required this.onServiceTap,
  });

  final TransportServiceType selected;
  final Map<TransportServiceType, int> driverCounts;
  final List<TransportRequestEntity> history;
  final ValueChanged<TransportServiceType> onServiceTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF1A1D27) : Colors.white;
    final subColor =
        isDark ? const Color(0xFF94A3B8) : AppColors.textSecondary;
    final inputBg =
        isDark ? const Color(0xFF252836) : const Color(0xFFF0F2F5);

    return Container(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
        boxShadow: const [
          BoxShadow(
              color: Color(0x33000000),
              blurRadius: 24,
              offset: Offset(0, -5)),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 10, bottom: 6),
              width: 38,
              height: 4,
              decoration: BoxDecoration(
                color: isDark
                    ? const Color(0xFF2E3347)
                    : const Color(0xFFDDE1E7),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Tabs de servicio
          SizedBox(
            height: 92,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: TransportServiceType.values.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, i) {
                final svc = TransportServiceType.values[i];
                return _ServiceTab(
                  service: svc,
                  isSelected: svc == selected,
                  count: driverCounts[svc] ?? 0,
                  isDark: isDark,
                  onTap: () => onServiceTap(svc),
                );
              },
            ),
          ),

          const SizedBox(height: 10),

          // Barra de búsqueda / destino
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: GestureDetector(
              onTap: () => context.push(
                AppRoutes.transportBooking,
                extra: selected,
              ),
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: inputBg,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: _colorOf(selected).withValues(alpha: 0.4),
                    width: 1.5,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(Icons.search_rounded,
                        size: 22, color: _colorOf(selected)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '¿A dónde y por cuánto?',
                        style: TextStyle(
                          fontSize: 15,
                          color: subColor,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 5),
                      decoration: BoxDecoration(
                        color: _colorOf(selected),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Text(
                        'Pedir',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          const SizedBox(height: 10),

          // Recientes
          if (history.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Icon(Icons.history_rounded, size: 14, color: subColor),
                  const SizedBox(width: 6),
                  Text(
                    'Recientes',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: subColor,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            ...history.map(
              (r) => _RecentTile(
                request: r,
                isDark: isDark,
                subColor: subColor,
              ),
            ),
          ],

          SizedBox(height: MediaQuery.of(context).padding.bottom + 10),
        ],
      ),
    );
  }
}

// ── Tab de servicio ───────────────────────────────────────────────────────────

class _ServiceTab extends StatelessWidget {
  const _ServiceTab({
    required this.service,
    required this.isSelected,
    required this.count,
    required this.isDark,
    required this.onTap,
  });

  final TransportServiceType service;
  final bool isSelected;
  final int count;
  final bool isDark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(service);
    final bg = isSelected
        ? color
        : (isDark ? const Color(0xFF252836) : const Color(0xFFF0F2F5));
    final iconColor = isSelected ? Colors.white : color;
    final labelColor = isSelected
        ? Colors.white
        : (isDark ? const Color(0xFFE2E8F0) : AppColors.textPrimary);
    final subTextColor = isDark
        ? const Color(0xFF94A3B8)
        : AppColors.textSecondary;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
        width: 88,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(18),
          border: isSelected
              ? null
              : Border.all(
                  color: isDark
                      ? const Color(0xFF2E3347)
                      : const Color(0xFFDDE1E7),
                ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: color.withValues(alpha: 0.38),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 12, 10, 10),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(_iconOf(service), size: 26, color: iconColor),
                  const SizedBox(height: 6),
                  Text(
                    service.label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: labelColor,
                    ),
                  ),
                  if (!isSelected)
                    Text(
                      'Desde ${CurrencyFormatter.format(service.baseFare)}',
                      style: TextStyle(fontSize: 9, color: subTextColor),
                    ),
                ],
              ),
            ),
            if (count > 0)
              Positioned(
                top: 7,
                right: 7,
                child: Container(
                  width: 19,
                  height: 19,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? Colors.white.withValues(alpha: 0.22)
                        : color.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      '$count',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: isSelected ? Colors.white : color,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Tile de viaje reciente ────────────────────────────────────────────────────

class _RecentTile extends StatelessWidget {
  const _RecentTile({
    required this.request,
    required this.isDark,
    required this.subColor,
  });

  final TransportRequestEntity request;
  final bool isDark;
  final Color subColor;

  @override
  Widget build(BuildContext context) {
    final textColor =
        isDark ? const Color(0xFFE2E8F0) : AppColors.textPrimary;
    final iconBg =
        isDark ? const Color(0xFF252836) : const Color(0xFFF0F2F5);

    return InkWell(
      onTap: () =>
          context.push(AppRoutes.transportTrackingPath(request.id)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: iconBg,
                shape: BoxShape.circle,
              ),
              child:
                  Icon(Icons.history_rounded, size: 18, color: subColor),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    request.destinationAddress,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: textColor,
                    ),
                  ),
                  Text(
                    '${request.serviceType.label} · '
                    '${CurrencyFormatter.format(request.estimatedFare)}',
                    style: TextStyle(fontSize: 11, color: subColor),
                  ),
                ],
              ),
            ),
            Icon(Icons.north_west_rounded, size: 17, color: subColor),
          ],
        ),
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

IconData _iconOf(TransportServiceType t) => switch (t) {
      TransportServiceType.taxi => Icons.local_taxi_rounded,
      TransportServiceType.moto => Icons.two_wheeler_rounded,
      TransportServiceType.particular => Icons.directions_car_rounded,
      TransportServiceType.envios => Icons.inventory_2_rounded,
    };

Color _colorOf(TransportServiceType t) => switch (t) {
      TransportServiceType.taxi => AppColors.serviceTaxi,
      TransportServiceType.moto => AppColors.serviceMoto,
      TransportServiceType.particular => AppColors.serviceParticular,
      TransportServiceType.envios => AppColors.serviceEnvios,
    };
