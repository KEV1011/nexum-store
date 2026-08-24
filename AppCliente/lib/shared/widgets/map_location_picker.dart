import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/services/geo_service.dart';
import 'package:nexum_client/shared/widgets/google_map_tiles.dart';
import 'package:nexum_client/shared/widgets/map_pin.dart';

/// Dirección elegida en el mapa: texto + coordenadas.
class PickedPlace {
  const PickedPlace({required this.address, required this.lat, required this.lng});

  final String address;
  final double lat;
  final double lng;
}

/// Selector de dirección sobre el mapa: "mueve el pin y confirma".
///
/// Escribir la dirección a mano falla mucho más de lo que parece — el cliente
/// pone "cerca del parque" y el repartidor no encuentra nada. Aquí el punto es
/// exacto por construcción, y el texto se resuelve por geocodificación inversa
/// para que la persona reconozca dónde marcó.
///
/// Sin GOOGLE_MAPS_API_KEY en el servidor los tiles caen a OpenStreetMap y la
/// dirección no se resuelve: se devuelve el punto con un texto genérico, que
/// sigue siendo mejor que nada porque las coordenadas son lo que importa.
class MapLocationPicker extends ConsumerStatefulWidget {
  const MapLocationPicker({
    required this.title,
    this.initial,
    super.key,
  });

  final String title;
  final LatLng? initial;

  /// Abre el selector a pantalla completa y devuelve lo elegido (o null).
  static Future<PickedPlace?> show(
    BuildContext context, {
    required String title,
    LatLng? initial,
  }) {
    return Navigator.of(context).push<PickedPlace>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => MapLocationPicker(title: title, initial: initial),
      ),
    );
  }

  @override
  ConsumerState<MapLocationPicker> createState() => _MapLocationPickerState();
}

class _MapLocationPickerState extends ConsumerState<MapLocationPicker> {
  // Centro de Pamplona: solo el encuadre inicial cuando no hay nada mejor.
  static const _fallback = LatLng(7.3754, -72.6486);

  final _map = MapController();
  Timer? _debounce;
  LatLng _centro = _fallback;
  String _direccion = '';
  bool _resolviendo = false;
  bool _ubicando = false;

  @override
  void initState() {
    super.initState();
    _centro = widget.initial ?? _fallback;
    if (widget.initial == null) unawaited(_irAMiUbicacion(silencioso: true));
    unawaited(_resolverDireccion());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  /// El texto se resuelve tras un respiro: mover el mapa dispara decenas de
  /// eventos y no vamos a preguntarle a Google en cada píxel.
  void _onMapMoved(MapCamera cam, bool _) {
    _centro = cam.center;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 600), () {
      unawaited(_resolverDireccion());
    });
  }

  Future<void> _resolverDireccion() async {
    setState(() => _resolviendo = true);
    final texto = await ref
        .read(geoServiceProvider)
        .reverseGeocode(_centro.latitude, _centro.longitude);
    if (!mounted) return;
    setState(() {
      _direccion = texto ?? '';
      _resolviendo = false;
    });
  }

  Future<void> _irAMiUbicacion({bool silencioso = false}) async {
    setState(() => _ubicando = true);
    try {
      var permiso = await Geolocator.checkPermission();
      if (permiso == LocationPermission.denied) {
        permiso = await Geolocator.requestPermission();
      }
      if (permiso == LocationPermission.denied ||
          permiso == LocationPermission.deniedForever) {
        if (!silencioso && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Activa el permiso de ubicación o mueve el mapa a mano.'),
            ),
          );
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      ).timeout(const Duration(seconds: 8));
      if (!mounted) return;
      final p = LatLng(pos.latitude, pos.longitude);
      _centro = p;
      _map.move(p, 17);
      await _resolverDireccion();
    } catch (_) {
      // Sin GPS se sigue pudiendo mover el mapa: no es un error que bloquee.
    } finally {
      if (mounted) setState(() => _ubicando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.surfaceColor,
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: context.surfaceColor,
        elevation: 0,
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _map,
            options: MapOptions(
              backgroundColor: mapaFondoOscuro,
              initialCenter: _centro,
              initialZoom: 16.5,
              onPositionChanged: _onMapMoved,
            ),
            children: const [GoogleMapTiles()],
          ),

          // Pin fijo al centro: se mueve el mapa, no el pin. Es el gesto que
          // ya conocen de Uber, DiDi y Rappi.
          IgnorePointer(
            child: Center(
              child: Transform.translate(
                offset: const Offset(0, -MapPin.markerHeight / 2),
                child: const MapPin(
                  color: AppColors.primary,
                  icon: Icons.place_rounded,
                ),
              ),
            ),
          ),

          Positioned(
            right: AppConstants.spacingM,
            bottom: 168,
            child: FloatingActionButton.small(
              heroTag: 'picker-gps',
              onPressed: _ubicando ? null : () => unawaited(_irAMiUbicacion()),
              backgroundColor: context.surfaceColor,
              child: _ubicando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(Icons.my_location, color: context.textPrimaryColor),
            ),
          ),

          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(
                AppConstants.spacingL,
                AppConstants.spacingL,
                AppConstants.spacingL,
                AppConstants.spacingXL,
              ),
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(AppConstants.radiusLarge),
                ),
                boxShadow: const [
                  BoxShadow(color: Color(0x22000000), blurRadius: 16, offset: Offset(0, -4)),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Dirección seleccionada',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.4,
                      color: context.textSecondaryColor,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _resolviendo
                        ? 'Buscando dirección…'
                        : (_direccion.isEmpty ? 'Punto marcado en el mapa' : _direccion),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimaryColor,
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingM),
                  SizedBox(
                    width: double.infinity,
                    height: AppConstants.minTouchTarget + 6,
                    child: FilledButton(
                      onPressed: () => Navigator.of(context).pop(
                        PickedPlace(
                          address: _direccion.isEmpty
                              ? 'Punto en el mapa'
                              : _direccion,
                          lat: _centro.latitude,
                          lng: _centro.longitude,
                        ),
                      ),
                      child: const Text('Confirmar esta dirección'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
