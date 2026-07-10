import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/errands/domain/entities/errand_entity.dart';
import 'package:nexum_client/features/errands/presentation/providers/errand_provider.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart';
import 'package:nexum_client/features/intercity/presentation/providers/intercity_provider.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';

// Centro de Pamplona, Norte de Santander (misma referencia que el backend).
const _pamplona = LatLng(7.3754, -72.6486);

// ── Pantalla principal ────────────────────────────────────────────────────────

class TransportHomeScreen extends ConsumerStatefulWidget {
  const TransportHomeScreen({super.key});

  @override
  ConsumerState<TransportHomeScreen> createState() =>
      _TransportHomeScreenState();
}

class _TransportHomeScreenState extends ConsumerState<TransportHomeScreen> {
  final _mapController = MapController();
  TransportServiceType _selected = TransportServiceType.transporte;
  Timer? _vehicleTimer;

  // Posiciones REALES (anónimas) de los conductores en línea cercanos,
  // refrescadas del backend. Nada de vehículos simulados en el mapa.
  List<LatLng> _nearby = const [];

  // Tamaños del panel arrastrable (fracción de la pantalla). Colapsado deja
  // visible solo el asa + la barra de búsqueda para poder usar el mapa.
  static const _sheetMin = 0.15;
  static const _sheetInitial = 0.42;
  static const _sheetMax = 0.9;

  @override
  void initState() {
    super.initState();
    _refreshNearby();
    _vehicleTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _refreshNearby(),
    );
  }

  Future<void> _refreshNearby() async {
    try {
      final res = await ref.read(apiClientProvider).get<Map<String, dynamic>>(
        '/client/drivers/nearby',
        queryParameters: {
          'lat': _pamplona.latitude,
          'lng': _pamplona.longitude,
        },
      );
      final data = res.data?['data'] as List<dynamic>? ?? const [];
      if (!mounted) return;
      setState(() {
        _nearby = [
          for (final e in data.cast<Map<String, dynamic>>())
            LatLng(
              (e['lat'] as num).toDouble(),
              (e['lng'] as num).toDouble(),
            ),
        ];
      });
    } catch (_) {
      // Sin red: se conservan las últimas posiciones conocidas.
    }
  }

  @override
  void dispose() {
    _vehicleTimer?.cancel();
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
                  // Conductores en línea reales cercanos (anónimos)
                  ..._nearby.map(
                    (p) => Marker(
                      point: p,
                      width: 44,
                      height: 44,
                      child: _VehicleMarker(type: _selected),
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

          // ── Banner de envío (encargo) activo ─────────────────────────────
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

          // ── Panel inferior arrastrable ───────────────────────────────────
          // DraggableScrollableSheet con snapping: colapsado (solo asa +
          // búsqueda) deja el mapa usable; expandido muestra todo el menú.
          DraggableScrollableSheet(
            minChildSize: _sheetMin,
            initialChildSize: _sheetInitial,
            maxChildSize: _sheetMax,
            snap: true,
            snapSizes: const [_sheetMin, _sheetInitial, _sheetMax],
            builder: (context, scrollController) => _BottomPanel(
              scrollController: scrollController,
              selected: _selected,
              // Conteo real de conductores en línea cercanos (misma flota
              // para los tres servicios en Pamplona).
              driverCounts: {
                TransportServiceType.transporte: _nearby.length,
                TransportServiceType.moto: _nearby.length,
                TransportServiceType.envios: _nearby.length,
              },
              history: state.past.take(3).toList(),
              onServiceTap: (t) => setState(() => _selected = t),
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
            'Tu ubicación',
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
    required this.scrollController,
    required this.selected,
    required this.driverCounts,
    required this.history,
    required this.onServiceTap,
  });

  final ScrollController scrollController;
  final TransportServiceType selected;
  final Map<TransportServiceType, int> driverCounts;
  final List<TransportRequestEntity> history;
  final ValueChanged<TransportServiceType> onServiceTap;

  // Colores fijos dark panel
  static const _panelBg = AppColors.surfaceDark;
  static const _cardBg = AppColors.surfaceVariantDark;
  static const _handleColor = AppColors.outlineDark;
  static const _subText = AppColors.textSecondaryDark;

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
      // El contenido vive dentro del scrollController del sheet: arrastrar
      // el asa o el contenido expande/colapsa el panel con snapping.
      child: ListView(
        controller: scrollController,
        padding: EdgeInsets.zero,
        children: [
          // Handle (asa): indica que el panel se arrastra
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 10, bottom: 8),
              width: 44,
              height: 5,
              decoration: BoxDecoration(
                color: _handleColor,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),

          // Barra de búsqueda / destino: visible incluso colapsado
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: GestureDetector(
              onTap: () {
                // Envíos es el paraguas: paquete punto a punto o un encargo
                // (compra/diligencia, antes "mandados").
                if (selected == TransportServiceType.envios) {
                  _showEnviosOptions(context);
                } else {
                  context.push(AppRoutes.transportBooking, extra: selected);
                }
              },
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

          const SizedBox(height: 12),

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

          const SizedBox(height: 10),

          // Tarjeta "Pon tu precio" (negociación estilo inDriver)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _NegotiateCard(),
          ),

          const SizedBox(height: 8),

          // Bloque hero intermunicipal: lo distintivo de Nexum en la región
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _IntercityHeroCard(),
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
                  const Spacer(),
                  GestureDetector(
                    onTap: () => context.push(AppRoutes.tripHistory),
                    child: const Text(
                      'Ver todo',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary,
                      ),
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

  static const _cardBg = AppColors.surfaceVariantDark;
  static const _borderColor = AppColors.outlineDark;
  static const _subText = AppColors.textSecondaryDark;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(service);
    final bg = isSelected ? color : _cardBg;
    final iconColor = isSelected ? Colors.white : color;
    final labelColor =
        isSelected ? Colors.white : AppColors.textOnDark;

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

  static const _textColor = AppColors.textOnDark;
  static const _subText = AppColors.textSecondaryDark;
  static const _iconBg = AppColors.surfaceVariantDark;

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

// ── Bloque hero intermunicipal ───────────────────────────────────────────────
//
// La propuesta diferencial de Nexum en la región: viajes entre municipios
// privados o con cupos compartidos. Por eso ocupa el lugar protagonista.

class _IntercityHeroCard extends StatelessWidget {
  static const _blue = AppColors.intercityBrand;
  static const _lightBlue = AppColors.intercityAccent;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.intercityBrand, AppColors.intercityBrandDark],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _blue.withValues(alpha: 0.7)),
        boxShadow: [
          BoxShadow(
            color: _blue.withValues(alpha: 0.35),
            blurRadius: 14,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.route_rounded,
                color: _lightBlue,
                size: 22,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Viaja entre municipios',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.liveGreen.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: AppColors.liveGreen.withValues(alpha: 0.5),
                  ),
                ),
                child: const Text(
                  'NUEVO',
                  style: TextStyle(
                    color: AppColors.liveGreenBright,
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Viaja entre ciudades: Cúcuta, Bucaramanga y más',
            style: TextStyle(color: _lightBlue, fontSize: 11.5),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _HeroAction(
                  icon: Icons.directions_car_filled_rounded,
                  label: 'Reservar privado',
                  onTap: () => context.push(AppRoutes.intercityBooking),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _HeroAction(
                  icon: Icons.groups_rounded,
                  label: 'Cupos compartidos',
                  onTap: () => context.push(AppRoutes.pooledSearch),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroAction extends StatelessWidget {
  const _HeroAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 17, color: Colors.white),
              const SizedBox(width: 7),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Tarjeta "Pon tu precio" (negociación inDriver) ────────────────────────────

class _NegotiateCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push(AppRoutes.requestRide),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [AppColors.primary, AppColors.primaryDim],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.local_offer_rounded,
                  color: Colors.white, size: 24),
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Pon tu precio',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Ofrece tu tarifa y los conductores te responden',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios_rounded,
                color: Colors.white, size: 16),
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

  static const _bg = AppColors.intercityBrand;

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

// ── Selector de subtipos de Envíos ────────────────────────────────────────────
//
// "Envíos" cubre tanto el paquete punto a punto como los encargos
// (compra/recogida/diligencia, el motor errands del backend).

void _showEnviosOptions(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surfaceDark,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 44,
                height: 5,
                decoration: BoxDecoration(
                  color: AppColors.outlineDark,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              '¿Qué necesitas enviar?',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 12),
            _EnviosOption(
              icon: Icons.inventory_2_rounded,
              title: 'Enviar un paquete',
              subtitle: 'De una dirección a otra, ya tienes el paquete listo',
              onTap: () {
                Navigator.of(ctx).pop();
                context.push(
                  AppRoutes.transportBooking,
                  extra: TransportServiceType.envios,
                );
              },
            ),
            const SizedBox(height: 10),
            _EnviosOption(
              icon: Icons.shopping_bag_rounded,
              title: 'Compra o diligencia',
              subtitle: 'Farmacia, mercado, pagos, recoger algo por ti...',
              onTap: () {
                Navigator.of(ctx).pop();
                context.push(AppRoutes.errandBooking);
              },
            ),
          ],
        ),
      ),
    ),
  );
}

class _EnviosOption extends StatelessWidget {
  const _EnviosOption({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  static const _cardBg = AppColors.surfaceVariantDark;
  static const _subText = AppColors.textSecondaryDark;

  @override
  Widget build(BuildContext context) {
    final color = AppColors.serviceEnvios;
    return Material(
      color: _cardBg,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withValues(alpha: 0.4)),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(color: _subText, fontSize: 11.5),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                color: _subText,
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Banner de envío (encargo) activo ─────────────────────────────────────────

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
                    'Envío · ${errand.category.label}',
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
