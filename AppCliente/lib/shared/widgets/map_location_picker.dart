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
import 'package:nexum_client/core/ubicacion/ubicacion_gate.dart';
import 'package:nexum_client/shared/widgets/google_map_tiles.dart';
import 'package:nexum_client/shared/widgets/map_pin.dart';
import 'package:nexum_client/shared/widgets/punto_usuario.dart';

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
  bool _resolviendo = false;
  bool _ubicando = false;

  /// El texto de la dirección. EDITABLE: Google propone la calle más cercana
  /// al pin, que en un pueblo a menudo no es la de la persona («Pje. la Curia
  /// #6»). Antes solo se podía aceptar o salir; ahora se corrige aquí mismo y
  /// el pin no se mueve.
  final _texto = TextEditingController();

  /// La persona escribió su propia dirección: desde ahí, mover el mapa ya no
  /// se la pisa con la que propone Google.
  bool _editado = false;

  /// Cada consulta lleva su número y solo la ÚLTIMA escribe. Mover el mapa
  /// dos veces seguidas lanza dos consultas, y si la primera responde después
  /// dejaba en pantalla la dirección del punto ANTERIOR — con las coordenadas
  /// del nuevo. Es una de las formas en que salía «la dirección que quería la
  /// app».
  int _consulta = 0;

  /// Hay un movimiento cuya dirección todavía no se resolvió (el respiro de
  /// 600 ms o la consulta en vuelo). Confirmar en ese momento guardaba el
  /// texto del punto viejo con las coordenadas del nuevo.
  bool _pendiente = false;

  /// Dónde está el usuario, para pintarlo. Null mientras no se sepa — y ahí no
  /// se dibuja nada: un punto azul en el centro de Pamplona cuando el GPS no
  /// ha respondido diría que estás en el obelisco, que es justo el fallo que
  /// ya se corrigió en el latido del conductor.
  LatLng? _miPosicion;

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
    _texto.dispose();
    super.dispose();
  }

  /// El texto se resuelve tras un respiro: mover el mapa dispara decenas de
  /// eventos y no vamos a preguntarle a Google en cada píxel.
  void _onMapMoved(MapCamera cam, bool _) {
    _centro = cam.center;
    _pendiente = true;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 600), () {
      unawaited(_resolverDireccion());
    });
  }

  Future<void> _resolverDireccion() async {
    final n = ++_consulta;
    setState(() => _resolviendo = true);
    final texto = await ref
        .read(geoServiceProvider)
        .reverseGeocode(_centro.latitude, _centro.longitude);
    if (!mounted || n != _consulta) return;
    setState(() {
      // Lo que escribió la persona manda: la propuesta de Google solo llena el
      // campo mientras no lo haya tocado.
      if (!_editado) _texto.text = texto ?? '';
      _resolviendo = false;
      _pendiente = false;
    });
  }

  Future<void> _confirmar() async {
    _debounce?.cancel();
    // Si el mapa se movió y su dirección no ha llegado, se espera a la del
    // punto donde quedó el pin — no se guarda la del anterior.
    if (_pendiente && !_editado) await _resolverDireccion();
    if (!mounted) return;
    final texto = _texto.text.trim();
    Navigator.of(context).pop(
      PickedPlace(
        address: texto.isEmpty ? 'Punto en el mapa' : texto,
        lat: _centro.latitude,
        lng: _centro.longitude,
      ),
    );
  }

  Future<void> _irAMiUbicacion({bool silencioso = false}) async {
    setState(() => _ubicando = true);
    try {
      // Silencioso = centrado automático al abrir: solo si el permiso ya
      // está. Con el botón pulsado sí se pide, y `Ubicacion.pedir` enseña
      // antes la divulgación —además de resolver el GPS apagado y el permiso
      // bloqueado, que aquí acababan en un aviso sin salida.
      final hayPermiso = silencioso
          ? await Ubicacion.concedido()
          : mounted && await Ubicacion.pedir(context);
      if (!hayPermiso) {
        if (!silencioso && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Sin ubicación: mueve el mapa hasta el punto exacto.'),
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
      _miPosicion = p;
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
            children: [
              const GoogleMapTiles(),
              // Dónde estás tú. Va DEBAJO del pin del centro en el árbol para
              // que, cuando coincidan, el que elige el punto quede encima.
              if (_miPosicion != null)
                MarkerLayer(
                  markers: [
                    Marker(
                      point: _miPosicion!,
                      width: PuntoUsuario.lado,
                      height: PuntoUsuario.lado,
                      child: const PuntoUsuario(),
                    ),
                  ],
                ),
            ],
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
                    'Dirección (puedes corregirla)',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.4,
                      color: context.textSecondaryColor,
                    ),
                  ),
                  const SizedBox(height: 4),
                  TextField(
                    controller: _texto,
                    minLines: 1,
                    maxLines: 2,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => _editado = true,
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimaryColor,
                    ),
                    decoration: InputDecoration(
                      hintText: _resolviendo
                          ? 'Buscando dirección…'
                          : 'Calle, número, barrio',
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingM),
                  SizedBox(
                    width: double.infinity,
                    height: AppConstants.minTouchTarget + 6,
                    child: FilledButton(
                      onPressed: () => unawaited(_confirmar()),
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
