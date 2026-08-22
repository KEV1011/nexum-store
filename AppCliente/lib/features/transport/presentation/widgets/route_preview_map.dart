import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/services/geo_service.dart';
import 'package:nexum_client/shared/widgets/google_map_tiles.dart';
import 'package:nexum_client/shared/widgets/map_pin.dart';

/// Mapa del trayecto ANTES de pedir el viaje: recogida, destino y la ruta.
///
/// El mapa de seguimiento (`_TripMap`) no sirve aquí: aquel se construye a
/// partir de un viaje que ya existe, y en esta pantalla todavía no hay ninguno.
/// Este solo necesita dos puntos.
///
/// Con un solo punto también pinta: mientras la persona escribe el destino ya
/// se ve dónde la van a recoger, que es la mitad de la información y la que más
/// tranquiliza.
class RoutePreviewMap extends ConsumerStatefulWidget {
  const RoutePreviewMap({
    required this.originLat,
    required this.originLng,
    this.destLat,
    this.destLng,
    this.bottomPadding = 0,
    this.etaMinutos,
    super.key,
  });

  final double originLat;
  final double originLng;
  final double? destLat;
  final double? destLng;

  /// Minutos hasta la recogida de la categoría elegida. Se pinta como etiqueta
  /// sobre el punto de recogida, igual que en las demás plataformas. Null =
  /// aún no hay categoría elegida o no hay vehículo cerca: entonces no se pinta
  /// nada, que es mejor que una etiqueta con un número de relleno.
  final int? etaMinutos;

  /// Alto que tapa la hoja arrastrable. El encuadre deja ese hueco libre para
  /// que el trayecto no quede escondido detrás del panel.
  final double bottomPadding;

  @override
  ConsumerState<RoutePreviewMap> createState() => _RoutePreviewMapState();
}

class _RoutePreviewMapState extends ConsumerState<RoutePreviewMap> {
  final MapController _mapa = MapController();

  /// Ruta real por las calles. Null = sin llave de Google en el proxy, y
  /// entonces se dibuja la recta: es una aproximación, pero honesta —el precio
  /// que acompaña también avisa de que es aproximado.
  List<LatLng>? _ruta;

  /// Trayecto para el que se pidió `_ruta`, para no volver a pedirla en cada
  /// repintado ni quedarse con la de un destino anterior.
  String? _rutaDe;

  @override
  void initState() {
    super.initState();
    _cargarRuta();
  }

  @override
  void didUpdateWidget(RoutePreviewMap old) {
    super.didUpdateWidget(old);
    if (old.originLat != widget.originLat ||
        old.originLng != widget.originLng ||
        old.destLat != widget.destLat ||
        old.destLng != widget.destLng) {
      _cargarRuta();
      _encuadrar();
    }
  }

  String get _clave =>
      '${widget.originLat},${widget.originLng}>${widget.destLat},${widget.destLng}';

  Future<void> _cargarRuta() async {
    final destLat = widget.destLat;
    final destLng = widget.destLng;
    if (destLat == null || destLng == null) {
      if (mounted) setState(() { _ruta = null; _rutaDe = null; });
      return;
    }
    final clave = _clave;
    if (_rutaDe == clave) return;
    final puntos = await ref.read(geoServiceProvider).routePoints(
          originLat: widget.originLat,
          originLng: widget.originLng,
          destLat: destLat,
          destLng: destLng,
        );
    if (!mounted || _clave != clave) return;
    setState(() { _ruta = puntos; _rutaDe = clave; });
  }

  LatLng get _origen => LatLng(widget.originLat, widget.originLng);
  LatLng? get _destino => (widget.destLat != null && widget.destLng != null)
      ? LatLng(widget.destLat!, widget.destLng!)
      : null;

  List<LatLng> get _puntos {
    final d = _destino;
    return d == null ? [_origen] : [_origen, d];
  }

  /// El dedo movió el mapa: aparece el botón de reencuadrar.
  bool _movido = false;

  /// Alto real del mapa, medido por el LayoutBuilder. Se recuerda porque el
  /// reencuadre manual ocurre fuera de él y también necesita acotar el margen.
  double _altoMapa = 0;

  void _encuadrar() {
    // Tras el frame: el mapa tiene que existir y tener tamaño para encuadrar.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final pts = _puntos;
      try {
        if (pts.length == 1) {
          _mapa.move(pts.first, 15.5);
        } else {
          _mapa.fitCamera(
            CameraFit.coordinates(
              coordinates: pts,
              // Más margen abajo: ahí está la hoja con las categorías.
              padding: EdgeInsets.fromLTRB(48, 64, 48, 48 + _margenInferior(_altoMapa)),
              maxZoom: 17,
            ),
          );
        }
      } catch (_) {
        // El mapa aún no está montado: el encuadre inicial de MapOptions ya
        // deja la cámara bien, así que no hay nada que rescatar.
      }
    });
  }

  /// Margen inferior REAL para el encuadre. La hoja puede llegar a tapar el
  /// 92 % de la pantalla; si ese número se pasara tal cual, el hueco libre para
  /// dibujar sería casi cero y el encuadre saldría absurdo o reventaría.
  double _margenInferior(double altoDisponible) {
    final tope = altoDisponible * 0.45;
    return widget.bottomPadding.clamp(0.0, tope);
  }

  @override
  Widget build(BuildContext context) {
    final pts = _puntos;
    final destino = _destino;

    return LayoutBuilder(
      builder: (context, restricciones) {
        _altoMapa = restricciones.maxHeight;
        return _construirMapa(
          pts,
          destino,
          _margenInferior(restricciones.maxHeight),
        );
      },
    );
  }

  Widget _construirMapa(List<LatLng> pts, LatLng? destino, double margenAbajo) {
    return Stack(
      children: [
        Positioned.fill(child: _flutterMap(pts, destino, margenAbajo)),
        // Reencuadrar el trayecto. Aparece solo cuando el dedo movió el mapa:
        // si la cámara ya está donde debe, el botón no haría nada y solo
        // taparía calles.
        if (_movido)
          Positioned(
            right: 12,
            top: MediaQuery.of(context).padding.top + 60,
            child: Material(
              color: Theme.of(context).colorScheme.surface,
              shape: const CircleBorder(),
              elevation: 3,
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () {
                  setState(() => _movido = false);
                  _encuadrar();
                },
                child: const Padding(
                  padding: EdgeInsets.all(10),
                  child: Icon(Icons.my_location_rounded, size: 20),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _flutterMap(List<LatLng> pts, LatLng? destino, double margenAbajo) {
    return FlutterMap(
      mapController: _mapa,
      options: MapOptions(
        initialCenter: _origen,
        initialZoom: 15,
        initialCameraFit: pts.length > 1
            ? CameraFit.coordinates(
                coordinates: pts,
                padding: EdgeInsets.fromLTRB(48, 64, 48, 48 + margenAbajo),
                maxZoom: 17,
              )
            : null,
        // `hasGesture` distingue el dedo de la persona de los movimientos que
        // hace la propia app al encuadrar.
        onPositionChanged: (_, hasGesture) {
          if (hasGesture && !_movido) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) setState(() => _movido = true);
            });
          }
        },
        interactionOptions: const InteractionOptions(
          flags: InteractiveFlag.pinchZoom |
              InteractiveFlag.drag |
              InteractiveFlag.doubleTapZoom |
              InteractiveFlag.flingAnimation,
        ),
      ),
      children: [
        const GoogleMapTiles(),
        if (destino != null)
          PolylineLayer(
            polylines: [
              Polyline(
                points: _ruta ?? [_origen, destino],
                color: AppColors.routeColor,
                strokeWidth: 6.5,
                strokeCap: StrokeCap.round,
                strokeJoin: StrokeJoin.round,
              ),
            ],
          ),
        MarkerLayer(
          markers: [
            // Recogida: punto sólido. La gota con punta se reserva al destino,
            // que es a donde hay que llegar.
            Marker(
              point: _origen,
              width: 22,
              height: 22,
              child: const _PuntoRecogida(),
            ),
            if (widget.etaMinutos != null)
              Marker(
                point: _origen,
                width: 78,
                height: 30,
                // Anclada por abajo: la etiqueta queda ENCIMA del punto, sin
                // taparlo.
                alignment: Alignment.topCenter,
                child: _EtiquetaEta(minutos: widget.etaMinutos!),
              ),
            if (destino != null)
              Marker(
                point: destino,
                width: MapPin.markerWidth,
                height: MapPin.markerHeight,
                alignment: Alignment.topCenter,
                child: const MapPin(
                  color: AppColors.destinationMarker,
                  icon: Icons.flag_rounded,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// "5 min" sobre el punto de recogida.
class _EtiquetaEta extends StatelessWidget {
  const _EtiquetaEta({required this.minutos});

  final int minutos;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.textPrimary,
          borderRadius: BorderRadius.circular(8),
          boxShadow: const [BoxShadow(color: AppColors.shadow, blurRadius: 5)],
        ),
        child: Text(
          '$minutos min',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _PuntoRecogida extends StatelessWidget {
  const _PuntoRecogida();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 16,
        height: 16,
        decoration: BoxDecoration(
          color: AppColors.textPrimary,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 3),
          boxShadow: const [BoxShadow(color: AppColors.shadow, blurRadius: 4)],
        ),
      ),
    );
  }
}
