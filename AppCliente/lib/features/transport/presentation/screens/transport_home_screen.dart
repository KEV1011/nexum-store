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
import 'package:nexum_client/features/errands/domain/entities/errand_entity.dart';
import 'package:nexum_client/features/errands/presentation/providers/errand_provider.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart';
import 'package:nexum_client/features/intercity/presentation/providers/intercity_provider.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';

// Centro de Pamplona, Nariño
const _pamplona = LatLng(1.2136, -77.2811);

// Vehículos cercanos simulados (se animan periódicamente)
final _seedVehicles = <_NearbyVehicle>[
  _NearbyVehicle(TransportServiceType.transporte, const LatLng(1.2155, -77.2838)),
  _NearbyVehicle(TransportServiceType.transporte, const LatLng(1.2112, -77.2792)),
  _NearbyVehicle(TransportServiceType.transporte, const LatLng(1.2148, -77.2770)),
  _NearbyVehicle(TransportServiceType.transporte, const LatLng(1.2172, -77.2822)),
  _NearbyVehicle(TransportServiceType.transporte, const LatLng(1.2108, -77.2847)),
  _NearbyVehicle(TransportServiceType.moto, const LatLng(1.2162, -77.2802)),
  _NearbyVehicle(TransportServiceType.moto, const LatLng(1.2129, -77.2829)),
  _NearbyVehicle(TransportServiceType.moto, const LatLng(1.2141, -77.2768)),
  _NearbyVehicle(TransportServiceType.envios, const LatLng(1.2143, -77.2862)),
  _NearbyVehicle(TransportServiceType.envios, const LatLng(1.2175, -77.2759)),
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
  TransportServiceType _selected = TransportServiceType.transporte;
  Timer? _vehicleTimer;
  final _rng = math.Random();
  late final List<_NearbyVehicle> _vehicles;
  late final AnimationController _panelCtrl;
  late final Animation<double> _panelAnim;

  static const Map<TransportServiceType, int> _driverCounts = {
    TransportServiceType.transporte: 5,
    TransportServiceType.moto: 3,
    TransportServiceType.envios: 2,
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
    final intercityState = ref.watch(intercityProvider);
    final errandState = ref.watch(errandProvider);
    final hasActive = !state.isLoading && state.active.isNotEmpty;
    final hasIntercityActive = intercityState.active != null;
    final hasErrandActive = errandState.active != null;
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

          // ── Banner de viaje activo (urbano) ─────────────────────────────
          if (hasActive)
            Positioned(
              top: topPad + 64,
              left: 16,
              right: 16,
              child: _ActiveTripBanner(request: state.active.first),
            ),

          // ── Banner de viaje intermunicipal activo ────────────────────────
          if (hasIntercityActive)
            Positioned(
              top: topPad + (hasActive ? 130 : 64),
              left: 16,
              right: 16,
              child: _IntercityActiveBanner(
                request: intercityState.active!,
              ),
            ),

          // ── Banner de mandado activo ─────────────────────────────────────
          if (hasErrandActive)
            Positioned(
              top: topPad +
                  64 +
                  (hasActive ? 66 : 0) +
                  (hasIntercityActive ? 66 : 0),
              left: 16,
              right: 16,
              child: _ErrandActiveBanner(errand: errandState.active!),
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

// ── Panel inferior (siempre oscuro, estilo InDriver) ─────────────────────────

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

  // Colores fijos dark panel
  static const _panelBg = Color(0xFF1A1D27);
  static const _cardBg = Color(0xFF252836);
  static const _handleColor = Color(0xFF2E3347);
  static const _subText = Color(0xFF94A3B8);

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: _panelBg,
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
        boxShadow: [
          BoxShadow(color: Color(0x55000000), blurRadius: 28, offset: Offset(0, -6)),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 10, bottom: 8),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: _handleColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Tabs de servicio
          SizedBox(
            height: 114,
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
                  onTap: () => onServiceTap(svc),
                );

              },
            ),
          ),

          const SizedBox(height: 12),

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
                    horizontal: 16, vertical: 15),
                decoration: BoxDecoration(
                  color: _cardBg,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: _colorOf(selected).withValues(alpha: 0.5),
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
                        style: const TextStyle(
                          fontSize: 15,
                          color: _subText,
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

          // Tarjeta viaje intermunicipal
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _IntercityCard(),
          ),

          const SizedBox(height: 8),

          // Tarjeta viajes compartidos (Modelo A)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _PooledCard(),
          ),

          const SizedBox(height: 8),

          // Tarjeta de mandados
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _ErrandCard(),
          ),

          const SizedBox(height: 10),

          // Recientes
          if (history.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  const Icon(Icons.history_rounded, size: 14, color: _subText),
                  const SizedBox(width: 6),
                  const Text(
                    'Recientes',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: _subText,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            ...history.map(
              (r) => _RecentTile(request: r),
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
    required this.onTap,
  });

  final TransportServiceType service;
  final bool isSelected;
  final int count;
  final VoidCallback onTap;

  static const _cardBg = Color(0xFF252836);
  static const _borderColor = Color(0xFF2E3347);
  static const _subText = Color(0xFF94A3B8);

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(service);
    final bg = isSelected ? color : _cardBg;
    final iconColor = isSelected ? Colors.white : color;
    final labelColor =
        isSelected ? Colors.white : const Color(0xFFE2E8F0);

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
        width: 110,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(18),
          border: isSelected
              ? null
              : Border.all(color: _borderColor),
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
              padding: const EdgeInsets.fromLTRB(12, 14, 12, 10),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(_iconOf(service), size: 32, color: iconColor),
                  const SizedBox(height: 8),
                  Text(
                    service.label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: labelColor,
                    ),
                  ),
                  Text(
                    service.description,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 9, color: _subText),
                  ),
                ],
              ),
            ),
            if (count > 0)
              Positioned(
                top: 8,
                right: 8,
                child: Container(
                  width: 21,
                  height: 21,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? Colors.white.withValues(alpha: 0.22)
                        : color.withValues(alpha: 0.18),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      '$count',
                      style: TextStyle(
                        fontSize: 11,
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
  const _RecentTile({required this.request});

  final TransportRequestEntity request;

  static const _textColor = Color(0xFFE2E8F0);
  static const _subText = Color(0xFF94A3B8);
  static const _iconBg = Color(0xFF252836);

  @override
  Widget build(BuildContext context) {
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
              decoration: const BoxDecoration(
                color: _iconBg,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.history_rounded,
                  size: 18, color: _subText),
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
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: _textColor,
                    ),
                  ),
                  Text(
                    '${request.serviceType.label} · '
                    '${CurrencyFormatter.format(request.estimatedFare)}',
                    style: const TextStyle(fontSize: 11, color: _subText),
                  ),
                ],
              ),
            ),
            const Icon(Icons.north_west_rounded,
                size: 17, color: _subText),
          ],
        ),
      ),
    );
  }
}

// ── Tarjeta intermunicipal en el panel ────────────────────────────────────────

class _IntercityCard extends StatelessWidget {
  static const _bg = Color(0xFF1E3A8A);
  static const _cardBg = Color(0xFF172554);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push(AppRoutes.intercityBooking),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: _cardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _bg.withValues(alpha: 0.6)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: _bg.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.directions_car_filled_rounded,
                color: Color(0xFF93C5FD),
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Viaje intermunicipal',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    'Cúcuta · Bucaramanga · Chitagá y más',
                    style: TextStyle(
                      color: Color(0xFF93C5FD),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: _bg,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                'Reservar',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Tarjeta de viajes compartidos (Modelo A) ──────────────────────────────────

class _PooledCard extends StatelessWidget {
  static const _bg = Color(0xFF1E3A8A);
  static const _cardBg = Color(0xFF172554);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push(AppRoutes.pooledSearch),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: _cardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _bg.withValues(alpha: 0.6)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: _bg.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.groups_rounded,
                color: Color(0xFF93C5FD),
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Viajes compartidos',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    'Reserva un puesto y comparte el viaje',
                    style: TextStyle(color: Color(0xFF93C5FD), fontSize: 11),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: _bg,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                'Buscar',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Banner de viaje intermunicipal activo ─────────────────────────────────────

class _IntercityActiveBanner extends StatelessWidget {
  const _IntercityActiveBanner({required this.request});

  final IntercityRequestEntity request;

  static const _bg = Color(0xFF1E3A8A);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push(AppRoutes.intercityStatus),
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: _bg,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: _bg.withValues(alpha: 0.45),
              blurRadius: 14,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Row(
          children: [
            const Icon(Icons.route_rounded, size: 20, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${request.origin.displayName} → ${request.destination.displayName}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    request.status.label as String,
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

// ── Tarjeta de mandados en el panel ───────────────────────────────────────────

class _ErrandCard extends StatelessWidget {
  static const _cardBg = Color(0xFF26201A);
  static const _accent = Color(0xFFD97706);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push(AppRoutes.errandBooking),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: _cardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _accent.withValues(alpha: 0.5)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: _accent.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.run_circle_rounded,
                color: Color(0xFFFBBF24),
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Mandados',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    'Farmacia, mercado, pagos, recoger algo...',
                    style: TextStyle(
                      color: Color(0xFFFBBF24),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: _accent,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                'Pedir',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Banner de mandado activo ──────────────────────────────────────────────────

class _ErrandActiveBanner extends StatelessWidget {
  const _ErrandActiveBanner({required this.errand});

  final ErrandEntity errand;

  @override
  Widget build(BuildContext context) {
    final color = errand.status.color;
    return GestureDetector(
      onTap: () => context.push(AppRoutes.errandStatus),
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
            Icon(errand.category.icon, size: 20, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Mandado · ${errand.category.label}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    errand.status.label,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

IconData _iconOf(TransportServiceType t) => switch (t) {
      TransportServiceType.transporte => Icons.directions_car_rounded,
      TransportServiceType.moto => Icons.two_wheeler_rounded,
      TransportServiceType.envios => Icons.inventory_2_rounded,
    };

Color _colorOf(TransportServiceType t) => switch (t) {
      TransportServiceType.transporte => AppColors.serviceParticular,
      TransportServiceType.moto => AppColors.serviceMoto,
      TransportServiceType.envios => AppColors.serviceEnvios,
    };
