import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/location/location_service.dart';
import 'package:nexum_client/core/location/maps_service.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/ride_negotiation/presentation/providers/ride_negotiation_provider.dart';
import 'package:nexum_client/features/ride_negotiation/presentation/screens/ride_bids_screen.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/widgets/place_search_sheet.dart';

/// Flujo de solicitud estilo inDrive: el mapa es protagonista, y el cliente
/// elige destino, vehículo y **pone su precio** aquí — no en la pantalla home.
class RideRequestScreen extends ConsumerStatefulWidget {
  const RideRequestScreen({this.initialService, super.key});

  final TransportServiceType? initialService;

  @override
  ConsumerState<RideRequestScreen> createState() => _RideRequestScreenState();
}

class _RideRequestScreenState extends ConsumerState<RideRequestScreen> {
  final MapController _map = MapController();
  final _originCtrl = TextEditingController();
  final _destCtrl = TextEditingController();
  final _fareCtrl = TextEditingController();

  late TransportServiceType _service;
  LatLng _origin = kPamplonaCenter;
  LatLng? _destination;
  RouteResult? _route;
  bool _routeLoading = false;
  bool _fareTouched = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _service = widget.initialService ?? TransportServiceType.transporte;
    _originCtrl.text = 'Mi ubicación';
    _resolveOrigin();
  }

  @override
  void dispose() {
    _originCtrl.dispose();
    _destCtrl.dispose();
    _fareCtrl.dispose();
    _map.dispose();
    super.dispose();
  }

  Future<void> _resolveOrigin() async {
    final loc = await ref.read(locationServiceProvider).current();
    if (!mounted) return;
    setState(() => _origin = loc.position);
    _map.move(loc.position, 15.5);
    if (_destination != null) _fetchRoute();
  }

  /// Pide al backend la ruta real (siguiendo calles) y ajusta la cámara.
  Future<void> _fetchRoute() async {
    final dest = _destination;
    if (dest == null) return;
    setState(() => _routeLoading = true);
    final result = await ref.read(mapsServiceProvider).route(_origin, dest);
    if (!mounted) return;
    setState(() {
      _route = result;
      _routeLoading = false;
    });
    _syncSuggested();
    _fitToRoute();
  }

  void _fitToRoute() {
    final dest = _destination;
    if (dest == null) return;
    final pts = _route?.points ?? [_origin, dest];
    var minLat = pts.first.latitude, maxLat = pts.first.latitude;
    var minLng = pts.first.longitude, maxLng = pts.first.longitude;
    for (final p in pts) {
      minLat = p.latitude < minLat ? p.latitude : minLat;
      maxLat = p.latitude > maxLat ? p.latitude : maxLat;
      minLng = p.longitude < minLng ? p.longitude : minLng;
      maxLng = p.longitude > maxLng ? p.longitude : maxLng;
    }
    _map.fitCamera(
      CameraFit.bounds(
        bounds: LatLngBounds(
          LatLng(minLat - 0.003, minLng - 0.003),
          LatLng(maxLat + 0.003, maxLng + 0.003),
        ),
        padding: const EdgeInsets.all(70),
      ),
    );
  }

  // ── Cálculos ────────────────────────────────────────────────────────────────

  double get _distanceKm {
    // Prefiere la distancia real de la ruta; cae a la geodésica si no hay ruta.
    final route = _route;
    if (route != null) return route.distanceKm;
    final dest = _destination;
    if (dest == null) return 0;
    final meters = Geolocator.distanceBetween(
      _origin.latitude,
      _origin.longitude,
      dest.latitude,
      dest.longitude,
    );
    return meters / 1000;
  }

  int get _eta =>
      _route?.durationMinutes ?? (_distanceKm * 2.5 + 3).round().clamp(3, 600);

  double get _suggestedFare {
    final raw = _service.estimateFare(_distanceKm.clamp(1, 60));
    return (raw / 500).round() * 500;
  }

  void _syncSuggested() {
    if (!_fareTouched) {
      _fareCtrl.text = _suggestedFare.toStringAsFixed(0);
    }
  }

  // ── Interacción con el mapa ───────────────────────────────────────────────────

  void _setDestination(LatLng p) {
    setState(() {
      _destination = p;
      _route = null;
      if (_destCtrl.text.trim().isEmpty) {
        _destCtrl.text = 'Punto en el mapa';
      }
    });
    _syncSuggested();
    _fetchRoute();
  }

  /// Abre el buscador de direcciones para fijar el destino.
  Future<void> _pickDestination() async {
    final detail = await showPlaceSearch(
      context,
      title: 'Destino',
      bias: _origin,
    );
    if (detail == null || !mounted) return;
    setState(() {
      _destination = detail.position;
      _destCtrl.text = detail.address;
      _route = null;
    });
    _map.move(detail.position, 15.5);
    _syncSuggested();
    _fetchRoute();
  }

  /// Abre el buscador de direcciones para cambiar el origen.
  Future<void> _pickOrigin() async {
    final detail = await showPlaceSearch(
      context,
      title: 'Origen',
      bias: _origin,
    );
    if (detail == null || !mounted) return;
    setState(() {
      _origin = detail.position;
      _originCtrl.text = detail.address;
      _route = null;
    });
    _map.move(detail.position, 15.5);
    if (_destination != null) _fetchRoute();
  }

  void _bumpFare(double delta) {
    _fareTouched = true;
    final current =
        double.tryParse(_fareCtrl.text.replaceAll(RegExp(r'[^0-9.]'), '')) ?? 0;
    final next = (current + delta).clamp(0, 9999999).toDouble();
    setState(() => _fareCtrl.text = next.toStringAsFixed(0));
  }

  Future<void> _submit() async {
    final dest = _destination;
    if (dest == null) {
      _toast('Toca el mapa para marcar tu destino.');
      return;
    }
    final fare = double.tryParse(
      _fareCtrl.text.replaceAll(RegExp(r'[^0-9.]'), ''),
    );
    if (fare == null || fare <= 0) {
      _toast('Ingresa una tarifa válida.');
      return;
    }

    setState(() => _submitting = true);
    final error = await ref
        .read(rideNegotiationProvider.notifier)
        .createRide(
          serviceType: _service.name,
          originAddress: _originCtrl.text.trim().isEmpty
              ? 'Mi ubicación'
              : _originCtrl.text.trim(),
          destinationAddress: _destCtrl.text.trim().isEmpty
              ? 'Punto en el mapa'
              : _destCtrl.text.trim(),
          offeredFare: fare,
          distanceKm: _distanceKm,
          etaMinutes: _eta,
        );

    if (!mounted) return;
    setState(() => _submitting = false);
    if (error != null) {
      _toast(error);
      return;
    }
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const RideBidsScreen()));
  }

  void _toast(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  // ── UI ────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final dest = _destination;
    final color = _colorOf(_service);

    final route = _route;

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      body: Stack(
        children: [
          FlutterMap(
            mapController: _map,
            options: MapOptions(
              initialCenter: _origin,
              initialZoom: 15,
              onTap: (_, point) => _setDestination(point),
            ),
            children: [
              TileLayer(
                urlTemplate:
                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.nexum.nexum_client',
              ),
              PolylineLayer(
                polylines: [
                  if (route != null)
                    Polyline(
                      points: route.points,
                      color: color,
                      strokeWidth: 5,
                    )
                  else if (dest != null)
                    Polyline(
                      points: [_origin, dest],
                      color: color.withValues(alpha: 0.5),
                      strokeWidth: 4,
                    ),
                ],
              ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: _origin,
                    width: 32,
                    height: 32,
                    alignment: Alignment.bottomCenter,
                    child: const Icon(
                      Icons.location_on,
                      color: Colors.green,
                      size: 32,
                    ),
                  ),
                  if (dest != null)
                    Marker(
                      point: dest,
                      width: 32,
                      height: 32,
                      alignment: Alignment.bottomCenter,
                      child: const Icon(
                        Icons.location_on,
                        color: Colors.red,
                        size: 32,
                      ),
                    ),
                ],
              ),
            ],
          ),

          // Botón volver
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            child: _CircleBtn(
              icon: Icons.arrow_back_rounded,
              onTap: () => Navigator.of(context).maybePop(),
            ),
          ),

          // Pista cuando aún no hay destino
          if (dest == null)
            Positioned(
              top: MediaQuery.of(context).padding.top + 12,
              left: 64,
              right: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.75),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Text(
                  'Toca el mapa para marcar tu destino',
                  style: TextStyle(color: Colors.white, fontSize: 13),
                ),
              ),
            ),

          // Panel inferior con vehículo + precio
          Align(
            alignment: Alignment.bottomCenter,
            child: _RequestPanel(
              service: _service,
              onServiceChanged: (s) {
                setState(() => _service = s);
                _syncSuggested();
              },
              originCtrl: _originCtrl,
              destCtrl: _destCtrl,
              fareCtrl: _fareCtrl,
              hasDestination: dest != null,
              distanceKm: _distanceKm,
              eta: _eta,
              suggestedFare: _suggestedFare,
              routeLoading: _routeLoading,
              submitting: _submitting,
              onPickOrigin: _pickOrigin,
              onPickDestination: _pickDestination,
              onFareEdited: () => _fareTouched = true,
              onResetFare: () {
                _fareTouched = false;
                _syncSuggested();
                setState(() {});
              },
              onBump: _bumpFare,
              onSubmit: _submit,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Panel de solicitud ──────────────────────────────────────────────────────────

class _RequestPanel extends StatelessWidget {
  const _RequestPanel({
    required this.service,
    required this.onServiceChanged,
    required this.originCtrl,
    required this.destCtrl,
    required this.fareCtrl,
    required this.hasDestination,
    required this.distanceKm,
    required this.eta,
    required this.suggestedFare,
    required this.routeLoading,
    required this.submitting,
    required this.onPickOrigin,
    required this.onPickDestination,
    required this.onFareEdited,
    required this.onResetFare,
    required this.onBump,
    required this.onSubmit,
  });

  final TransportServiceType service;
  final ValueChanged<TransportServiceType> onServiceChanged;
  final TextEditingController originCtrl;
  final TextEditingController destCtrl;
  final TextEditingController fareCtrl;
  final bool hasDestination;
  final double distanceKm;
  final int eta;
  final double suggestedFare;
  final bool routeLoading;
  final bool submitting;
  final VoidCallback onPickOrigin;
  final VoidCallback onPickDestination;
  final VoidCallback onFareEdited;
  final VoidCallback onResetFare;
  final ValueChanged<double> onBump;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(service);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        16 + MediaQuery.of(context).padding.bottom + bottomInset,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 24,
            offset: Offset(0, -6),
          ),
        ],
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: AppColors.outlineLight,
                borderRadius: BorderRadius.circular(2),
              ),
            ),

            // Selección de vehículo (vive aquí, en el flujo de solicitud)
            Row(
              children: [
                for (final s in TransportServiceType.values) ...[
                  Expanded(
                    child: _VehicleChip(
                      service: s,
                      selected: s == service,
                      onTap: () => onServiceChanged(s),
                    ),
                  ),
                  if (s != TransportServiceType.values.last)
                    const SizedBox(width: 8),
                ],
              ],
            ),
            const SizedBox(height: 14),

            // Origen / destino (toca para buscar con autocompletado)
            _AddrRow(
              icon: Icons.trip_origin_rounded,
              iconColor: AppColors.primary,
              controller: originCtrl,
              hint: 'Origen',
              onTap: onPickOrigin,
            ),
            const Divider(height: 14),
            _AddrRow(
              icon: Icons.place_rounded,
              iconColor: AppColors.error,
              controller: destCtrl,
              hint: 'Buscar destino o tocar el mapa',
              onTap: onPickDestination,
            ),
            const SizedBox(height: 14),

            // Pon tu precio
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.backgroundLight,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Text(
                        'Pon tu precio',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                      const Spacer(),
                      if (routeLoading)
                        const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            SizedBox(
                              width: 11,
                              height: 11,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            SizedBox(width: 6),
                            Text(
                              'Calculando ruta…',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ],
                        )
                      else if (hasDestination)
                        Text(
                          '${distanceKm.toStringAsFixed(1)} km · $eta min',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _StepBtn(
                        icon: Icons.remove_rounded,
                        onTap: () => onBump(-500),
                      ),
                      Expanded(
                        child: TextField(
                          controller: fareCtrl,
                          textAlign: TextAlign.center,
                          keyboardType: TextInputType.number,
                          onChanged: (_) => onFareEdited(),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(RegExp(r'[0-9]')),
                          ],
                          style: TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w900,
                            color: color,
                          ),
                          decoration: const InputDecoration(
                            prefixText: r'$ ',
                            border: InputBorder.none,
                          ),
                        ),
                      ),
                      _StepBtn(
                        icon: Icons.add_rounded,
                        onTap: () => onBump(500),
                      ),
                    ],
                  ),
                  Center(
                    child: TextButton(
                      onPressed: onResetFare,
                      child: Text(
                        'Sugerido: ${CurrencyFormatter.format(suggestedFare)}',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            SizedBox(
              width: double.infinity,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: color,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                onPressed: submitting ? null : onSubmit,
                child: submitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'Buscar conductor',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
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

// ── Sub-widgets ─────────────────────────────────────────────────────────────────

class _VehicleChip extends StatelessWidget {
  const _VehicleChip({
    required this.service,
    required this.selected,
    required this.onTap,
  });

  final TransportServiceType service;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(service);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: selected ? color : AppColors.backgroundLight,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: selected ? color : AppColors.outlineLight),
        ),
        child: Column(
          children: [
            Icon(
              _iconOf(service),
              size: 26,
              color: selected ? Colors.white : color,
            ),
            const SizedBox(height: 6),
            Text(
              service.label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : AppColors.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AddrRow extends StatelessWidget {
  const _AddrRow({
    required this.icon,
    required this.iconColor,
    required this.controller,
    required this.hint,
    required this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final TextEditingController controller;
  final String hint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Icon(icon, color: iconColor, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: ValueListenableBuilder<TextEditingValue>(
                valueListenable: controller,
                builder: (_, value, __) {
                  final hasText = value.text.trim().isNotEmpty;
                  return Text(
                    hasText ? value.text : hint,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      color: hasText
                          ? AppColors.textPrimary
                          : AppColors.textTertiary,
                      fontWeight: hasText ? FontWeight.w500 : FontWeight.w400,
                    ),
                  );
                },
              ),
            ),
            const Icon(
              Icons.search_rounded,
              size: 18,
              color: AppColors.textTertiary,
            ),
          ],
        ),
      ),
    );
  }
}

class _StepBtn extends StatelessWidget {
  const _StepBtn({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: const BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: Color(0x22000000), blurRadius: 6)],
        ),
        child: Icon(icon, color: AppColors.textPrimary),
      ),
    );
  }
}

class _CircleBtn extends StatelessWidget {
  const _CircleBtn({required this.icon, required this.onTap});

  final IconData icon;
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
        child: Padding(
          padding: const EdgeInsets.all(9),
          child: Icon(icon, color: AppColors.textPrimary, size: 22),
        ),
      ),
    );
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

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
