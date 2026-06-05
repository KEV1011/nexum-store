import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/location/location_service.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/errands/domain/entities/errand_entity.dart';
import 'package:nexum_client/features/errands/presentation/providers/errand_provider.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart';
import 'package:nexum_client/features/intercity/presentation/providers/intercity_provider.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';

// Vehículos cercanos simulados (se animan periódicamente).
final _seedVehicles = <_NearbyVehicle>[
  _NearbyVehicle(
    TransportServiceType.transporte,
    const LatLng(7.3773, -72.6513),
  ),
  _NearbyVehicle(
    TransportServiceType.transporte,
    const LatLng(7.3730, -72.6467),
  ),
  _NearbyVehicle(
    TransportServiceType.transporte,
    const LatLng(7.3766, -72.6445),
  ),
  _NearbyVehicle(
    TransportServiceType.transporte,
    const LatLng(7.3790, -72.6497),
  ),
  _NearbyVehicle(TransportServiceType.moto, const LatLng(7.3780, -72.6477)),
  _NearbyVehicle(TransportServiceType.moto, const LatLng(7.3747, -72.6504)),
  _NearbyVehicle(TransportServiceType.moto, const LatLng(7.3759, -72.6443)),
  _NearbyVehicle(TransportServiceType.envios, const LatLng(7.3761, -72.6537)),
  _NearbyVehicle(TransportServiceType.envios, const LatLng(7.3793, -72.6434)),
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

class _TransportHomeScreenState extends ConsumerState<TransportHomeScreen> {
  final MapController _map = MapController();
  Timer? _vehicleTimer;
  final _rng = math.Random();
  late final List<_NearbyVehicle> _vehicles;
  LatLng _myLocation = kPamplonaCenter;

  @override
  void initState() {
    super.initState();
    _vehicles = _seedVehicles
        .map((v) => _NearbyVehicle(v.type, v.position))
        .toList();

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

    _resolveLocation();
  }

  Future<void> _resolveLocation() async {
    final loc = await ref.read(locationServiceProvider).current();
    if (!mounted) return;
    setState(() => _myLocation = loc.position);
    if (!loc.isFallback) {
      _map.move(loc.position, 15.5);
    }
  }

  @override
  void dispose() {
    _vehicleTimer?.cancel();
    _map.dispose();
    super.dispose();
  }

  List<Marker> get _markers => [
    for (final v in _vehicles)
      Marker(
        point: v.position,
        width: 20,
        height: 20,
        child: Icon(Icons.circle, color: _colorOf(v.type), size: 14),
      ),
  ];

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
          // ── Mapa de fondo (OpenStreetMap via flutter_map) ────────────────
          FlutterMap(
            mapController: _map,
            options: MapOptions(
              initialCenter: _myLocation,
              initialZoom: 15.2,
            ),
            children: [
              TileLayer(
                urlTemplate:
                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.nexum.nexum_client',
              ),
              MarkerLayer(markers: _markers),
            ],
          ),

          // ── Barra superior ───────────────────────────────────────────────
          Positioned(
            top: topPad + 10,
            left: 16,
            right: 16,
            child: Row(
              children: [_LocationChip(), const Spacer(), _ProfileButton()],
            ),
          ),

          // ── Banners de servicios activos ─────────────────────────────────
          if (hasActive)
            Positioned(
              top: topPad + 64,
              left: 16,
              right: 16,
              child: _ActiveTripBanner(request: state.active.first),
            ),
          if (hasIntercityActive)
            Positioned(
              top: topPad + (hasActive ? 130 : 64),
              left: 16,
              right: 16,
              child: _IntercityActiveBanner(request: intercityState.active!),
            ),
          if (hasErrandActive)
            Positioned(
              top:
                  topPad +
                  64 +
                  (hasActive ? 66 : 0) +
                  (hasIntercityActive ? 66 : 0),
              left: 16,
              right: 16,
              child: _ErrandActiveBanner(errand: errandState.active!),
            ),

          // ── Botón de recentrar ───────────────────────────────────────────
          Positioned(
            right: 16,
            bottom: MediaQuery.of(context).size.height * 0.20 + 12,
            child: _RecenterButton(onTap: _recenter),
          ),

          // ── Panel inferior compacto y arrastrable (estilo inDriver) ──────
          DraggableScrollableSheet(
            initialChildSize: 0.18,
            minChildSize: 0.18,
            maxChildSize: 0.62,
            snap: true,
            snapSizes: const [0.18, 0.62],
            builder: (context, scrollController) => _BottomPanel(
              scrollController: scrollController,
              history: state.past.take(3).toList(),
            ),
          ),
        ],
      ),
    );
  }

  void _recenter() {
    _map.move(_myLocation, 15.5);
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
          Icon(
            Icons.location_on_rounded,
            size: 15,
            color: AppColors.serviceMoto,
          ),
          SizedBox(width: 4),
          Text(
            'Pamplona, N. de Santander',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          SizedBox(width: 2),
          Icon(
            Icons.keyboard_arrow_down_rounded,
            size: 17,
            color: AppColors.textSecondary,
          ),
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
      child: const Icon(
        Icons.person_rounded,
        size: 21,
        color: AppColors.textSecondary,
      ),
    );
  }
}

// ── Botón recentrar ───────────────────────────────────────────────────────────

class _RecenterButton extends StatelessWidget {
  const _RecenterButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 3,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: const Padding(
          padding: EdgeInsets.all(10),
          child: Icon(
            Icons.my_location_rounded,
            size: 22,
            color: AppColors.serviceParticular,
          ),
        ),
      ),
    );
  }
}

// ── Panel inferior compacto ──────────────────────────────────────────────────

class _BottomPanel extends StatelessWidget {
  const _BottomPanel({required this.scrollController, required this.history});

  final ScrollController scrollController;
  final List<TransportRequestEntity> history;

  static const _panelBg = Color(0xFF1A1D27);
  static const _handleColor = Color(0xFF2E3347);
  static const _subText = Color(0xFF94A3B8);

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: _panelBg,
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
        boxShadow: [
          BoxShadow(
            color: Color(0x55000000),
            blurRadius: 28,
            offset: Offset(0, -6),
          ),
        ],
      ),
      child: ListView(
        controller: scrollController,
        padding: EdgeInsets.zero,
        children: [
          // Handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 10, bottom: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: _handleColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // CTA principal — abre el flujo de solicitud (vehículo + precio ahí)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: GestureDetector(
              onTap: () => context.push(AppRoutes.transportRequest),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 16,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFF252836),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: AppColors.primary.withValues(alpha: 0.55),
                    width: 1.5,
                  ),
                ),
                child: const Row(
                  children: [
                    Icon(
                      Icons.search_rounded,
                      size: 22,
                      color: AppColors.primary,
                    ),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        '¿A dónde vas?',
                        style: TextStyle(
                          fontSize: 16,
                          color: Color(0xFFE2E8F0),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Icon(
                      Icons.arrow_forward_ios_rounded,
                      size: 15,
                      color: _subText,
                    ),
                  ],
                ),
              ),
            ),
          ),

          const SizedBox(height: 8),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Elige tu vehículo y pon tu precio en el siguiente paso.',
              style: TextStyle(fontSize: 11.5, color: _subText),
            ),
          ),
          const SizedBox(height: 16),

          // ── Más servicios (se revela al expandir) ─────────────────────────
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(
              'Más servicios',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: _subText,
                letterSpacing: 0.3,
              ),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: _IntercityCard(),
          ),
          const SizedBox(height: 8),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: _PooledCard(),
          ),
          const SizedBox(height: 8),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: _ErrandCard(),
          ),
          const SizedBox(height: 14),

          // Recientes
          if (history.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Icon(Icons.history_rounded, size: 14, color: _subText),
                  SizedBox(width: 6),
                  Text(
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
            ...history.map((r) => _RecentTile(request: r)),
          ],

          SizedBox(height: MediaQuery.of(context).padding.bottom + 16),
        ],
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
      onTap: () => context.push(AppRoutes.transportTrackingPath(request.id)),
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
              child: const Icon(
                Icons.history_rounded,
                size: 18,
                color: _subText,
              ),
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
            const Icon(Icons.north_west_rounded, size: 17, color: _subText),
          ],
        ),
      ),
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
      onTap: () => context.push(AppRoutes.transportTrackingPath(request.id)),
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
                    style: const TextStyle(color: Colors.white70, fontSize: 11),
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
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(width: 2),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: Colors.white,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Tarjeta intermunicipal ────────────────────────────────────────────────────

class _IntercityCard extends StatelessWidget {
  const _IntercityCard();

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

// ── Tarjeta viajes compartidos ────────────────────────────────────────────────

class _PooledCard extends StatelessWidget {
  const _PooledCard();

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

// ── Banner intermunicipal activo ──────────────────────────────────────────────

class _IntercityActiveBanner extends StatelessWidget {
  const _IntercityActiveBanner({required this.request});

  final IntercityRequestEntity request;

  static const _bg = Color(0xFF1E3A8A);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push(AppRoutes.intercityStatus),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
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
                    '${request.origin.displayName} → '
                    '${request.destination.displayName}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    request.status.label,
                    style: const TextStyle(color: Colors.white70, fontSize: 11),
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
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(width: 2),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: Colors.white,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Tarjeta de mandados ───────────────────────────────────────────────────────

class _ErrandCard extends StatelessWidget {
  const _ErrandCard();

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
                    style: TextStyle(color: Color(0xFFFBBF24), fontSize: 11),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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
                    style: const TextStyle(color: Colors.white70, fontSize: 11),
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
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(width: 2),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: Colors.white,
                ),
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

